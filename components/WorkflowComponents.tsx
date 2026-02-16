
import React from 'react';
import { ProductionPhase } from '../types';
import { PhaseChecklist, WorkflowStep, QualityGate } from '../services/workflowOrchestrator';
import { Intervention, InterventionAction } from '../services/interventionEngine';

// ==================== WorkflowProgress Component ====================

interface WorkflowProgressProps {
  phase: ProductionPhase;
  checklist: PhaseChecklist;
  onExecuteStep: (stepId: string) => Promise<void>;
  onSkipStep: (stepId: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({
  phase,
  checklist,
  onExecuteStep,
  onSkipStep,
  expanded,
  onToggle
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <i className="fa-solid fa-check-circle text-green-400 text-[10px]"></i>;
      case 'in_progress':
        return <i className="fa-solid fa-spinner fa-spin text-yellow-400 text-[10px]"></i>;
      case 'skipped':
        return <i className="fa-solid fa-minus-circle text-gray-500 text-[10px]"></i>;
      default:
        return <i className="fa-regular fa-circle text-gray-600 text-[10px]"></i>;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-red-400';
      case 'recommended':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const renderStep = (step: WorkflowStep, isOptional: boolean) => (
    <div
      key={step.id}
      className="flex items-center justify-between p-3 rounded-lg nm-inset-input border border-white/5 hover:border-white/10 transition-all"
    >
      <div className="flex items-center gap-3 flex-1">
        {getStatusIcon(step.status)}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold ${step.status === 'completed' ? 'text-green-400' : 'text-starlight'}`}>
              {step.label}
            </span>
            {!isOptional && step.priority === 'critical' && (
              <span className="px-1.5 py-0.5 rounded text-[6px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                Required
              </span>
            )}
          </div>
          <p className="text-[7px] text-mystic-gray mt-0.5">{step.description}</p>
        </div>
      </div>
      {step.status === 'pending' && (
        <div className="flex items-center gap-2">
          {step.autoExecutable && (
            <button
              onClick={() => onExecuteStep(step.id)}
              className="px-3 py-1.5 rounded-lg nm-button-gold text-white text-[7px] font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all"
            >
              <i className="fa-solid fa-bolt text-[6px] mr-1"></i>
              Execute
            </button>
          )}
          {isOptional && (
            <button
              onClick={() => onSkipStep(step.id)}
              className="px-3 py-1.5 rounded-lg nm-button text-mystic-gray text-[7px] font-bold uppercase tracking-wider hover:text-white transition-all border border-white/5"
            >
              Skip
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="border-b border-white/5 bg-gradient-to-r from-blue-500/5 to-transparent">
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="w-10 h-10 transform -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-white/10"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray={`${checklist.completionPercentage} 100`}
                className="text-blue-400"
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-blue-400">
              {checklist.completionPercentage}%
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-list-check text-blue-400 text-[10px]"></i>
              <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Workflow Progress</span>
            </div>
            <p className="text-[7px] text-mystic-gray mt-0.5">
              {checklist.requiredSteps.filter(s => s.status === 'completed').length}/{checklist.requiredSteps.length} required •{' '}
              {checklist.optionalSteps.filter(s => s.status === 'completed').length}/{checklist.optionalSteps.length} optional
            </p>
          </div>
        </div>
        <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-[8px] text-mystic-gray`}></i>
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
          {/* Required Steps */}
          {checklist.requiredSteps.length > 0 && (
            <div>
              <h4 className="text-[8px] font-black text-starlight uppercase tracking-widest mb-2">Required Steps</h4>
              <div className="space-y-2">
                {checklist.requiredSteps.map(step => renderStep(step, false))}
              </div>
            </div>
          )}

          {/* Optional Steps */}
          {checklist.optionalSteps.length > 0 && (
            <div>
              <h4 className="text-[8px] font-black text-mystic-gray uppercase tracking-widest mb-2">Optional Steps</h4>
              <div className="space-y-2">
                {checklist.optionalSteps.map(step => renderStep(step, true))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== ActiveInterventions Component ====================

interface ActiveInterventionsProps {
  interventions: Intervention[];
  onExecuteAction: (interventionId: string, action: InterventionAction) => Promise<void>;
  onDismiss: (interventionId: string) => void;
}

export const ActiveInterventions: React.FC<ActiveInterventionsProps> = ({
  interventions,
  onExecuteAction,
  onDismiss
}) => {
  if (interventions.length === 0) return null;

  const getInterventionStyle = (type: string) => {
    switch (type) {
      case 'celebration':
        return 'bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30';
      case 'warning':
        return 'bg-gradient-to-r from-amber-500/10 to-red-500/10 border-amber-500/30';
      case 'opportunity':
        return 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30';
      default:
        return 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30';
    }
  };

  const getInterventionIcon = (type: string) => {
    switch (type) {
      case 'celebration':
        return 'fa-party-horn';
      case 'warning':
        return 'fa-triangle-exclamation';
      case 'opportunity':
        return 'fa-lightbulb';
      default:
        return 'fa-info-circle';
    }
  };

  // Show max 3 interventions at once
  const visibleInterventions = interventions.slice(0, 3);

  return (
    <div className="px-5 pt-4 space-y-3">
      {visibleInterventions.map((intervention) => (
        <div
          key={intervention.id}
          className={`relative p-4 rounded-xl border-2 ${getInterventionStyle(intervention.type)} animate-in slide-in-from-top-2 duration-300 shadow-lg`}
        >
          {/* Dismiss button */}
          {intervention.dismissible && (
            <button
              onClick={() => onDismiss(intervention.id)}
              className="absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all text-mystic-gray hover:text-white"
            >
              <i className="fa-solid fa-xmark text-[8px]"></i>
            </button>
          )}

          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg nm-button flex items-center justify-center">
              <i className={`fa-solid ${getInterventionIcon(intervention.type)} text-[12px] text-luna-gold`}></i>
            </div>
            <div className="flex-1 pr-6">
              <h4 className="text-[10px] font-black text-starlight mb-1">{intervention.title}</h4>
              <p className="text-[8px] text-celestial-stone leading-relaxed">{intervention.message}</p>
            </div>
          </div>

          {/* Actions */}
          {intervention.actions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {intervention.actions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => onExecuteAction(intervention.id, action)}
                  className="px-4 py-2 rounded-lg nm-button-gold text-white text-[8px] font-black uppercase tracking-wider flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg"
                >
                  <i className={`fa-solid ${action.icon} text-[7px]`}></i>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Queue indicator */}
      {interventions.length > 3 && (
        <div className="text-center">
          <span className="text-[7px] text-mystic-gray italic">
            +{interventions.length - 3} more suggestion{interventions.length - 3 !== 1 ? 's' : ''} pending
          </span>
        </div>
      )}
    </div>
  );
};

// ==================== QualityGateModal Component ====================

interface QualityGateModalProps {
  visible: boolean;
  gates: QualityGate[];
  targetPhase: ProductionPhase;
  onClose: () => void;
  onProceed: () => void;
  onFixGate: (gateId: string) => Promise<void>;
  onOverride: (gateId: string) => void;
}

export const QualityGateModal: React.FC<QualityGateModalProps> = ({
  visible,
  gates,
  targetPhase,
  onClose,
  onProceed,
  onFixGate,
  onOverride
}) => {
  if (!visible) return null;

  const blockers = gates.filter(g => g.severity === 'blocker');
  const warnings = gates.filter(g => g.severity === 'warning');
  const canProceed = blockers.length === 0;

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'blocker':
        return <i className="fa-solid fa-circle-xmark text-red-500 text-[12px]"></i>;
      case 'warning':
        return <i className="fa-solid fa-triangle-exclamation text-amber-500 text-[12px]"></i>;
      default:
        return <i className="fa-solid fa-info-circle text-blue-500 text-[12px]"></i>;
    }
  };

  const phaseNames: Record<ProductionPhase, string> = {
    genesis: 'Genesis',
    manifest: 'Manifest',
    synthesis: 'Synthesis',
    post: 'Post-Production'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-eclipse-black rounded-2xl nm-panel border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-eclipse-black border-b border-white/10 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl nm-button flex items-center justify-center">
              <i className="fa-solid fa-shield-check text-luna-gold text-[14px]"></i>
            </div>
            <div className="flex-1">
              <h2 className="text-[12px] font-black text-white uppercase tracking-widest">Quality Check</h2>
              <p className="text-[8px] text-mystic-gray mt-0.5">
                Review these items before proceeding to {phaseNames[targetPhase]}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all text-mystic-gray hover:text-white"
            >
              <i className="fa-solid fa-xmark text-[10px]"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Blockers */}
          {blockers.length > 0 && (
            <div>
              <h3 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <i className="fa-solid fa-circle-xmark text-[10px]"></i>
                Critical Issues ({blockers.length})
              </h3>
              <div className="space-y-3">
                {blockers.map((gate) => (
                  <div
                    key={gate.id}
                    className="p-4 rounded-xl nm-inset-input border-2 border-red-500/30 bg-red-500/5"
                  >
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(gate.severity)}
                      <div className="flex-1">
                        <p className="text-[9px] font-bold text-starlight">{gate.message}</p>
                        {gate.autoFixable && (
                          <button
                            onClick={() => onFixGate(gate.id)}
                            className="mt-2 px-3 py-1.5 rounded-lg nm-button-gold text-white text-[7px] font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all"
                          >
                            <i className="fa-solid fa-wrench text-[6px] mr-1"></i>
                            Auto-Fix
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
                Recommendations ({warnings.length})
              </h3>
              <div className="space-y-3">
                {warnings.map((gate) => (
                  <div
                    key={gate.id}
                    className="p-4 rounded-xl nm-inset-input border-2 border-amber-500/30 bg-amber-500/5"
                  >
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(gate.severity)}
                      <div className="flex-1">
                        <p className="text-[9px] font-bold text-starlight">{gate.message}</p>
                        {gate.autoFixable && (
                          <button
                            onClick={() => onFixGate(gate.id)}
                            className="mt-2 px-3 py-1.5 rounded-lg nm-button-gold text-white text-[7px] font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all"
                          >
                            <i className="fa-solid fa-wrench text-[6px] mr-1"></i>
                            Auto-Fix
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-eclipse-black border-t border-white/10 px-6 py-4 rounded-b-2xl">
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-xl nm-button text-mystic-gray text-[8px] font-black uppercase tracking-widest hover:text-white transition-all border border-white/5"
            >
              Go Back
            </button>
            <div className="flex items-center gap-3">
              {blockers.length > 0 && (
                <button
                  onClick={() => {
                    blockers.forEach(b => b.autoFixable && onFixGate(b.id));
                  }}
                  disabled={!blockers.some(b => b.autoFixable)}
                  className="px-6 py-3 rounded-xl nm-button text-starlight text-[8px] font-black uppercase tracking-widest hover:text-luna-gold transition-all border border-white/5 disabled:opacity-30"
                >
                  <i className="fa-solid fa-wrench text-[7px] mr-2"></i>
                  Fix All Auto-Fixable
                </button>
              )}
              <button
                onClick={onProceed}
                disabled={!canProceed}
                className="px-6 py-3 rounded-xl nm-button-gold text-white text-[8px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {canProceed ? 'Proceed to ' + phaseNames[targetPhase] : 'Fix Critical Issues First'}
                <i className="fa-solid fa-arrow-right text-[7px] ml-2"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
