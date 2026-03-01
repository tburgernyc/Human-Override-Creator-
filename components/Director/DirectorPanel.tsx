import React, { useEffect } from 'react';
import { useDirector } from './useDirector';
import { DirectorHeader } from './DirectorHeader';
import { DirectorChatThread } from './DirectorChatThread';
import { DirectorInput } from './DirectorInput';
import { DirectorStatusBar } from './DirectorStatusBar';
import { ProductionPhase, ProjectState } from '../../types';

interface DirectorPanelProps {
    isOpen: boolean;
    onClose: () => void;
    currentPhase: ProductionPhase;
    projectName: string;
    project: ProjectState;
    onExecuteTool: (name: string, args: any) => Promise<any>;
    onGenerateCharacters?: () => Promise<void>;
    onGenerateScenes?: () => Promise<void>;
}

export const DirectorPanel: React.FC<DirectorPanelProps> = ({
    isOpen,
    onClose,
    currentPhase,
    projectName,
    project,
    onExecuteTool,
    onGenerateCharacters,
    onGenerateScenes,
}) => {
    const { messages, isTyping, sendMessage, sendProactiveGreeting, handleAction } = useDirector({
        currentPhase,
        project,
        onExecuteTool,
        onGenerateCharacters,
        onGenerateScenes,
    });

    // Auto-send greeting when panel opens
    useEffect(() => {
        if (isOpen) {
            sendProactiveGreeting();
        }
    }, [isOpen, sendProactiveGreeting]);

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[9000] transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Drawer Panel */}
            <div
                className={`fixed top-0 right-0 h-full w-[100vw] sm:w-[420px] bg-[#0a0e1a] border-l border-[#1e3a5f] shadow-2xl z-[9999] transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <DirectorHeader
                    currentPhase={currentPhase}
                    onClose={onClose}
                    isTyping={isTyping}
                />

                <DirectorChatThread
                    messages={messages}
                    isTyping={isTyping}
                    onChipSelect={sendMessage}
                    onAction={handleAction}
                />

                <DirectorInput
                    onSend={sendMessage}
                    isTyping={isTyping}
                />

                <DirectorStatusBar
                    isTyping={isTyping}
                    phase={currentPhase}
                />
            </div>
        </>
    );
};
