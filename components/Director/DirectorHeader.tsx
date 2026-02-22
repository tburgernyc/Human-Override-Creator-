import React from 'react';
import { ProductionPhase } from '../../types';

interface DirectorHeaderProps {
    currentPhase: ProductionPhase;
    onClose: () => void;
    isTyping: boolean;
}

export const DirectorHeader: React.FC<DirectorHeaderProps> = ({ currentPhase, onClose, isTyping }) => {
    return (
        <div className="h-16 bg-[#0d1526] border-b border-[#00d4ff]/20 flex items-center justify-between px-5 relative z-20 shrink-0">
            <div className="flex items-center gap-3">
                <div className="relative">
                    <div className={`w-2.5 h-2.5 rounded-full bg-[#00d4ff] ${isTyping ? 'animate-ping opacity-75' : 'shadow-[0_0_8px_#00d4ff]'}`}></div>
                    <div className={`absolute top-0 left-0 w-2.5 h-2.5 rounded-full bg-[#00d4ff] ${isTyping ? 'opacity-100' : 'opacity-0'}`}></div>
                </div>

                <div className="flex flex-col">
                    <h2 className="text-[13px] font-mono font-bold tracking-[0.2em] text-[#00d4ff] leading-none">
                        DIRECTOR
                    </h2>
                    <span className="text-[8px] text-[#3a6a8a] font-mono tracking-widest mt-1 opacity-80">
                        {isTyping ? 'UPLINK ACTIVE...' : 'SYSTEM READY'}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="px-2.5 py-1 rounded bg-[#00ff88]/10 border border-[#00ff88]/30">
                    <span className="text-[9px] font-black text-[#00ff88] uppercase tracking-widest">
                        {currentPhase} PHASE
                    </span>
                </div>

                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center text-[#3a6a8a] hover:text-white transition-colors"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
    );
};
