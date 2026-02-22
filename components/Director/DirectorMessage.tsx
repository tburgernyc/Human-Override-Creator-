import React from 'react';
import { Message } from './useDirector';

interface DirectorMessageProps {
    message: Message;
}

export const DirectorMessage: React.FC<DirectorMessageProps> = ({ message }) => {
    const isUser = message.role === "user";
    const isSystem = message.role === "system";

    if (isSystem) {
        return (
            <div className="flex justify-center my-4">
                <span className="text-[10px] text-[#3a5a7a] font-mono uppercase tracking-widest bg-[#0a0e1a] px-3 py-1 border border-[#1a3a5c] rounded-full">
                    {message.content}
                </span>
            </div>
        )
    }

    return (
        <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                    className={`
                px-4 py-3 text-sm leading-relaxed shadow-lg backdrop-blur-sm
                ${isUser
                            ? 'bg-[#00314d] text-white rounded-[16px_4px_16px_16px] border border-[#004e7a]'
                            : 'bg-[#111c2e] text-[#cde8ff] rounded-[4px_16px_16px_16px] border border-[#1a3a5c]'
                        }
                ${message.isError ? 'border-red-500/50 text-red-200' : ''}
            `}
                >
                    {!isUser && (
                        <div className="flex items-center gap-2 mb-1.5 opacity-50">
                            <div className="w-4 h-4 rounded-full bg-[#00d4ff] flex items-center justify-center text-[#0a0e1a] text-[9px] font-black">D</div>
                            <span className="text-[9px] font-mono uppercase tracking-widest text-[#00d4ff]">Director</span>
                        </div>
                    )}
                    {message.content}
                </div>

                {/* Timestamp placeholder - real app would use message.timestamp */}
                <span className="text-[9px] text-[#3a5a7a] mt-1.5 px-1 font-mono">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    );
};
