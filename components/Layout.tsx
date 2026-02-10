
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: 'landing' | 'dashboard' | 'projects';
  onViewChange: (view: 'landing' | 'dashboard' | 'projects') => void;
  isProcessing?: boolean;
  assistantActive?: boolean;
  onToggleAssistant?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeView, 
  onViewChange, 
  isProcessing = false, 
  assistantActive = false,
  onToggleAssistant 
}) => {
  return (
    <div className="min-h-screen bg-eclipse-black text-starlight selection:bg-luna-gold selection:text-white overflow-x-hidden">
      
      {/* Integrated Floating Master Pill */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[95%] sm:w-max flex items-center justify-center pointer-events-none">
        <header className="pointer-events-auto flex items-center gap-1 sm:gap-4 bg-eclipse-black px-3 py-2 rounded-full shadow-nm-convex border border-white/5 transition-all group/pill">
          
          {/* Brand/Logo Section */}
          <div 
            onClick={() => onViewChange('landing')}
            className="flex items-center gap-3 pl-2 pr-4 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div className="relative w-8 h-8 flex-shrink-0 nm-button rounded-lg flex items-center justify-center">
                <i className="fa-solid fa-layer-group text-luna-gold text-[12px]"></i>
            </div>
            <div className="hidden lg:block whitespace-nowrap">
              <h1 className="text-[10px] font-black text-white tracking-tighter font-mono uppercase">
                Human Override
              </h1>
              <p className="text-[6px] text-mystic-gray tracking-[0.3em] uppercase font-bold opacity-60">Production Unit</p>
            </div>
          </div>

          <div className="h-6 w-px bg-white/5 hidden sm:block"></div>

          {/* Primary Navigation */}
          <nav className="flex items-center gap-1.5">
            {[
              { id: 'landing', label: 'Home', icon: 'fa-house' },
              { id: 'dashboard', label: 'Studio', icon: 'fa-gauge-high' },
              { id: 'projects', label: 'Vault', icon: 'fa-box-archive' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id as any)}
                className={`
                  relative px-4 py-2 rounded-full text-[9px] font-bold uppercase tracking-widest flex items-center gap-2.5 transition-all
                  ${activeView === item.id 
                    ? 'nm-button-gold text-white shadow-nm-gold' 
                    : 'text-celestial-stone hover:text-white nm-button'
                  }
                `}
              >
                <i className={`fa-solid ${item.icon} text-[10px] ${activeView === item.id ? 'text-white' : 'text-luna-gold'}`}></i>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="h-6 w-px bg-white/5 hidden sm:block"></div>

          {/* Assistant Toggle Module */}
          <button 
            onClick={onToggleAssistant}
            className={`
              flex items-center gap-2.5 px-3 py-2 rounded-full nm-button transition-all
              ${assistantActive 
                ? 'bg-solar-amber/10 shadow-nm-inset text-solar-amber border-solar-amber/30' 
                : 'text-celestial-stone hover:text-white'
              }
            `}
          >
            <div className="relative">
              <i className="fa-solid fa-brain text-[10px]"></i>
              {assistantActive && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-solar-amber rounded-full animate-ping"></span>}
            </div>
            <span className="text-[8px] font-bold uppercase tracking-widest hidden md:block">Director</span>
          </button>

          {/* User Profile */}
          <div className="w-8 h-8 rounded-full nm-button p-[1px] group cursor-pointer hover:scale-110 transition-transform flex items-center justify-center">
             <span className="font-mono text-[9px] text-luna-gold font-black">HO</span>
          </div>

          {/* Production Progress Bar (Inside the Pill) */}
          {isProcessing && (
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-white/5">
              <div className="h-full bg-luna-gold w-1/3 animate-[shimmer_2s_infinite] shadow-[0_0_10px_#3b82f6]"></div>
            </div>
          )}
        </header>
      </div>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative pt-24">
        {/* Background Effects */}
        <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none -z-20"></div>
        <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] pointer-events-none -z-20"></div>
        
        <div className="min-h-screen">
          {children}
        </div>
      </main>

      <footer className="border-t border-white/5 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-4">
               <i className="fa-solid fa-layer-group text-luna-gold/50 text-xl"></i>
               <span className="text-xs text-mystic-gray font-mono uppercase tracking-[0.3em]">Human Override Production Unit © 2025</span>
            </div>
            <div className="flex gap-10">
               <a href="#" className="text-[10px] text-mystic-gray hover:text-luna-gold font-bold uppercase tracking-widest transition-colors">Documentation</a>
               <a href="#" className="text-[10px] text-mystic-gray hover:text-luna-gold font-bold uppercase tracking-widest transition-colors">API Status</a>
               <a href="#" className="text-[10px] text-mystic-gray hover:text-luna-gold font-bold uppercase tracking-widest transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};
