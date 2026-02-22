import React, { useEffect, useState } from 'react';

interface DirectorStatusBarProps {
    isTyping: boolean;
    phase: string;
}

export const DirectorStatusBar: React.FC<DirectorStatusBarProps> = ({ isTyping, phase }) => {
    const [ticker, setTicker] = useState("SYSTEM_READY");

    useEffect(() => {
        if (isTyping) {
            setTicker("PROCESSING_REQUEST...");
        } else {
            setTicker(`MONITORING_${phase.toUpperCase()}_PROTOCOL`);
        }
    }, [isTyping, phase]);

    return (
        <div className="h-8 bg-[#070b14] border-t border-[#1a3a5c] flex items-center px-4 gap-4 overflow-hidden">
            <div className="flex items-center gap-2 shrink-0">
                <div className="w-1.5 h-1.5 bg-[#3a6a8a] rounded-full animate-pulse"></div>
                <span className="text-[9px] font-mono text-[#3a6a8a] tracking-widest">CONSOLE</span>
            </div>

            <div className="flex-1 overflow-hidden relative">
                <p className="text-[9px] font-mono text-[#3a6a8a]/70 whitespace-nowrap animate-pulse">
                    {ticker} <span className="animate-blink">_</span>
                </p>
            </div>
        </div>
    );
};
