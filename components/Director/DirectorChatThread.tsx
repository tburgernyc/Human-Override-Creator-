import React, { useEffect, useRef } from 'react';
import { Message } from './useDirector';
import { DirectorMessage } from './DirectorMessage';

interface DirectorChatThreadProps {
  messages: Message[];
  isTyping: boolean;
  onChipSelect: (text: string) => void;
  onAction: (action: string, stepId?: string) => void;
}

export const DirectorChatThread: React.FC<DirectorChatThreadProps> = ({
  messages,
  isTyping,
  onAction,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[#1a3a5c] scrollbar-track-transparent">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full opacity-25">
          <i className="fa-solid fa-clapperboard text-4xl mb-4 text-[#00d4ff]"></i>
          <p className="text-xs font-mono text-[#3a6a8a] tracking-widest">INITIALIZING UPLINK...</p>
        </div>
      )}

      {messages.map((msg, idx) => (
        <DirectorMessage key={idx} message={msg} onAction={onAction} />
      ))}

      {isTyping && (
        <div className="flex justify-start mb-3">
          <div className="bg-[#111c2e] border border-[#1a3a5c] rounded-[4px_16px_16px_16px] px-4 py-3 flex items-center gap-1.5">
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
