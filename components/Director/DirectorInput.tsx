import React, { useState, useRef, useEffect } from 'react';

interface DirectorInputProps {
    onSend: (text: string) => void;
    isTyping: boolean;
    placeholder?: string;
}

export const DirectorInput: React.FC<DirectorInputProps> = ({ onSend, isTyping, placeholder }) => {
    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() || isTyping) return;
        onSend(input);
        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
        }
    }, [input]);

    return (
        <div className="p-4 bg-[#0a0e1a] border-t border-[#1a3a5c] relative z-20">
            <div className="relative group">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder || "Ask the Director anything..."}
                    disabled={isTyping}
                    className="w-full min-h-[52px] max-h-[140px] bg-[#111c2e] border border-[#1a3a5c] rounded-xl pl-4 pr-14 py-3 text-sm text-[#cde8ff] placeholder-[#3a5a7a] focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/30 transition-all resize-none font-sans leading-relaxed scrollbar-hide"
                    rows={1}
                />
                <button
                    onClick={() => handleSubmit()}
                    disabled={!input.trim() || isTyping}
                    className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-[#00d4ff]/10 text-[#00d4ff] flex items-center justify-center hover:bg-[#00d4ff] hover:text-[#0a0e1a] transition-all disabled:opacity-0 disabled:scale-95 active:scale-90"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
                {input.length > 0 && (
                    <span className="absolute right-14 bottom-4 text-[9px] text-[#3a5a7a] font-mono">{input.length} chars</span>
                )}
            </div>
        </div>
    );
};
