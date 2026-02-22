import React, { useEffect, useRef } from 'react';
import { Message } from './useDirector';
import { DirectorMessage } from './DirectorMessage';
import { DirectorChips } from './DirectorChips';
import { ProductionPhase, ProjectState } from '../../types';

interface DirectorChatThreadProps {
    messages: Message[];
    isTyping: boolean;
    currentPhase: ProductionPhase;
    project: ProjectState;
    onChipSelect: (text: string) => void;
}

export const DirectorChatThread: React.FC<DirectorChatThreadProps> = ({
    messages,
    isTyping,
    currentPhase,
    project,
    onChipSelect
}) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    return (
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[#1a3a5c] scrollbar-track-transparent">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full opacity-30">
                    <i className="fa-solid fa-clapperboard text-4xl mb-4 text-[#00d4ff]"></i>
                    <p className="text-xs font-mono text-[#3a6a8a] tracking-widest">INITIALIZING UPLINK...</p>
                </div>
            )}

            {messages.map((msg, idx) => (
                <React.Fragment key={idx}>
                    <DirectorMessage message={msg} />
                    {/* Show chips after the LAST message if it's from the assistant */}
                    {idx === messages.length - 1 && msg.role === 'assistant' && !isTyping && (
                        <div className="mb-6 ml-1">
                            <DirectorChips
                                onSelect={onChipSelect}
                                currentPhase={currentPhase}
                                project={project}
                            />
                        </div>
                    )}
                </React.Fragment>
            ))}

            {isTyping && (
                <div className="flex justify-start mb-4">
                    <div className="bg-[#111c2e] border border-[#1a3a5c] rounded-[4px_16px_16px_16px] px-4 py-3 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-[#00d4ff] rounded-full animate-bounce"></div>
                    </div>
                </div>
            )}

            <div ref={bottomRef} />
        </div>
    );
};
