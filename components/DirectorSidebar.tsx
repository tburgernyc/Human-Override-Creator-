
/**
 * DirectorSidebar — always-rendered right panel.
 *
 * Collapsed (48px wide):  vertical icon strip with phase badge + ping dot.
 * Expanded (420px wide):  full Director interface (header, chat, input, log).
 *
 * Replaces the conditional `<aside>` in App.tsx so the Director is a
 * persistent fixture rather than an overlay that appears and disappears.
 */
import React, { useEffect, useRef } from 'react';
import { ProductionPhase, ProjectState } from '../types';
import { useDirector } from './Director/useDirector';
import { DirectorChatThread } from './Director/DirectorChatThread';
import { DirectorInput } from './Director/DirectorInput';
import { LogEntry } from '../types';

// ─── Phase-Aware Action Cards ───────────────────────────────────────────────

interface ActionCard {
  icon: string;
  title: string;
  description: string;
  action: string;            // human-readable hint shown as a chip
  sendText: string;          // text to inject into Director chat
  color: string;
}

function getPhaseActionCards(phase: ProductionPhase, project: ProjectState): ActionCard[] {
  switch (phase) {
    case 'genesis':
      return [
        !project.script || project.script.trim().length < 50
          ? { icon: 'fa-pen', title: 'Write a Script', description: 'No script detected. I can generate one from an idea.', action: 'Generate Script', sendText: 'Help me write a script from scratch.', color: '#8b5cf6' }
          : { icon: 'fa-stethoscope', title: 'Run Script Doctor', description: 'Diagnose pacing, structure, and scene balance.', action: 'Script Doctor', sendText: 'Run a Script Doctor analysis on my script and tell me what to fix.', color: '#8b5cf6' },
        project.scenes.length === 0
          ? { icon: 'fa-play', title: 'Analyze Script', description: 'Extract scenes and characters automatically.', action: 'Analyze Now', sendText: 'Analyze my script and extract all scenes and characters.', color: '#8b5cf6' }
          : { icon: 'fa-sliders', title: 'Refine Scenes', description: `${project.scenes.length} scenes extracted. Want me to review them?`, action: 'Review Scenes', sendText: `Review my ${project.scenes.length} scenes for narrative flow and suggest improvements.`, color: '#8b5cf6' },
      ];

    case 'manifest': {
      const noVoice = project.characters.filter(c => !c.voiceId).length;
      const noDNA = project.characters.filter(c => !c.characterDNA).length;
      return [
        noVoice > 0
          ? { icon: 'fa-microphone', title: `${noVoice} Voice${noVoice > 1 ? 's' : ''} Missing`, description: 'Characters need voice assignments before audio generation.', action: 'Assign Voices', sendText: `Assign voices to the ${noVoice} characters that still need them.`, color: '#3b82f6' }
          : { icon: 'fa-check', title: 'All Voices Assigned', description: 'Good — every character has a voice ready.', action: 'Voice Tips', sendText: 'Any tips to improve voice consistency and character identity in my production?', color: '#10b981' },
        noDNA > 0
          ? { icon: 'fa-dna', title: `${noDNA} DNA Lock${noDNA > 1 ? 's' : ''} Missing`, description: 'Lock character DNA for cross-scene visual consistency.', action: 'Synthesize DNA', sendText: `Synthesize CharacterDNA identity locks for the ${noDNA} characters that are missing them.`, color: '#3b82f6' }
          : { icon: 'fa-lock', title: 'All DNA Locked', description: 'Identity anchors active for all characters.', action: 'Consistency Check', sendText: 'Run a visual consistency audit on all character references.', color: '#10b981' },
      ];
    }

    case 'synthesis': {
      const total = project.scenes.length;
      const complete = project.scenes.filter(s => project.assets[s.id]?.status === 'complete').length;
      const errors = project.scenes.filter(s => project.assets[s.id]?.status === 'error').length;
      return [
        errors > 0
          ? { icon: 'fa-triangle-exclamation', title: `${errors} Scene${errors > 1 ? 's' : ''} Failed`, description: 'I can diagnose failures and suggest retry strategies.', action: 'Diagnose Errors', sendText: `${errors} scene(s) failed during asset generation. Help me figure out why and retry them.`, color: '#ef4444' }
          : { icon: 'fa-bolt', title: 'Generate All Assets', description: `${complete}/${total} scenes have assets. I can batch generate the rest.`, action: 'Batch Generate', sendText: 'What scenes still need assets and what should I watch out for during generation?', color: '#00d4ff' },
        { icon: 'fa-eye', title: 'Continuity Check', description: 'Audit character visual consistency across scenes.', action: 'Run Audit', sendText: 'Run a continuity audit to check character visual consistency across all generated scenes.', color: '#00d4ff' },
      ];
    }

    case 'post':
      return [
        { icon: 'fa-palette', title: 'Color Grading', description: 'Apply a cinematic LUT for visual consistency.', action: 'Suggest LUT', sendText: 'Suggest the best LUT preset for my production style and explain how to apply it.', color: '#f59e0b' },
        { icon: 'fa-chart-bar', title: 'Viral Analysis', description: 'Predict engagement patterns and optimize the hook.', action: 'Analyze Virality', sendText: 'Analyze the viral potential of my production and tell me what to change for maximum engagement.', color: '#f59e0b' },
      ];

    default:
      return [];
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface DirectorSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentPhase: ProductionPhase;
  project: ProjectState;
  onExecuteTool: (name: string, args: any) => Promise<any>;
  productionLog: LogEntry[];
  /** External message to inject (e.g. "Scene 4 failed: [error]. Help?") */
  pendingInjection?: string | null;
  onClearInjection?: () => void;
}

export const DirectorSidebar: React.FC<DirectorSidebarProps> = ({
  isOpen,
  onToggle,
  currentPhase,
  project,
  onExecuteTool,
  productionLog,
  pendingInjection,
  onClearInjection,
}) => {
  const { messages, isTyping, sendMessage, sendProactiveGreeting } = useDirector({
    currentPhase,
    project,
    onExecuteTool,
  });

  const prevPhaseRef = useRef<ProductionPhase>(currentPhase);

  // Greet on first open
  useEffect(() => {
    if (isOpen) {
      sendProactiveGreeting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Re-greet when phase changes while open
  useEffect(() => {
    if (prevPhaseRef.current !== currentPhase && isOpen && messages.length > 0) {
      sendMessage(`We just entered the ${currentPhase.toUpperCase()} phase. What's the first thing I should do here?`);
    }
    prevPhaseRef.current = currentPhase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhase]);

  // Inject external message (e.g. "Ask Director" from error card)
  useEffect(() => {
    if (pendingInjection && isOpen) {
      sendMessage(pendingInjection);
      onClearInjection?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInjection, isOpen]);

  const actionCards = getPhaseActionCards(currentPhase, project);
  const phaseColors: Record<ProductionPhase, string> = {
    genesis: '#8b5cf6',
    manifest: '#3b82f6',
    synthesis: '#00d4ff',
    post: '#f59e0b',
  };
  const phaseColor = phaseColors[currentPhase];

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-[150] flex flex-col transition-all duration-300 ease-in-out"
      style={{
        width: isOpen ? '420px' : '52px',
        background: '#0a0e1a',
        borderLeft: `1px solid ${isOpen ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)'}`,
        boxShadow: isOpen ? '-4px 0 40px rgba(0,0,0,0.6)' : 'none',
      }}
    >
      {/* ── Collapsed Strip ───────────────────────────────────── */}
      {!isOpen && (
        <div className="flex flex-col items-center gap-4 pt-24 pb-8 h-full">
          {/* Toggle button */}
          <button
            onClick={onToggle}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
            style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}
            title="Open Director"
          >
            <i className="fa-solid fa-brain text-[12px]" style={{ color: '#00d4ff' }}></i>
          </button>

          {/* Phase indicator dot */}
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: phaseColor, boxShadow: `0 0 6px ${phaseColor}` }}
            title={`Phase: ${currentPhase}`}
          ></div>

          {/* Ping if typing */}
          {isTyping && (
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>
          )}

          {/* Unread messages indicator */}
          {messages.length > 0 && !isOpen && (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black"
              style={{ background: phaseColor, color: '#000' }}
            >
              {messages.length > 9 ? '9+' : messages.length}
            </div>
          )}

          {/* Vertical label */}
          <div
            className="mt-auto mb-4 text-[7px] font-black uppercase tracking-[0.3em] opacity-30"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#a1a1aa' }}
          >
            Director
          </div>
        </div>
      )}

      {/* ── Expanded Panel ────────────────────────────────────── */}
      {isOpen && (
        <div className="flex flex-col h-full pt-20 pb-0">
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 shrink-0"
            style={{ borderBottom: '1px solid rgba(0,212,255,0.12)', background: '#0d1526' }}
          >
            <div className="flex items-center gap-3">
              {/* Status dot */}
              <div className="relative">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${isTyping ? 'animate-ping' : ''}`}
                  style={{ background: '#00d4ff', boxShadow: isTyping ? 'none' : '0 0 8px #00d4ff' }}
                ></div>
                {isTyping && (
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
                )}
              </div>

              <div>
                <h2 className="text-[13px] font-mono font-bold tracking-[0.15em] text-cyan-400 leading-none">
                  DIRECTOR
                </h2>
                <span className="text-[7px] text-cyan-900 font-mono tracking-widest opacity-80">
                  {isTyping ? 'PROCESSING...' : `${currentPhase.toUpperCase()} PHASE`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Phase badge */}
              <div
                className="px-2.5 py-1 rounded text-[7px] font-black uppercase tracking-widest"
                style={{
                  background: `${phaseColor}18`,
                  border: `1px solid ${phaseColor}40`,
                  color: phaseColor,
                }}
              >
                {currentPhase}
              </div>

              {/* Close */}
              <button
                onClick={onToggle}
                className="w-8 h-8 rounded-full flex items-center justify-center text-mystic-gray hover:text-white transition-colors hover:bg-white/5"
              >
                <i className="fa-solid fa-chevron-right text-[10px]"></i>
              </button>
            </div>
          </div>

          {/* Action Cards — shown when no messages yet OR as sticky top cards */}
          {messages.length === 0 && (
            <div className="px-4 pt-4 space-y-2.5 shrink-0">
              <p className="text-[7px] font-black uppercase tracking-widest text-mystic-gray mb-3 flex items-center gap-2">
                <i className="fa-solid fa-bolt text-cyan-400 text-[8px]"></i>
                Suggested Actions
              </p>
              {actionCards.map((card, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(card.sendText)}
                  className="w-full text-left p-3 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: 'rgba(30,58,95,0.4)',
                    borderLeft: `3px solid ${card.color}`,
                    border: `1px solid rgba(255,255,255,0.05)`,
                    borderLeftWidth: '3px',
                    borderLeftColor: card.color,
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <i
                      className={`fa-solid ${card.icon} text-[10px] mt-0.5 flex-shrink-0`}
                      style={{ color: card.color }}
                    ></i>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-starlight leading-tight truncate">{card.title}</p>
                      <p className="text-[7px] text-mystic-gray mt-0.5 leading-relaxed line-clamp-2">{card.description}</p>
                    </div>
                    <span
                      className="text-[6px] font-black uppercase tracking-wider px-2 py-1 rounded flex-shrink-0"
                      style={{ background: `${card.color}18`, color: card.color }}
                    >
                      {card.action}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Chat thread */}
          <DirectorChatThread
            messages={messages}
            isTyping={isTyping}
            currentPhase={currentPhase}
            project={project}
            onChipSelect={sendMessage}
          />

          {/* Input */}
          <DirectorInput
            onSend={sendMessage}
            isTyping={isTyping}
          />

          {/* Mini production log */}
          {productionLog.length > 0 && (
            <div
              className="px-4 py-3 shrink-0"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.3)' }}
            >
              <p className="text-[6px] font-black uppercase tracking-widest text-mystic-gray mb-2 flex items-center gap-1.5">
                <i className="fa-solid fa-terminal text-luna-gold text-[7px]"></i>
                Live Console
              </p>
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {productionLog.slice(0, 4).map(log => (
                  <div key={log.id} className="text-[7px] font-mono flex gap-2 leading-relaxed">
                    <span className="text-mystic-gray opacity-40 shrink-0 w-12">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span
                      className="truncate"
                      style={{
                        color: log.type === 'error' ? '#fca5a5'
                          : log.type === 'success' ? '#6ee7b7'
                          : log.type === 'ai_suggestion' ? '#93c5fd'
                          : '#a1a1aa'
                      }}
                    >
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
