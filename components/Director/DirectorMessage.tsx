import React from 'react';
import { Message } from './useDirector';

interface DirectorMessageProps {
  message: Message;
  onAction: (action: string, stepId?: string) => void;
}

export const DirectorMessage: React.FC<DirectorMessageProps> = ({ message, onAction }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[9px] text-[#3a5a7a] font-mono uppercase tracking-widest bg-[#0a0e1a] px-3 py-1 border border-[#1a3a5c] rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full mb-3 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div className={`max-w-[90%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`
            px-4 py-3 text-sm leading-relaxed shadow-lg
            ${isUser
              ? 'bg-[#00314d] text-white rounded-[16px_4px_16px_16px] border border-[#004e7a]'
              : 'bg-[#111c2e] text-[#cde8ff] rounded-[4px_16px_16px_16px] border border-[#1a3a5c]'
            }
            ${message.isError ? 'border-red-500/50 text-red-200' : ''}
          `}
        >
          {!isUser && (
            <div className="flex items-center gap-2 mb-2 opacity-50">
              <div className="w-4 h-4 rounded-full bg-[#00d4ff] flex items-center justify-center text-[#0a0e1a] text-[9px] font-black">
                D
              </div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#00d4ff]">Director</span>
            </div>
          )}

          {/* Render content with basic bold support */}
          <div className="whitespace-pre-wrap text-sm">
            {message.content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={i} className="font-semibold text-white">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </div>

          {/* Inline action buttons */}
          {message.actionButtons && message.actionButtons.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
              {message.actionButtons.map((btn) => (
                <button
                  key={btn.action}
                  onClick={() => onAction(btn.action, message.stepId)}
                  className={`
                    px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider
                    transition-all active:scale-95 select-none
                    ${btn.variant === 'primary'
                      ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/40 hover:bg-[#00d4ff]/25 hover:border-[#00d4ff]/60'
                      : btn.variant === 'skip'
                        ? 'bg-transparent text-[#4a6a8a] border border-[#1a3a5c]/60 hover:text-[#7a9ab0] hover:border-[#2a4a6a]'
                        : 'bg-white/5 text-[#7a9ab0] border border-[#1a3a5c] hover:bg-white/10 hover:text-white'
                    }
                  `}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-[9px] text-[#3a5a7a] mt-1 px-1 font-mono">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};
