
import React from 'react';
import { ProductionPhase } from '../types';

export interface CTACheckItem {
  label: string;
  done: boolean;
  warning?: boolean; // amber instead of red when not done
}

interface PhaseCTAProps {
  currentPhase: ProductionPhase;
  nextPhase: ProductionPhase | null;
  nextPhaseLabel: string;
  items: CTACheckItem[];
  onNext: () => void;
  onDirectorHelp: () => void;
  /** When false the Next button is disabled (blockers exist) */
  canAdvance: boolean;
  /** Optional: loading / processing state for the Next button */
  isProcessing?: boolean;
}

const NEXT_ICON: Record<string, string> = {
  manifest: 'fa-users',
  synthesis: 'fa-wand-magic-sparkles',
  post: 'fa-clapperboard',
};

export const PhaseCTA: React.FC<PhaseCTAProps> = ({
  currentPhase,
  nextPhase,
  nextPhaseLabel,
  items,
  onNext,
  onDirectorHelp,
  canAdvance,
  isProcessing = false,
}) => {
  const blockers = items.filter(i => !i.done && !i.warning);
  const warnings = items.filter(i => !i.done && i.warning);
  const completed = items.filter(i => i.done);

  return (
    <div
      className="w-full rounded-2xl border overflow-hidden mt-6"
      style={{
        background: 'linear-gradient(135deg, #0a1220 0%, #0e0e11 100%)',
        borderColor: canAdvance ? 'rgba(16,185,129,0.2)' : blockers.length > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
      }}
    >
      {/* Checklist row */}
      <div className="px-6 pt-5 pb-4 flex flex-wrap items-center gap-3">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{
              background: item.done
                ? 'rgba(16,185,129,0.08)'
                : item.warning
                  ? 'rgba(245,158,11,0.08)'
                  : 'rgba(239,68,68,0.08)',
            }}
          >
            <i
              className={`fa-solid ${item.done ? 'fa-check' : item.warning ? 'fa-triangle-exclamation' : 'fa-circle-xmark'} text-[9px]`}
              style={{
                color: item.done ? '#10b981' : item.warning ? '#f59e0b' : '#ef4444'
              }}
            ></i>
            <span
              className="text-[8px] font-bold uppercase tracking-wide"
              style={{
                color: item.done ? '#6ee7b7' : item.warning ? '#fcd34d' : '#fca5a5'
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Action row */}
      <div
        className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t"
        style={{ borderColor: 'rgba(255,255,255,0.05)' }}
      >
        {/* Left: status summary */}
        <div className="flex items-center gap-3">
          {blockers.length > 0 ? (
            <>
              <i className="fa-solid fa-circle-xmark text-red-400 text-sm"></i>
              <span className="text-[9px] font-bold text-red-300">
                {blockers.length} issue{blockers.length > 1 ? 's' : ''} must be resolved before continuing
              </span>
            </>
          ) : warnings.length > 0 ? (
            <>
              <i className="fa-solid fa-triangle-exclamation text-amber-400 text-sm"></i>
              <span className="text-[9px] font-bold text-amber-300">
                {warnings.length} optional item{warnings.length > 1 ? 's' : ''} recommended — you can still continue
              </span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-circle-check text-green-400 text-sm"></i>
              <span className="text-[9px] font-bold text-green-300">
                {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)} phase complete
                {nextPhase ? ` — ready for ${nextPhaseLabel}` : ' — all phases done!'}
              </span>
            </>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Ask Director */}
          <button
            onClick={onDirectorHelp}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl nm-button text-mystic-gray hover:text-cyan-400 transition-all border border-white/5"
          >
            <i className="fa-solid fa-brain text-[9px]" style={{ color: '#00d4ff' }}></i>
            <span className="text-[8px] font-black uppercase tracking-widest hidden sm:block">Ask Director</span>
          </button>

          {/* Next phase CTA */}
          {nextPhase && (
            <button
              onClick={onNext}
              disabled={!canAdvance || isProcessing}
              className={`
                flex items-center gap-3 px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all
                ${canAdvance && !isProcessing
                  ? 'nm-button-gold text-white shadow-nm-gold hover:scale-105 active:scale-95'
                  : 'nm-button text-mystic-gray cursor-not-allowed opacity-40'
                }
              `}
            >
              {isProcessing ? (
                <i className="fa-solid fa-spinner fa-spin text-[9px]"></i>
              ) : (
                <i className={`fa-solid ${NEXT_ICON[nextPhase] || 'fa-arrow-right'} text-[9px]`}></i>
              )}
              Continue to {nextPhaseLabel}
              {canAdvance && !isProcessing && (
                <i className="fa-solid fa-arrow-right text-[9px]"></i>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
