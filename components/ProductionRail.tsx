
import React from 'react';
import { ProductionPhase, ProjectState } from '../types';

interface PhaseConfig {
  id: ProductionPhase;
  label: string;
  shortLabel: string;
  number: string;
  icon: string;
  color: string;
  glowColor: string;
}

const PHASES: PhaseConfig[] = [
  { id: 'genesis',   label: 'Genesis',   shortLabel: 'GEN', number: '01', icon: 'fa-seedling',            color: '#8b5cf6', glowColor: 'rgba(139,92,246,0.35)' },
  { id: 'manifest',  label: 'Manifest',  shortLabel: 'MNF', number: '02', icon: 'fa-users',               color: '#3b82f6', glowColor: 'rgba(59,130,246,0.35)' },
  { id: 'synthesis', label: 'Synthesis', shortLabel: 'SYN', number: '03', icon: 'fa-wand-magic-sparkles', color: '#00d4ff', glowColor: 'rgba(0,212,255,0.35)' },
  { id: 'post',      label: 'Post',      shortLabel: 'PST', number: '04', icon: 'fa-clapperboard',        color: '#f59e0b', glowColor: 'rgba(245,158,11,0.35)' },
];

/** Compute 0–100 completion for each phase */
export function computePhaseCompletion(project: ProjectState): Record<ProductionPhase, number> {
  const genesis = (() => {
    if (!project.script) return 0;
    if (project.scenes.length > 0) return 100;
    return 40;
  })();

  const manifest = (() => {
    if (project.characters.length === 0) return 0;
    const voiceCount = project.characters.filter(c => c.voiceId).length;
    const dnaCount = project.characters.filter(c => c.characterDNA).length;
    const voicePct = (voiceCount / project.characters.length) * 60;
    const dnaPct = (dnaCount / project.characters.length) * 40;
    return Math.round(voicePct + dnaPct);
  })();

  const synthesis = (() => {
    if (project.scenes.length === 0) return 0;
    const complete = project.scenes.filter(s => project.assets[s.id]?.status === 'complete').length;
    return Math.round((complete / project.scenes.length) * 100);
  })();

  const post = (() => {
    const allComplete = project.scenes.length > 0 &&
      project.scenes.every(s => project.assets[s.id]?.status === 'complete');
    if (!allComplete) return 0;
    let score = 50;
    if (project.mastering?.lutPreset && project.mastering.lutPreset !== 'none') score += 25;
    if (project.viralData) score += 25;
    return score;
  })();

  return { genesis, manifest, synthesis, post };
}

interface ProductionRailProps {
  activePhase: ProductionPhase;          // computed: furthest reached phase
  selectedPhase: ProductionPhase;        // user-selected tab
  onSelectPhase: (phase: ProductionPhase) => void;
  project: ProjectState;
  isBatchProcessing: boolean;
  batchProgress: { completed: number; total: number };
  errorCount: number;
  directorOpen: boolean;
  onToggleDirector: () => void;
  directorMode: 'guided' | 'expert';
  onToggleMode: () => void;
}

