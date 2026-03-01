import React from 'react';
import { WorkflowStep } from '../../services/workflowOrchestrator';
import { ProductionPhase } from '../../types';

interface DirectorProgressStripProps {
  phase: ProductionPhase;
  steps: WorkflowStep[];
  currentStepId: string | null;
}

const PHASE_COLORS: Record<ProductionPhase, string> = {
  genesis: '#8b5cf6',
  manifest: '#3b82f6',
  synthesis: '#00d4ff',
  post: '#f59e0b',
};

export const DirectorProgressStrip: React.FC<DirectorProgressStripProps> = ({
  phase,
  steps,
  currentStepId,
}) => {
  const color = PHASE_COLORS[phase];

  return (
    <div
      className="flex items-center gap-0.5 px-3 py-2 overflow-x-auto scrollbar-hide shrink-0"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.2)' }}
    >
      {steps.map((step, idx) => {
        const isActive = step.id === currentStepId;
        const isDone = step.status === 'completed';
        const isSkipped = step.status === 'skipped';
        const isOptional = step.priority !== 'critical';

        return (
          <React.Fragment key={step.id}>
            {idx > 0 && (
              <div
                className="w-3 h-px shrink-0"
                style={{ background: isDone ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)' }}
              />
            )}
            <div
              className="flex items-center gap-1 px-2 py-1 rounded shrink-0 transition-all duration-200"
              style={{
                background: isActive ? `${color}15` : 'transparent',
                border: isActive ? `1px solid ${color}45` : '1px solid transparent',
                opacity: isSkipped ? 0.35 : isDone ? 0.65 : isActive ? 1 : 0.45,
              }}
              title={`${step.label}${isOptional ? ' (optional)' : ''}: ${step.description}`}
            >
              {isDone ? (
                <i className="fa-solid fa-check text-[6px]" style={{ color: '#4ade80' }} />
              ) : isSkipped ? (
                <i className="fa-solid fa-forward-fast text-[6px]" style={{ color: 'rgba(255,255,255,0.3)' }} />
              ) : isActive ? (
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: color, boxShadow: `0 0 5px ${color}`, animation: 'pulse 2s infinite' }}
                />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-white/15" />
              )}
              <span
                className={`text-[8px] font-mono whitespace-nowrap ${isSkipped ? 'italic' : ''}`}
                style={{
                  color: isDone ? 'rgba(74,222,128,0.8)' : isActive ? color : 'rgba(161,161,170,0.7)',
                }}
              >
                {step.label}
              </span>
              {isOptional && !isDone && !isSkipped && (
                <span className="text-[6px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  opt
                </span>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
