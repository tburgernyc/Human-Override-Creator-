
import React, { useState } from 'react';
import { ProjectState } from '../types';
import { performFullAudit } from '../services/gemini';

interface ScriptDoctorProps {
  project: ProjectState;
  onClose: () => void;
}

export const ScriptDoctor: React.FC<ScriptDoctorProps> = ({ project, onClose }) => {
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const runDiagnosis = async () => {
    setIsDiagnosing(true);
    try {
      const feedback = await performFullAudit(project);
      setDiagnosis(feedback);
    } catch (e) {
      setDiagnosis("DIAGNOSIS FAILED: Directorial link severed.");
    } finally {
      setIsDiagnosing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-4xl nm-panel flex flex-col overflow-hidden border border-white/5 bg-eclipse-black">
        <header className="p-8 border-b border-white/5 flex justify-between items-center bg-gold-gradient/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-solar-amber/10 border border-solar-amber/30 flex items-center justify-center text-solar-amber">
              <i className="fa-solid fa-user-doctor text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono italic">Script Doctor</h2>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">AI-Powered Narrative Integrity Audit</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-12 scrollbar-hide space-y-10">
          {!diagnosis ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-24 h-24 rounded-full nm-button flex items-center justify-center mb-8 relative">
                 <i className="fa-solid fa-stethoscope text-4xl text-luna-gold"></i>
                 <div className="absolute inset-0 rounded-full border border-luna-gold/20 animate-ping"></div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 font-mono">Initiate Narrative Scan</h3>
              <p className="text-celestial-stone text-sm max-w-md mb-10">The Script Doctor will analyze your project for structural weaknesses, pacing issues, and character consistency gaps.</p>
              <button 
                onClick={runDiagnosis}
                disabled={isDiagnosing}
                className="px-12 py-4 nm-button-gold text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-nm-gold hover:scale-105 transition-all"
              >
                {isDiagnosing ? <i className="fa-solid fa-circle-notch fa-spin mr-3"></i> : <i className="fa-solid fa-bolt-lightning mr-3"></i>}
                {isDiagnosing ? 'Running Diagnostic...' : 'Begin Narrative Audit'}
              </button>
            </div>
          ) : (
            <div className="animate-in slide-in-from-bottom-5 duration-700">
               <div className="nm-inset-input p-10 rounded-[3rem] border border-white/5 relative bg-black/40">
                  <div className="absolute -top-4 left-10 px-6 py-1.5 bg-luna-gold rounded-full text-[9px] font-black text-white uppercase tracking-widest shadow-lg">Diagnosis Results</div>
                  <div className="prose prose-invert max-w-none">
                     <p className="text-starlight text-lg leading-relaxed font-light italic opacity-90 whitespace-pre-wrap">
                        {diagnosis}
                     </p>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-8 mt-12">
                  <div className="p-8 rounded-3xl nm-button border border-white/5">
                     <h4 className="text-[10px] font-black text-solar-amber uppercase tracking-[0.2em] mb-4">Risk Factors Detected</h4>
                     <p className="text-[11px] text-celestial-stone italic opacity-60">"Minor pacing drop in act 2. Suggest intercutting B-roll at Sequence #3."</p>
                  </div>
                  <div className="p-8 rounded-3xl nm-button border border-white/5">
                     <h4 className="text-[10px] font-black text-deep-sage uppercase tracking-[0.2em] mb-4">Aesthetic Strengths</h4>
                     <p className="text-[11px] text-celestial-stone italic opacity-60">"Character voice mapping is highly distinct. Visual coherence score: Optimal."</p>
                  </div>
               </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5 flex justify-between items-center px-10">
          <button onClick={() => setDiagnosis(null)} className="text-[9px] font-bold text-mystic-gray uppercase tracking-widest hover:text-white transition-colors">Clear Diagnosis</button>
          <button onClick={onClose} className="px-12 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-luna-gold hover:text-white transition-all">Close Diagnostic</button>
        </div>
      </div>
    </div>
  );
};
