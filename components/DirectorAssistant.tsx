
import React, { useState, useRef, useEffect } from 'react';
import { ProjectState, ChatMessage } from '../types';
import { handleDirectorChat, getDirectorGuidance, DirectorGuidance, triggerApiKeySelection } from '../services/gemini';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from '@google/genai';
import { LiveWaveform } from './LiveWaveform';

type ProductionPhase = 'genesis' | 'manifest' | 'synthesis' | 'post';

interface DirectorAssistantProps {
  project: ProjectState;
  onUpdateProject: (updates: Partial<ProjectState>) => void;
  onExecuteTool: (name: string, args: any) => Promise<any>;
  autoTriggerDiagnosis?: boolean;
  currentPhase: ProductionPhase;
  onNavigatePhase?: (section: string) => void;
}

const PHASE_META: Record<ProductionPhase, { label: string; icon: string; color: string; next?: ProductionPhase; nextLabel?: string }> = {
  genesis: { label: 'Genesis', icon: 'fa-seedling', color: 'text-deep-sage', next: 'manifest', nextLabel: 'Proceed to Manifest' },
  manifest: { label: 'Manifest', icon: 'fa-file-invoice', color: 'text-luna-gold', next: 'synthesis', nextLabel: 'Begin Synthesis' },
  synthesis: { label: 'Synthesis', icon: 'fa-wand-magic-sparkles', color: 'text-solar-amber', next: 'post', nextLabel: 'Enter Post-Production' },
  post: { label: 'Post-Production', icon: 'fa-clapperboard', color: 'text-white' }
};

