import { useState, useCallback, useRef, useEffect } from "react";
import { ProductionPhase, ProjectState } from "../../types";
import { handleDirectorChat } from "../../services/gemini";

export interface Message {
    role: "user" | "assistant" | "system";
    content: string;
    isError?: boolean;
}

interface UseDirectorProps {
    currentPhase: ProductionPhase;
    projectName?: string;
    lastAction?: string;
    project: ProjectState;
    onExecuteTool: (name: string, args: any) => Promise<any>;
}

export function useDirector({ currentPhase, project, onExecuteTool }: UseDirectorProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);

    // Ref always mirrors latest messages so async callbacks don't capture stale closures
    const messagesRef = useRef<Message[]>(messages);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    const sendProactiveGreeting = useCallback(async () => {
        if (messagesRef.current.length > 0) return;
        setIsTyping(true);

        let greetingPrompt: string;
        if (!project.script || project.script.trim().length < 20) {
            greetingPrompt = 'New project — no script detected. Greet the user as OverrideBot, assess the blank state, and walk them through step 1 with precise numbered steps.';
        } else if (project.scenes.length === 0) {
            greetingPrompt = 'Script is entered but not yet analyzed (no scenes extracted). Greet the user, acknowledge the script exists, and strongly recommend running script analysis as step 1.';
        } else if (currentPhase === 'manifest' && project.characters.some(c => !c.voiceId)) {
            greetingPrompt = `Manifest phase. ${project.characters.filter(c => !c.voiceId).length} character(s) still need voice assignments. Greet the user and prioritize voice assignments as the next action.`;
        } else if (currentPhase === 'manifest' && project.characters.some(c => !c.characterDNA)) {
            greetingPrompt = `Manifest phase. ${project.characters.filter(c => !c.characterDNA).length} character(s) lack CharacterDNA identity locks. Flag this and offer to optimize their prompts.`;
        } else {
            greetingPrompt = `Project is in ${currentPhase.toUpperCase()} phase with ${project.scenes.length} scenes and ${project.characters.length} characters. Greet the user as OverrideBot with a concise status assessment and one concrete recommended next step.`;
        }

        try {
            const response = await handleDirectorChat(greetingPrompt, project, []);
            if (response.functionCalls) {
                for (const fc of response.functionCalls) {
                    if (fc.name) await onExecuteTool(fc.name, fc.args);
                }
            }
            const text = response.text || "🎬 Director online. What are we building today?";
            setMessages([{ role: "assistant", content: text }]);
        } catch {
            setMessages([{ role: "assistant", content: "🎬 Director online. What are we building today?" }]);
        } finally {
            setIsTyping(false);
        }
    }, [currentPhase, project, onExecuteTool]);

    const sendMessage = useCallback(async (userText: string) => {
        if (!userText.trim()) return;

        const userMsg: Message = { role: "user", content: userText };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        try {
            // Read latest messages from ref to avoid stale closure in concurrent calls
            const chatHistory = messagesRef.current
                .filter(m => m.role !== "system")
                .map(m => ({
                    role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
                    content: m.content,
                }));

            const response = await handleDirectorChat(userText, project, chatHistory);

            if (response.functionCalls) {
                for (const fc of response.functionCalls) {
                    if (fc.name) await onExecuteTool(fc.name, fc.args);
                }
            }

            const text = response.text || "Command executed.";
            setMessages(prev => [...prev, { role: "assistant", content: text }]);
        } catch (err) {
            console.error(err);
            setMessages(prev => [
                ...prev,
                {
                    role: "assistant",
                    content: "⚠️ Director signal lost. Check your connection and retry.",
                    isError: true,
                },
            ]);
        } finally {
            setIsTyping(false);
        }
    }, [currentPhase, project, onExecuteTool]);

    return { messages, isTyping, sendMessage, sendProactiveGreeting };
}
