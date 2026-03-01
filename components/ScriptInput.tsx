
import React, { useState, useEffect, useRef } from 'react';
import { generateVideoScript } from '../services/gemini';

interface ScriptInputProps {
  script: string;
  onScriptChange: (script: string) => void;
  onAnalyze: (script: string) => void;
  isAnalyzing: boolean;
  analysisError?: string | null;
}

const TEMPLATES = [
  { name: 'Documentary', prompt: 'A highly educational and cinematic documentary script about ' },
  { name: 'Storytelling', prompt: 'A gripping, emotional short story with clear characters and cinematic scenes about ' },
  { name: 'Product Reveal', prompt: 'A fast-paced, high-energy product launch video script with bold text overlays for ' },
  { name: 'Explainer', prompt: 'A clear, concise, and friendly tutorial or explanation script for ' },
];

export const ScriptInput: React.FC<ScriptInputProps> = ({ script, onScriptChange, onAnalyze, isAnalyzing, analysisError }) => {
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  // script and setScript removed, using props
  const [prompt, setPrompt] = useState("");
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [parsingLog, setParsingLog] = useState<string[]>([]);

  useEffect(() => {
    if (isAnalyzing) {
      const logs = [
        "> INTERCEPTING SIGNAL...",
        "> PARSING NARRATIVE VECTORS",
        "> ANALYZING TEMPORAL HOOKS",
        "> MAPPING AUDIENCE ARCHETYPES",
        "> SYNCHRONIZING MULTI-SPEAKER MESH",
        "> CALCULATING CINEMATIC KINETICS",
        "> CORE MANIFEST READY"
      ];
      let i = 0;
      const interval = setInterval(() => {
        setParsingLog(prev => [...prev, logs[i]].slice(-5));
        i++;
        if (i >= logs.length) clearInterval(interval);
      }, 800);
      return () => clearInterval(interval);
    } else {
      setParsingLog([]);
    }
  }, [isAnalyzing]);

  const handleAIWriter = async (templatePrefix: string = "") => {
    const finalPrompt = templatePrefix + prompt;
    if (!prompt.trim() && !templatePrefix) return;

    setIsGeneratingScript(true);
    try {
      const generatedScript = await generateVideoScript(finalPrompt);
      onScriptChange(generatedScript);
      setMode('manual');
    } catch (e) {
      alert("Script generation failed. The model might be busy.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        onScriptChange(content);
        // Reset input so same file can be selected again if needed
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="nm-panel p-1 relative overflow-hidden group">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.md,.json,.csv"
        className="hidden"
      />

      <div className="p-6 md:p-10 rounded-[2rem] bg-eclipse-black relative">
        {/* Signal Interception Overlay */}
        {isAnalyzing && (
          <div className="absolute inset-0 z-50 bg-eclipse-black/95 backdrop-blur-md flex flex-col items-center justify-center p-12 rounded-[2rem] animate-in fade-in duration-500">
            <div className="w-24 h-24 nm-button rounded-full flex items-center justify-center mb-8">
              <div className="w-16 h-16 border-t-2 border-luna-gold rounded-full animate-spin"></div>
            </div>
            <div className="text-left w-full max-w-md font-mono space-y-2">
              {parsingLog.map((log, idx) => (
                <p key={idx} className={`text-[10px] tracking-widest ${idx === parsingLog.length - 1 ? 'text-luna-gold' : 'text-mystic-gray opacity-50'}`}>
                  {log}
                </p>
              ))}
              <div className="h-1.5 w-full nm-inset-input rounded-full overflow-hidden mt-6">
                <div className="h-full bg-luna-gold animate-[progress_5s_ease-in-out]"></div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center tracking-tight font-mono">
              <i className="fa-solid fa-code text-luna-gold mr-3"></i>
              Creative Terminal
            </h2>
            <p className="text-xs text-mystic-gray mt-1 uppercase tracking-widest font-bold">Project Genesis Stage</p>
          </div>

          <div className="flex nm-inset-input rounded-xl p-1.5">
            <button
              onClick={() => setMode('manual')}
              className={`px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'manual' ? 'nm-button-gold text-white' : 'text-celestial-stone hover:text-white'}`}
            >
              Editor
            </button>
            <button
              onClick={() => setMode('ai')}
              className={`px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${mode === 'ai' ? 'nm-button-gold text-white' : 'text-celestial-stone hover:text-white'}`}
            >
              AI Scriptwriter
            </button>
          </div>
        </div>

        {mode === 'manual' ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="nm-inset-input rounded-2xl p-2 mb-8 transition-all relative">
              <textarea
                className="w-full h-80 bg-transparent text-starlight p-6 rounded-2xl border-none focus:ring-0 font-mono text-sm leading-relaxed resize-none placeholder-mystic-gray/30"
                value={script}
                onChange={(e) => onScriptChange(e.target.value)}
                placeholder="[Scene: Cinematic description]&#10;Narrator: The words that will be spoken..."
                disabled={isAnalyzing}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute top-4 right-4 bg-white/5 hover:bg-white/10 text-mystic-gray hover:text-white px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold tracking-wider transition-all border border-white/5 backdrop-blur-md"
                title="Upload Script File"
              >
                <i className="fa-solid fa-file-upload mr-2"></i> Borrow File
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <div className="flex gap-4">
                  <span className="text-[10px] text-mystic-gray uppercase font-mono"><span className="text-luna-gold">Tip:</span> Use [Scene: ...] for visual instructions.</span>
                </div>
                <button
                  onClick={() => onAnalyze(script)}
                  disabled={isAnalyzing || !script.trim()}
                  className={`
                              nm-button group relative px-10 py-4 rounded-xl font-bold tracking-widest text-[10px] transition-all duration-300 uppercase
                              ${isAnalyzing
                      ? 'opacity-30 cursor-not-allowed'
                      : 'nm-button-gold text-white hover:shadow-nm-gold'
                    }
                          `}
                >
                  <span className="flex items-center gap-3">
                    <i className="fa-solid fa-sparkles"></i>
                    Initialize Pipeline
                  </span>
                </button>
              </div>
              {analysisError && (
                <div className="nm-inset-input rounded-xl p-4 border border-red-500/20 bg-red-500/5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1 flex items-center gap-2">
                    <i className="fa-solid fa-triangle-exclamation"></i> Analysis Failed
                  </p>
                  <p className="text-xs text-celestial-stone font-mono whitespace-pre-wrap">{analysisError}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-12 animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 rounded-full nm-button flex items-center justify-center mb-8 relative">
              <div className="absolute inset-0 rounded-full animate-ping nm-button opacity-20"></div>
              <i className="fa-solid fa-wand-magic-sparkles text-4xl text-luna-gold"></i>
            </div>

            <h3 className="text-2xl text-white font-bold mb-3 text-center font-mono">Concept Orchestrator</h3>
            <p className="text-celestial-stone text-sm mb-10 max-w-lg text-center font-light">Describe the core idea of your project. Select a template below to define the cinematic tone.</p>

            <div className="w-full max-w-2xl relative mb-12">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. The hidden history of ancient Mars civilizations"
                className="w-full nm-inset-input border-none rounded-xl py-5 px-8 text-starlight placeholder-mystic-gray/50 focus:outline-none focus:ring-2 focus:ring-luna-gold/20 transition-all font-mono text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAIWriter()}
              />
              <button
                onClick={() => handleAIWriter()}
                disabled={isGeneratingScript || !prompt.trim()}
                className="absolute right-3 top-2 bottom-2 nm-button-gold text-white px-6 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 uppercase text-[10px] font-bold tracking-widest"
              >
                {isGeneratingScript ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Write Script'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-2xl">
              {TEMPLATES.map(t => (
                <button
                  key={t.name}
                  disabled={isGeneratingScript}
                  onClick={() => handleAIWriter(t.prompt)}
                  className="nm-button p-4 rounded-xl text-center group hover:scale-105 transition-transform"
                >
                  <span className="block text-[10px] text-mystic-gray group-hover:text-luna-gold transition-colors font-bold uppercase tracking-widest">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};
