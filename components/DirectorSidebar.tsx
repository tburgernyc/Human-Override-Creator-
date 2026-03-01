/**
 * DirectorSidebar — persistent right panel.
 *
 * Collapsed (52px wide):  vertical icon strip with phase badge.
 * Expanded  (420px wide): progress strip + chat thread + text input.
 *
 * The Director acts as a workflow conductor — proactively presenting
 * each production step with inline action buttons, full agency to
 * execute actions on the user's behalf, and a skip-scope dialog for
 * optional steps.
 */
import React, { useEffect } from 'react';
import { ProductionPhase, ProjectState } from '../types';
import { useDirector } from './Director/useDirector';
import { DirectorChatThread } from './Director/DirectorChatThread';
import { DirectorInput } from './Director/DirectorInput';
import { DirectorProgressStrip } from './Director/DirectorProgressStrip';
import { LogEntry } from '../types';

interface DirectorSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentPhase: ProductionPhase;
  project: ProjectState;
  onExecuteTool: (name: string, args: any) => Promise<any>;
  productionLog: LogEntry[];
  pendingInjection?: string | null;
  onClearInjection?: () => void;
  onGenerateCharacters?: () => Promise<void>;
  onGenerateScenes?: () => Promise<void>;
}

const PHASE_COLORS: Record<ProductionPhase, string> = {
  genesis: '#8b5cf6',
  manifest: '#3b82f6',
  synthesis: '#00d4ff',
  post: '#f59e0b',
};

const PHASE_LABELS: Record<ProductionPhase, string> = {
  genesis: 'Genesis',
  manifest: 'Manifest',
  synthesis: 'Synthesis',
  post: 'Post',
};

export const DirectorSidebar: React.FC<DirectorSidebarProps> = ({
  isOpen,
  onToggle,
  currentPhase,
  project,
  onExecuteTool,
  pendingInjection,
  onClearInjection,
  onGenerateCharacters,
  onGenerateScenes,
}) => {
  const {
    messages,
    isTyping,
    sendMessage,
    sendProactiveGreeting,
    currentStepId,
    handleAction,
    workflowSteps,
  } = useDirector({
    currentPhase,
    project,
    onExecuteTool,
    onGenerateCharacters,
    onGenerateScenes,
  });

  const phaseColor = PHASE_COLORS[currentPhase];

  // Greet on first open
  useEffect(() => {
    if (isOpen) {
      sendProactiveGreeting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Inject external messages (e.g. "Ask Director" from error cards)
  useEffect(() => {
    if (pendingInjection && isOpen) {
      sendMessage(pendingInjection);
      onClearInjection?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInjection, isOpen]);

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-[150] flex flex-col transition-all duration-300 ease-in-out"
      style={{
        width: isOpen ? '420px' : '52px',
        background: '#0a0e1a',
        borderLeft: `1px solid ${isOpen ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)'}`,
        boxShadow: isOpen ? '-4px 0 40px rgba(0,0,0,0.6)' : 'none',
      }}
    >
      {/* ── Collapsed Strip ───────────────────────────────── */}
      {!isOpen && (
        <div className="flex flex-col items-center gap-4 pt-24 pb-8 h-full">
          <button
            onClick={onToggle}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
            style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}
            title="Open Director"
          >
            <i className="fa-solid fa-brain text-[12px]" style={{ color: '#00d4ff' }} />
          </button>

          <div
            className="w-2 h-2 rounded-full"
            style={{ background: phaseColor, boxShadow: `0 0 6px ${phaseColor}` }}
            title={`Phase: ${currentPhase}`}
          />

          {isTyping && (
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          )}

          {messages.length > 0 && (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black"
              style={{ background: phaseColor, color: '#000' }}
            >
              {messages.length > 9 ? '9+' : messages.length}
            </div>
          )}

          <div
            className="mt-auto mb-4 text-[7px] font-black uppercase tracking-[0.3em] opacity-30"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#a1a1aa' }}
          >
            Director
          </div>
        </div>
      )}

      {/* ── Expanded Panel ────────────────────────────────── */}
      {isOpen && (
        <div className="flex flex-col h-full pt-20 pb-0">

          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: '1px solid rgba(0,212,255,0.1)', background: '#0d1526' }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${isTyping ? 'animate-ping' : ''}`}
                  style={{ background: '#00d4ff', boxShadow: isTyping ? 'none' : '0 0 8px #00d4ff' }}
                />
                {isTyping && (
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 rounded-full bg-cyan-400" />
                )}
              </div>
              <div>
                <h2 className="text-[13px] font-mono font-bold tracking-[0.15em] text-cyan-400 leading-none">
                  DIRECTOR
                </h2>
                <span className="text-[7px] font-mono tracking-widest opacity-60" style={{ color: phaseColor }}>
                  {isTyping ? 'PROCESSING...' : `${PHASE_LABELS[currentPhase].toUpperCase()} PHASE`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
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
              <button
                onClick={onToggle}
                className="w-7 h-7 rounded-full flex items-center justify-center text-mystic-gray hover:text-white transition-colors hover:bg-white/5"
              >
                <i className="fa-solid fa-chevron-right text-[10px]" />
              </button>
            </div>
          </div>

          {/* Workflow Progress Strip */}
          <DirectorProgressStrip
            phase={currentPhase}
            steps={workflowSteps}
            currentStepId={currentStepId}
          />

          {/* Chat thread */}
          <DirectorChatThread
            messages={messages}
            isTyping={isTyping}
            onChipSelect={sendMessage}
            onAction={handleAction}
          />

          {/* Text input */}
          <DirectorInput
            onSend={sendMessage}
            isTyping={isTyping}
            placeholder="Ask the Director anything..."
          />
        </div>
      )}
    </div>
  );
};