export const ProductionRail: React.FC<ProductionRailProps> = ({
  activePhase,
  selectedPhase,
  onSelectPhase,
  project,
  isBatchProcessing,
  batchProgress,
  errorCount,
  directorOpen,
  onToggleDirector,
  directorMode,
  onToggleMode,
}) => {
  const completion = computePhaseCompletion(project);
  const phaseOrder: ProductionPhase[] = ['genesis', 'manifest', 'synthesis', 'post'];
  const activeIdx = phaseOrder.indexOf(activePhase);

  const isPhaseAccessible = (phase: ProductionPhase): boolean => {
    if (directorMode === 'expert') return true;
    const phaseIdx = phaseOrder.indexOf(phase);
    return phaseIdx <= activeIdx + 1; // can go one ahead or any prior
  };

  return (
    <div
      className="w-full rounded-2xl border border-white/5 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0a1220 0%, #0e0e11 100%)' }}
    >
      {/* Main rail row */}
      <div className="flex items-center gap-0 px-4 py-3">

        {/* Phase pills */}
        <div className="flex-1 flex items-center gap-1.5">
          {PHASES.map((phase, idx) => {
            const pct = completion[phase.id];
            const isSelected = selectedPhase === phase.id;
            const isCompleted = pct === 100;
            const accessible = isPhaseAccessible(phase.id);
            const isActive = activePhase === phase.id;
            const phaseIdx = phaseOrder.indexOf(phase.id);
            const isFuture = phaseIdx > activeIdx;

            return (
              <React.Fragment key={phase.id}>
                <button
                  onClick={() => accessible && onSelectPhase(phase.id)}
                  disabled={!accessible}
                  title={!accessible ? `Complete ${PHASES[phaseIdx - 1]?.label} phase first` : undefined}
                  className={`
                    relative flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-300
                    ${isSelected
                      ? 'nm-button-gold text-white scale-105'
                      : accessible
                        ? 'nm-button text-celestial-stone hover:text-white hover:scale-[1.02]'
                        : 'opacity-25 cursor-not-allowed'
                    }
                  `}
                  style={isSelected ? {
                    boxShadow: `0 0 12px ${phase.glowColor}, 4px 4px 8px #1d4ed8, -4px -4px 8px #60a5fa`
                  } : undefined}
                >
                  {/* Phase number */}
                  <span
                    className="text-[7px] font-black font-mono opacity-40"
                    style={{ color: isSelected ? '#fff' : phase.color }}
                  >
                    {phase.number}
                  </span>

                  {/* Icon */}
                  <i
                    className={`fa-solid ${phase.icon} text-[10px]`}
                    style={{ color: isSelected ? '#fff' : isCompleted ? '#10b981' : isFuture ? '#4b5563' : phase.color }}
                  ></i>

                  {/* Label — hidden on very small screens */}
                  <span className="hidden sm:block text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                    {phase.label}
                  </span>

                  {/* Completion badge */}
                  <span
                    className={`
                      hidden md:flex items-center justify-center text-[7px] font-black font-mono
                      px-1.5 py-0.5 rounded-full min-w-[28px]
                    `}
                    style={{
                      background: isCompleted ? 'rgba(16,185,129,0.15)' : isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                      color: isCompleted ? '#10b981' : isSelected ? '#fff' : '#6b7280'
                    }}
                  >
                    {isCompleted ? '✓' : `${pct}%`}
                  </span>

                  {/* Circular progress ring — shown when active and not complete */}
                  {isActive && !isCompleted && pct > 0 && (
                    <svg
                      className="absolute -bottom-0.5 left-1/2 -translate-x-1/2"
                      width="28" height="3" viewBox="0 0 28 3"
                    >
                      <rect width="28" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
                      <rect
                        width={`${(pct / 100) * 28}`} height="3" rx="1.5"
                        style={{ fill: phase.color, transition: 'width 0.6s ease' }}
                      />
                    </svg>
                  )}
                </button>

                {/* Arrow connector */}
                {idx < PHASES.length - 1 && (
                  <i
                    className="fa-solid fa-chevron-right text-[8px] opacity-20 flex-shrink-0"
                  ></i>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-white/5 mx-3 flex-shrink-0"></div>

        {/* Status indicators */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Batch progress indicator */}
          {isBatchProcessing && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <i className="fa-solid fa-spinner fa-spin text-[10px] text-cyan-400"></i>
              <span className="text-[8px] font-black text-cyan-400 font-mono whitespace-nowrap">
                {batchProgress.completed}/{batchProgress.total}
              </span>
            </div>
          )}

          {/* Error count */}
          {errorCount > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <i className="fa-solid fa-triangle-exclamation text-[10px] text-red-400"></i>
              <span className="text-[8px] font-black text-red-400">{errorCount}</span>
            </div>
          )}

          {/* Expert / Guided mode toggle */}
          <button
            onClick={onToggleMode}
            title={directorMode === 'guided' ? 'Switch to Expert mode (free navigation)' : 'Switch to Guided mode'}
            className="px-2.5 py-1.5 rounded-xl nm-button flex items-center gap-1.5 group transition-all"
          >
            <i
              className={`fa-solid ${directorMode === 'expert' ? 'fa-unlock' : 'fa-lock'} text-[9px]`}
              style={{ color: directorMode === 'expert' ? '#f59e0b' : '#6b7280' }}
            ></i>
            <span className="text-[7px] font-black uppercase tracking-widest text-mystic-gray group-hover:text-white hidden lg:block">
              {directorMode === 'expert' ? 'Expert' : 'Guided'}
            </span>
          </button>

          {/* Director toggle */}
          <button
            onClick={onToggleDirector}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all nm-button
              ${directorOpen
                ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                : 'text-mystic-gray hover:text-white border border-white/5'
              }
            `}
            style={directorOpen ? { boxShadow: '0 0 8px rgba(0,212,255,0.2)' } : undefined}
          >
            <i className="fa-solid fa-brain text-[10px]"></i>
            <span className="text-[8px] font-black uppercase tracking-widest hidden sm:block">
              Director
            </span>
            {directorOpen && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            )}
          </button>
        </div>
      </div>

      {/* Batch progress bar — only shown during batch */}
      {isBatchProcessing && batchProgress.total > 0 && (
        <div className="h-1 bg-white/5 w-full">
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{
              width: `${(batchProgress.completed / batchProgress.total) * 100}%`,
              background: 'linear-gradient(90deg, #00d4ff, #3b82f6)',
              boxShadow: '0 0 8px rgba(0,212,255,0.5)'
            }}
          ></div>
        </div>
      )}
    </div>
  );
};