const PHASE_COMMANDS: Record<ProductionPhase, { label: string; prompt: string; icon: string }[]> = {
  genesis: [
    { label: "Review Script", prompt: "Analyze my current script for narrative strength, hook quality, and pacing. Suggest specific improvements to make it more compelling.", icon: "fa-magnifying-glass" },
    { label: "Improve Hook", prompt: "The opening hook of my script needs to be stronger. Suggest 3 alternative opening hooks that would maximize viewer retention in the first 5 seconds.", icon: "fa-bolt" },
    { label: "Recommend Style", prompt: "Based on my script content, recommend the best visual style and aspect ratio. Explain your reasoning.", icon: "fa-palette" },
    { label: "Structure Check", prompt: "Check my script structure. Does it follow the [Scene: ...] format correctly? Are there any formatting issues?", icon: "fa-list-check" }
  ],
  manifest: [
    { label: "Audit Voices", prompt: "Review all character voice assignments. Are they fitting for each character's personality and gender? Suggest any changes.", icon: "fa-microphone" },
    { label: "Optimize Pacing", prompt: "Analyze the pacing across all scenes. Are the estimated durations appropriate? Should any scenes be shorter or longer?", icon: "fa-gauge-high" },
    { label: "Check Continuity", prompt: "Perform a continuity check across all scenes. Are character appearances, props, and settings consistent throughout?", icon: "fa-link" },
    { label: "Cast Analysis", prompt: "Review the cast ensemble. Are there enough characters? Are their descriptions rich enough for AI image generation? Suggest improvements.", icon: "fa-users" }
  ],
  synthesis: [
    { label: "Review Prompts", prompt: "Review all scene visual prompts for quality. Which ones need improvement for better AI image generation? Provide upgraded versions.", icon: "fa-image" },
    { label: "Music Moods", prompt: "Audit the music mood assignments across all scenes. Do they create a good emotional arc? Suggest changes for better narrative flow.", icon: "fa-music" },
    { label: "Quality Check", prompt: "Perform a scene-by-scene quality assessment. Flag any scenes that might produce poor visual results and suggest prompt improvements.", icon: "fa-star" },
    { label: "Suggest B-Roll", prompt: "Analyze my script and suggest 3 B-Roll scenes to add variety and improve visual density.", icon: "fa-film" }
  ],
  post: [
    { label: "Optimize SEO", prompt: "Generate optimized YouTube metadata: title options, description, tags, and thumbnail text suggestions based on my content.", icon: "fa-chart-line" },
    { label: "Viral Analysis", prompt: "Analyze the viral potential of my video. Rate the hook strength, pacing, and emotional peaks. Suggest improvements.", icon: "fa-fire" },
    { label: "Export Check", prompt: "Run an export readiness check. Are all assets complete? Any quality issues to address before final render?", icon: "fa-check-double" },
    { label: "VFX Suggest", prompt: "Recommend VFX mastering settings (film grain, bloom, vignette, color grading) that would best suit my production style.", icon: "fa-wand-magic-sparkles" }
  ]
};

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
  autoTriggerDiagnosis,
  currentPhase,
  onNavigatePhase
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', content: "OverrideBot operational. Sequence diagnosis clear. Ready for directorial commands." }
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [guidance, setGuidance] = useState<DirectorGuidance | null>(null);
  const [isLoadingGuidance, setIsLoadingGuidance] = useState(false);
  const [guidanceExpanded, setGuidanceExpanded] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<any>(null);
  const diagnosisRanRef = useRef(false);
  const lastPhaseRef = useRef<ProductionPhase>(currentPhase);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Fetch guidance when phase changes
  useEffect(() => {
    const fetchGuidance = async () => {
      setIsLoadingGuidance(true);
      try {
        const g = await getDirectorGuidance(currentPhase, project);
        setGuidance(g);
      } catch {
        // Guidance fetch failed silently — fallback already handled in service
      } finally {
        setIsLoadingGuidance(false);
      }
    };
    fetchGuidance();
  }, [currentPhase, project.scenes.length, project.characters.length]);

  // Auto-trigger phase transition message
  useEffect(() => {
    if (lastPhaseRef.current !== currentPhase) {
      const prevPhase = lastPhaseRef.current;
      lastPhaseRef.current = currentPhase;
      const phaseName = PHASE_META[currentPhase].label;
      const prevName = PHASE_META[prevPhase].label;

      setMessages(prev => [...prev, {
        role: 'system',
        content: `Phase transition: ${prevName} → ${phaseName}. Director recalibrating guidance protocols.`
      }]);

      // Auto-send phase transition analysis
      handleSubmit(undefined, `The production has just transitioned from ${prevName} phase to ${phaseName} phase. Analyze the current state of the project for this new phase. What should I focus on? Are there any issues from the previous phase that need attention? Provide your phase transition briefing.`);
    }
  }, [currentPhase]);

  useEffect(() => {
    if (autoTriggerDiagnosis && !diagnosisRanRef.current) {
      diagnosisRanRef.current = true;
      handleSubmit(undefined, `You are launching the initial production analysis. Perform these actions NOW using your tools:

1. CHARACTER VOICE CASTING: For EACH character in the project, analyze their name, gender, personality (from description and dialogue), and assign the most fitting voice from the available_voices list. Use the update_character tool for each character with appropriate voiceId, voiceSpeed, and voicePitch. Explain your casting choices in your text response.

2. SCENE REFINEMENT: For each scene, review the musicMood and cameraMotion. If any could be improved for better narrative flow, use the update_scene tool. Suggest improvements that enhance dramatic tension and pacing.

3. TEXT RESPONSE: After making all tool calls, provide your structured OverrideBot diagnosis with:
   - A. VOICE CASTING REPORT: Why each character got their assigned voice
   - B. SCENE ANALYSIS: Key observations about pacing and visual strength
   - C. NEXT ACTIONS: What the user should do next (customize in Scene Inspector, generate assets, etc.)

RULES:
- DO call update_character for each character with a voice assignment
- DO call update_scene for scenes that need musicMood or cameraMotion improvements
- Do NOT use propose_batch_refinement (the user hasn't reviewed the scenes yet)
- Match voice gender: Female voices for female characters, Male voices for male characters
- Consider character age, authority level, and emotional range when picking voices`);
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
          if (fc.name) {
            const result = await onExecuteTool(fc.name, fc.args);
          }
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
          onopen: async () => {
            try {
              await inputAudioContext.audioWorklet.addModule('/mic-processor.js');
              const source = inputAudioContext.createMediaStreamSource(stream);
              const workletNode = new AudioWorkletNode(inputAudioContext, 'mic-processor');
              workletNode.port.onmessage = (e) => {
                const base64 = encode(new Uint8Array(e.data));
                sessionPromise.then(s => s.sendRealtimeInput({
                  media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                }));
              };
              source.connect(workletNode);
              workletNode.connect(inputAudioContext.destination);
            } catch (workletErr) {
              console.error('AudioWorklet failed, falling back to ScriptProcessor:', workletErr);
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
            }
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall?.functionCalls) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name) {
                  const result = await onExecuteTool(fc.name, fc.args);
                  sessionPromise.then(s => s.sendToolResponse({
                    functionResponses: [{ id: fc.id, name: fc.name, response: { result } }]
                  }));
                }
              }
            }

            const parts = msg.serverContent?.modelTurn?.parts;
            const audioData = parts?.[0]?.inlineData?.data;
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
          systemInstruction: `You are the Director for the ${PHASE_META[currentPhase].label} phase. Assist the producer with phase-specific guidance, script edits, and character consistency. Professional and authoritative. You can update scenes and add characters.`,
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

  const phaseMeta = PHASE_META[currentPhase];
  const commands = PHASE_COMMANDS[currentPhase];

  return (
    <div className="flex flex-col h-full bg-eclipse-black font-mono rounded-[2rem] nm-panel overflow-hidden border border-white/5">
      {/* Phase Header */}
      <div className="p-5 nm-button rounded-t-[2rem] border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
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
        {/* Phase Indicator */}
        <div className="flex items-center gap-2 mt-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg nm-inset-input border border-white/5 ${phaseMeta.color}`}>
            <i className={`fa-solid ${phaseMeta.icon} text-[9px]`}></i>
            <span className="text-[8px] font-black uppercase tracking-widest">{phaseMeta.label} Phase</span>
          </div>
          {phaseMeta.next && onNavigatePhase && (
            <button
              onClick={() => onNavigatePhase(phaseMeta.next!)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[7px] font-black uppercase tracking-widest text-mystic-gray hover:text-luna-gold transition-all nm-button border border-white/5"
            >
              {phaseMeta.nextLabel} <i className="fa-solid fa-arrow-right text-[7px]"></i>
            </button>
          )}
        </div>
      </div>

      {/* Proactive Guidance Banner */}
      {guidance && (
        <div className="border-b border-white/5 bg-gradient-to-r from-luna-gold/5 to-transparent">
          <button
            onClick={() => setGuidanceExpanded(!guidanceExpanded)}
            className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-all"
          >
            <div className="flex items-center gap-2">
              <i className={`fa-solid fa-compass text-luna-gold text-[10px] ${isLoadingGuidance ? 'animate-spin' : ''}`}></i>
              <span className="text-[8px] font-black text-luna-gold uppercase tracking-widest">Director's Guidance</span>
            </div>
            <i className={`fa-solid fa-chevron-${guidanceExpanded ? 'up' : 'down'} text-[8px] text-mystic-gray`}></i>
          </button>
          {guidanceExpanded && (
            <div className="px-5 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-300">
              {/* Progress */}
              <div className="text-[9px] text-celestial-stone italic">{guidance.phaseProgress}</div>

              {/* Quality Flags */}
              {guidance.qualityFlags.length > 0 && (
                <div className="space-y-1.5">
                  {guidance.qualityFlags.map((flag, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-solar-amber/10 border border-solar-amber/20">
                      <i className="fa-solid fa-triangle-exclamation text-solar-amber text-[8px] mt-0.5"></i>
                      <span className="text-[8px] text-solar-amber font-medium">{flag}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tips */}
              <div className="space-y-1">
                {guidance.tips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <i className="fa-solid fa-chevron-right text-[6px] text-luna-gold mt-1"></i>
                    <span className="text-[8px] text-starlight">{tip}</span>
                  </div>
                ))}
              </div>

              {/* Suggested Action */}
              <button
                onClick={() => handleSubmit(undefined, guidance.suggestedAction + " — Help me execute this step.")}
                disabled={isThinking || isLive}
                className="w-full mt-1 px-4 py-2.5 rounded-xl nm-button-gold text-white text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30"
              >
                <i className="fa-solid fa-bolt-lightning text-[8px]"></i>
                {guidance.suggestedAction}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Phase-Specific Quick Commands */}
      <div className="px-5 py-3 bg-black/10 border-b border-white/5 overflow-x-auto scrollbar-hide flex gap-2">
        {commands.map((cmd) => (
          <button
            key={cmd.label}
            onClick={() => handleSubmit(undefined, cmd.prompt)}
            disabled={isThinking || isLive}
            className="flex-shrink-0 px-3 py-2 nm-button rounded-full text-[8px] font-bold text-celestial-stone hover:text-luna-gold transition-all uppercase tracking-widest border border-white/5 disabled:opacity-30 flex items-center gap-1.5"
          >
            <i className={`fa-solid ${cmd.icon} text-[7px] text-luna-gold/60`}></i>
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
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

      {/* Input */}
      <form onSubmit={(e) => handleSubmit(e)} className="p-6 nm-button rounded-b-[2rem] border-t border-white/5">
        <div className="relative group">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLive}
            placeholder={isLive ? "Director is listening..." : `Command for ${phaseMeta.label} phase...`}
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
