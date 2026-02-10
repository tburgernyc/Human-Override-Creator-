
import React, { useState, useRef, useEffect } from 'react';
import { ProjectState, ChatMessage } from '../types';
import { handleDirectorChat, triggerApiKeySelection } from '../services/gemini';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from '@google/genai';
import { LiveWaveform } from './LiveWaveform';

interface DirectorAssistantProps {
  project: ProjectState;
  onUpdateProject: (updates: Partial<ProjectState>) => void;
  onExecuteTool: (name: string, args: any) => Promise<any>;
  autoTriggerDiagnosis?: boolean;
}

const QUICK_COMMANDS = [
    { label: "Synthesize B-Roll", prompt: "Analyze my script and suggest 3 B-Roll scenes to add variety." },
    { label: "Audit Script", prompt: "Review my current script for pacing and narrative flow. Give me a quick diagnosis." },
    { label: "Enhance Visuals", prompt: "Give me more cinematic visual prompt ideas for my scenes based on the current style." },
    { label: "Sync Cast", prompt: "Check if my character descriptions are consistent across all scene prompts." }
];

const DIRECTORIAL_TOOLS: FunctionDeclaration[] = [
  { name: 'update_scene', description: 'Update a specific scene by ID.', parameters: { type: Type.OBJECT, properties: { scene_id: { type: Type.NUMBER }, updates: { type: Type.OBJECT, properties: { visualPrompt: { type: Type.STRING }, description: { type: Type.STRING }, musicMood: { type: Type.STRING } } } }, required: ['scene_id', 'updates'] } },
  { name: 'add_character', description: 'Create a new character in the project.', parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, gender: { type: Type.STRING, enum: ['Male', 'Female'] } }, required: ['name', 'description', 'gender'] } },
  { name: 'suggest_b_roll', description: 'Suggest b-roll scenes for the project.', parameters: { type: Type.OBJECT, properties: {} } }
];

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const DirectorAssistant: React.FC<DirectorAssistantProps> = ({ 
  project, 
  onUpdateProject, 
  onExecuteTool,
  autoTriggerDiagnosis 
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', content: "OverrideBot operational. Sequence diagnosis clear. Ready for directorial commands." }
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (autoTriggerDiagnosis) {
      handleSubmit(undefined, "Perform an initial sequence diagnosis of the newly analyzed script. Structure it as per the OverrideBot protocol.");
    }
  }, [autoTriggerDiagnosis]);

  const handleSubmit = async (e?: React.FormEvent, customInput?: string) => {
    if (e) e.preventDefault();
    const messageToSend = customInput || input;
    if (!messageToSend.trim() || isThinking) return;

    const userMsg: ChatMessage = { role: 'user', content: messageToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    try {
      const history = messages.map(m => ({ role: m.role as any, content: m.content }));
      const response = await handleDirectorChat(messageToSend, project, history);
      
      if (response.functionCalls) {
        for (const fc of response.functionCalls) {
          const result = await onExecuteTool(fc.name, fc.args);
          // Optional: Add hidden result message or log
        }
      }

      setMessages(prev => [...prev, { role: 'model', content: response.text || "Command executed. Project manifest updated." }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'system', content: "SIGNAL BREAK: Interference detected in directorial uplink." }]);
    } finally {
      setIsThinking(false);
    }
  };

  const toggleLiveMode = async () => {
    if (isLive) {
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
      micStream?.getTracks().forEach(t => t.stop());
      setMicStream(null);
      setIsLive(false);
      return;
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      await triggerApiKeySelection();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      setIsLive(true);
      
      setMessages(prev => [...prev, { role: 'system', content: "Initializing Live Multi-Modal Directorial Interface..." }]);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const outputNode = outputAudioContext.createGain();
      outputNode.connect(outputAudioContext.destination);
      
      let nextStartTime = 0;
      const sources = new Set<AudioBufferSourceNode>();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const base64 = encode(new Uint8Array(int16.buffer));
              sessionPromise.then(s => s.sendRealtimeInput({ 
                media: { data: base64, mimeType: 'audio/pcm;rate=16000' } 
              }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                const result = await onExecuteTool(fc.name, fc.args);
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result } }
                }));
              }
            }

            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
              const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
              const src = outputAudioContext.createBufferSource();
              src.buffer = audioBuffer;
              src.connect(outputNode);
              src.start(nextStartTime);
              nextStartTime += audioBuffer.duration;
              sources.add(src);
              src.onended = () => sources.delete(src);
            }
            if (msg.serverContent?.interrupted) {
              sources.forEach(s => s.stop());
              sources.clear();
              nextStartTime = 0;
            }
          },
          onclose: () => { setIsLive(false); setMicStream(null); },
          onerror: () => { setIsLive(false); setMicStream(null); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are the Director. Assist the producer with script edits and character consistency. Professional and authoritative. You can update scenes and add characters.",
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          tools: [{ functionDeclarations: DIRECTORIAL_TOOLS }]
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
      setIsLive(false);
      setMessages(prev => [...prev, { role: 'system', content: "Microphone Access Denied. Live Link Broken." }]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-eclipse-black font-mono rounded-[2rem] nm-panel overflow-hidden border border-white/5">
      <div className="p-6 nm-button rounded-t-[2rem] flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-solar-amber shadow-[0_0_10px_#ef4444]' : 'bg-luna-gold'} animate-pulse`}></div>
          <div>
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Directorial Uplink</h3>
            {isLive && <LiveWaveform stream={micStream} isActive={isLive} color="#ef4444" />}
          </div>
        </div>
        <button 
            onClick={toggleLiveMode}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${isLive ? 'bg-solar-amber/20 border-solar-amber text-solar-amber shadow-lg shadow-solar-amber/10' : 'nm-button border-white/10 text-mystic-gray hover:text-white'}`}
        >
            {isLive ? <><i className="fa-solid fa-microphone-slash mr-1"></i> End Session</> : <><i className="fa-solid fa-microphone mr-1"></i> Start Live</>}
        </button>
      </div>

      <div className="px-6 py-4 bg-black/10 border-b border-white/5 overflow-x-auto scrollbar-hide flex gap-3">
          {QUICK_COMMANDS.map((cmd) => (
              <button 
                  key={cmd.label}
                  onClick={() => handleSubmit(undefined, cmd.prompt)}
                  disabled={isThinking || isLive}
                  className="flex-shrink-0 px-4 py-2 nm-button rounded-full text-[8px] font-bold text-celestial-stone hover:text-luna-gold transition-all uppercase tracking-widest border border-white/5 disabled:opacity-30"
              >
                  {cmd.label}
              </button>
          ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide bg-black/20">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`
              max-w-[90%] p-5 rounded-2xl text-[11px] leading-relaxed shadow-sm
              ${m.role === 'user' 
                ? 'nm-button-gold text-white rounded-tr-none' 
                : m.role === 'system' 
                  ? 'nm-inset-input text-solar-amber border border-solar-amber/10 italic font-mono opacity-80' 
                  : 'nm-button text-starlight border border-white/5 rounded-tl-none'
              }
            `}>
              {m.content}
            </div>
            <span className="text-[8px] text-mystic-gray mt-2 uppercase tracking-widest font-bold opacity-30 px-2">
              {m.role === 'model' ? 'OverrideBot' : m.role === 'user' ? 'Producer' : 'System'}
            </span>
          </div>
        ))}
        {isThinking && (
          <div className="flex flex-col items-start animate-pulse">
             <div className="nm-button p-5 rounded-2xl rounded-tl-none border border-white/5 flex gap-2 items-center">
                <div className="w-1.5 h-1.5 bg-luna-gold rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-luna-gold rounded-full animate-bounce [animation-delay:-0.1s]"></div>
                <div className="w-1.5 h-1.5 bg-luna-gold rounded-full animate-bounce [animation-delay:-0.2s]"></div>
             </div>
          </div>
        )}
      </div>

      <form onSubmit={(e) => handleSubmit(e)} className="p-6 nm-button rounded-b-[2rem] border-t border-white/5">
        <div className="relative group">
          <input 
            ref={inputRef}
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLive}
            placeholder={isLive ? "Director is listening..." : "Issue production command..."}
            className="w-full nm-inset-input border-none rounded-xl py-4 pl-5 pr-14 text-xs text-starlight placeholder-mystic-gray/30 focus:outline-none focus:ring-1 focus:ring-luna-gold/20 transition-all font-mono disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={isThinking || !input.trim() || isLive}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg nm-button-gold text-white flex items-center justify-center transition-all disabled:opacity-0 active:scale-95 shadow-lg"
          >
            <i className="fa-solid fa-bolt-lightning text-xs"></i>
          </button>
        </div>
      </form>
    </div>
  );
};
