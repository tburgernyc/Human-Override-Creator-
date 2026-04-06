
import React from 'react';

interface LandingPageProps {
  onStart: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  return (
    <div className="relative min-h-[calc(100vh-80px)] flex flex-col items-center overflow-x-hidden pt-12 pb-24">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-luna-gold/5 rounded-full blur-[120px] opacity-50"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-solar-amber/5 rounded-full blur-[100px] opacity-30"></div>
        <div className="absolute top-1/2 left-0 w-[300px] h-[300px] bg-deep-sage/5 rounded-full blur-[80px] opacity-20"></div>
      </div>

      {/* Hero Section */}
      <section className="max-w-6xl w-full px-4 text-center mb-32 animate-in fade-in slide-in-from-top-10 duration-1000">
        <div className="inline-flex items-center gap-3 px-5 py-2 mb-10 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-luna-gold opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-luna-gold"></span>
          </span>
          <span className="text-[10px] font-black text-starlight uppercase tracking-[0.4em] font-mono">Signal: Uplink Established v6.2</span>
        </div>
        
        <h1 className="text-6xl md:text-[7rem] font-black text-white mb-10 tracking-tighter leading-[0.9] font-mono italic">
          OVERRIDE THE <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-luna-gold via-starlight to-luna-gold-dim">PRODUCTION</span> LIMIT
        </h1>
        
        <p className="text-lg md:text-2xl text-celestial-stone mb-14 max-w-3xl mx-auto font-light leading-relaxed">
          The first truly multi-modal AI studio. We didn't build a wrapper; we built a <span className="text-starlight font-bold">neural pipeline</span> that transforms scripts into cinematic YouTube units with consistent characters, temporal logic, and professional mastering.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
          <button 
            onClick={onStart}
            className="group relative px-12 py-6 bg-white text-black rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-[0_25px_60px_rgba(255,255,255,0.1)] transition-all hover:scale-105 active:scale-95 flex items-center gap-4 overflow-hidden"
          >
            <div className="absolute inset-0 bg-luna-gold translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
            <span className="relative z-10 flex items-center gap-4 group-hover:text-white transition-colors">
              Initialize Command Center <i className="fa-solid fa-bolt-lightning text-[10px]"></i>
            </span>
          </button>
          
          <button className="px-10 py-6 nm-button text-starlight rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-white/5 transition-all flex items-center gap-4 border border-white/5">
            <i className="fa-solid fa-play text-luna-gold"></i> View Technical Showcase
          </button>
        </div>

        {/* Live Status Indicators */}
        <div className="mt-16 flex flex-wrap justify-center gap-10 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
           <div className="flex items-center gap-2"><i className="fa-solid fa-shield-halved text-xs"></i> <span className="text-[9px] font-bold uppercase tracking-widest font-mono">Encrypted Uplink</span></div>
           <div className="flex items-center gap-2"><i className="fa-solid fa-microchip text-xs"></i> <span className="text-[9px] font-bold uppercase tracking-widest font-mono">Gemini 3 Pro Integration</span></div>
           <div className="flex items-center gap-2"><i className="fa-solid fa-film text-xs"></i> <span className="text-[9px] font-bold uppercase tracking-widest font-mono">Veo 3.1 Synthesis</span></div>
        </div>
      </section>

      {/* Production Workflow Section */}
      <section className="w-full max-w-7xl px-4 mb-40">
        <div className="text-center mb-20">
          <h2 className="text-xs font-black text-luna-gold uppercase tracking-[0.5em] mb-4">The Synthesis Protocol</h2>
          <p className="text-3xl font-bold text-white font-mono">From Concept to Master in 4 Frames</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: '01', title: 'Genesis', desc: 'Input your raw script or let the Concept Orchestrator synthesize a narrative structure based on viral trends.', icon: 'fa-pen-nib' },
            { step: '02', title: 'Manifest', desc: 'The pipeline extracts personnel, scene metadata, and multi-speaker dialogue lines into a visual manifest.', icon: 'fa-file-invoice' },
            { step: '03', title: 'Synthesis', desc: 'Generate 4K visual takes with Veo and emotional vocal tracks with Flash TTS, synced via neural clock.', icon: 'fa-wand-magic-sparkles' },
            { step: '04', title: 'Master', desc: 'Apply cinematic grading, LUT presets, and motion graphics before compiling the final master production unit.', icon: 'fa-clapperboard' }
          ].map((item, i) => (
            <div key={i} className="group relative nm-panel p-10 flex flex-col border border-white/5 hover:border-luna-gold/20 transition-all">
              <span className="text-4xl font-black text-white/5 font-mono group-hover:text-luna-gold/10 transition-colors absolute top-6 right-8">{item.step}</span>
              <div className="w-12 h-12 rounded-2xl nm-button flex items-center justify-center mb-8 border border-white/10 group-hover:shadow-nm-gold transition-all">
                <i className={`fa-solid ${item.icon} text-luna-gold text-lg`}></i>
              </div>
              <h3 className="text-xl font-bold text-white mb-4 font-mono uppercase tracking-tight">{item.title}</h3>
              <p className="text-celestial-stone text-xs leading-relaxed font-light">{item.desc}</p>
              {i < 3 && <div className="hidden md:block absolute top-1/2 -right-2 w-4 h-px bg-white/10 z-10"></div>}
            </div>
          ))}
        </div>
      </section>

      {/* OverrideBot Section */}
      <section className="w-full max-w-6xl px-4 mb-40">
        <div className="nm-panel rounded-[4rem] p-1 border border-white/5 overflow-hidden">
          <div className="bg-gradient-to-br from-white/5 to-transparent p-12 md:p-20 rounded-[3.8rem] flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 space-y-10">
              <div className="inline-block px-4 py-1 rounded-full bg-solar-amber/10 border border-solar-amber/20">
                <span className="text-[9px] font-black text-solar-amber uppercase tracking-widest">Core Intelligence</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black text-white font-mono uppercase tracking-tighter leading-tight italic">
                MEET YOUR <br />
                <span className="text-solar-amber">DIRECTOR.</span>
              </h2>
              <p className="text-lg text-celestial-stone leading-relaxed font-light italic">
                "OverrideBot isn't a chatbot. It's an active producer that audits your continuity, proposes batch refinements, and executes directorial tools to keep your project visually unified and narratively sharp."
              </p>
              <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Active Audit</h4>
                   <p className="text-[11px] text-mystic-gray">Scans timeline for pacing gaps and character visual breaks in real-time.</p>
                 </div>
                 <div className="space-y-2">
                   <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Tool Execution</h4>
                   <p className="text-[11px] text-mystic-gray">Can directly update scenes, inject B-roll, and synthesize new cast personnel.</p>
                 </div>
              </div>
            </div>
            <div className="w-full lg:w-[450px] aspect-square relative">
               <div className="absolute inset-0 bg-solar-amber/10 rounded-full blur-[100px] animate-pulse"></div>
               <div className="nm-panel w-full h-full rounded-full border border-solar-amber/20 flex items-center justify-center relative overflow-hidden group/bot">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                  <div className="relative z-10 w-32 h-32 nm-button rounded-full flex items-center justify-center text-solar-amber shadow-[0_0_50px_rgba(239,68,68,0.2)] group-hover/bot:scale-110 transition-transform duration-700">
                     <i className="fa-solid fa-brain text-5xl"></i>
                  </div>
                  {/* Rotating Rings */}
                  <div className="absolute inset-4 border border-solar-amber/10 rounded-full animate-[spin_20s_linear_infinite]"></div>
                  <div className="absolute inset-10 border border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
                  <div className="absolute inset-16 border-t-2 border-solar-amber/30 rounded-full animate-[spin_10s_ease-in-out_infinite]"></div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Showcase / Features Grid */}
      <section className="w-full max-w-7xl px-4 mb-40">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 nm-panel p-12 border border-white/5 bg-black/40 flex flex-col justify-between overflow-hidden relative">
              <div className="relative z-10">
                <h3 className="text-3xl font-black text-white mb-6 uppercase tracking-tight italic font-mono">Neural Cinema Engine</h3>
                <p className="text-celestial-stone text-sm max-w-md font-light leading-relaxed">
                  Leverage Veo's cutting-edge temporal consistency. Generate 1080p cinematic sequences that maintain visual descriptors across complex narrative beats.
                </p>
              </div>
              <div className="flex gap-4 mt-12 relative z-10">
                 <div className="px-4 py-2 nm-inset-input rounded-xl text-[9px] font-black text-luna-gold uppercase tracking-widest">Temporal Lock</div>
                 <div className="px-4 py-2 nm-inset-input rounded-xl text-[9px] font-black text-deep-sage uppercase tracking-widest">4K Upscaling Ready</div>
              </div>
              {/* Background preview effect */}
              <div className="absolute -bottom-10 -right-20 w-[400px] h-[300px] nm-button rounded-[3rem] opacity-20 rotate-12 flex items-center justify-center">
                 <i className="fa-solid fa-film text-9xl text-white/10"></i>
              </div>
           </div>

           <div className="nm-panel p-12 border border-white/5 bg-black/40 group overflow-hidden">
              <i className="fa-solid fa-fingerprint text-solar-amber text-4xl mb-10 group-hover:scale-110 transition-transform"></i>
              <h3 className="text-xl font-bold text-white mb-6 uppercase font-mono tracking-tight">Identity Persistence</h3>
              <p className="text-celestial-stone text-xs font-light leading-relaxed">
                Our Character Sync engine ensures that your AI cast remains consistent from the first frame to the last. No more hallucinating facial features.
              </p>
           </div>

           <div className="nm-panel p-12 border border-white/5 bg-black/40 group">
              <i className="fa-solid fa-waveform-lines text-deep-sage text-4xl mb-10 group-hover:scale-110 transition-transform"></i>
              <h3 className="text-xl font-bold text-white mb-6 uppercase font-mono tracking-tight">Vocal Staging</h3>
              <p className="text-celestial-stone text-xs font-light leading-relaxed">
                Multi-speaker TTS with emotional range. Define speed, pitch, and tone for every character to create a truly immersive audio experience.
              </p>
           </div>

           <div className="lg:col-span-2 nm-panel p-12 border border-white/5 bg-black/40 flex flex-col md:flex-row gap-12 items-center">
              <div className="flex-1 space-y-6">
                <h3 className="text-2xl font-bold text-white uppercase font-mono tracking-tight italic">Distribution Intel</h3>
                <p className="text-celestial-stone text-xs font-light leading-relaxed">
                  Every production unit includes a full Distribution Manifest. AI-generated high-CTR titles, viral retention heatmaps, and cross-platform multiplier posts for X and LinkedIn.
                </p>
              </div>
              <div className="w-full md:w-64 space-y-3">
                 <div className="h-10 nm-inset-input rounded-lg flex items-center px-4"><div className="w-2 h-2 rounded-full bg-deep-sage mr-3"></div><div className="h-2 w-24 bg-white/10 rounded"></div></div>
                 <div className="h-10 nm-inset-input rounded-lg flex items-center px-4"><div className="w-2 h-2 rounded-full bg-luna-gold mr-3"></div><div className="h-2 w-32 bg-white/10 rounded"></div></div>
                 <div className="h-10 nm-inset-input rounded-lg flex items-center px-4"><div className="w-2 h-2 rounded-full bg-solar-amber mr-3"></div><div className="h-2 w-20 bg-white/10 rounded"></div></div>
              </div>
           </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full max-w-4xl px-4 text-center">
        <div className="nm-panel p-20 rounded-[4rem] border border-luna-gold/20 relative overflow-hidden bg-gradient-to-t from-luna-gold/5 to-transparent">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-20 bg-gradient-to-b from-luna-gold to-transparent"></div>
          <h2 className="text-4xl font-bold text-white mb-8 tracking-tight font-mono uppercase">Your Command Lab is Ready</h2>
          <p className="text-celestial-stone mb-12 max-w-md mx-auto font-light">Join the ranks of elite creators bypassing the traditional production bottleneck.</p>
          <button 
            onClick={onStart}
            className="px-16 py-6 bg-gold-gradient text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] shadow-nm-gold hover:scale-105 active:scale-95 transition-all"
          >
            Authorize Initial Uplink
          </button>
        </div>
      </section>
    </div>
  );
};
