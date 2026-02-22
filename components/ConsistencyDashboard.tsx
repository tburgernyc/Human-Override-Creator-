
import React, { useState } from 'react';
import { ProjectState, ConsistencyScore } from '../types';
import { auditCharacterConsistency, ConsistencyAuditResult } from '../services/gemini';

interface ConsistencyDashboardProps {
  project: ProjectState;
  onUpdateConsistencyScores: (scores: Record<string, ConsistencyScore>) => void;
  onMarkScenesForRegeneration: (sceneIds: number[]) => void;
  onClose: () => void;
}

const ScoreBar: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const color = value >= 80 ? 'bg-deep-sage' : value >= 60 ? 'bg-solar-amber' : 'bg-red-500';
  const textColor = value >= 80 ? 'text-deep-sage' : value >= 60 ? 'text-solar-amber' : 'text-red-500';
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[8px] text-mystic-gray uppercase tracking-widest font-bold">{label}</span>
        <span className={`text-[8px] font-bold font-mono ${textColor}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${value}%` }}></div>
      </div>
    </div>
  );
};

const HeatmapCell: React.FC<{ sceneId: number; score: number; issues: string[]; selected: boolean; onClick: () => void }> = ({
  sceneId, score, issues, selected, onClick
}) => {
  const bg = score >= 80 ? 'bg-deep-sage/40 border-deep-sage/30' : score >= 60 ? 'bg-solar-amber/30 border-solar-amber/30' : 'bg-red-500/30 border-red-500/30';
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-lg border text-center transition-all hover:scale-105 ${bg} ${selected ? 'ring-2 ring-white/50' : ''}`}
      title={issues.join(', ') || 'No issues'}
    >
      <p className="text-[7px] text-mystic-gray font-mono">#{sceneId}</p>
      <p className="text-[9px] font-bold text-white">{score}</p>
    </button>
  );
};

export const ConsistencyDashboard: React.FC<ConsistencyDashboardProps> = ({
  project, onUpdateConsistencyScores, onMarkScenesForRegeneration, onClose
}) => {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState('');
  const [localScores, setLocalScores] = useState<Record<string, ConsistencyScore>>(project.consistencyScores || {});
  const [localAuditDetails, setLocalAuditDetails] = useState<Record<string, ConsistencyAuditResult[]>>({});
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);

  const runFullAudit = async () => {
    setIsAuditing(true);
    const newScores: Record<string, ConsistencyScore> = {};
    const newDetails: Record<string, ConsistencyAuditResult[]> = {};

    for (const char of project.characters) {
      setAuditProgress(`Auditing ${char.name}...`);
      const scenesWithChar = project.scenes.filter(s => (s.charactersInScene || []).includes(char.name));
      const sceneImages = scenesWithChar
        .filter(s => project.assets[s.id]?.imageUrl)
        .map(s => ({ sceneId: s.id, imageBase64: project.assets[s.id]?.imageUrl as string }));

      if (sceneImages.length === 0) continue;

      try {
        const results = await auditCharacterConsistency(char, sceneImages);
        newDetails[char.id] = results;

        const scores = results.map(r => r.score);
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

        // Parse issue categories from AI descriptions
        const faceIssues = results.flatMap(r => r.issues.filter(i => /face|eyes|eyebrow|nose|jaw|cheek/i.test(i)));
        const hairIssues = results.flatMap(r => r.issues.filter(i => /hair|color|style/i.test(i)));
        const clothingIssues = results.flatMap(r => r.issues.filter(i => /cloth|wear|dress|outfit|suit/i.test(i)));
        const marksIssues = results.flatMap(r => r.issues.filter(i => /scar|mark|tattoo|distinctive/i.test(i)));

        const faceScore = Math.max(0, 100 - faceIssues.length * 15);
        const hairScore = Math.max(0, 100 - hairIssues.length * 15);
        const clothingScore = Math.max(0, 100 - clothingIssues.length * 15);
        const marksScore = Math.max(0, 100 - marksIssues.length * 20);

        newScores[char.id] = {
          overall: avg,
          face: faceScore,
          hair: hairScore,
          clothing: clothingScore,
          marks: marksScore,
          lastAudit: Date.now(),
          sceneScores: Object.fromEntries(results.map(r => [r.sceneId, { score: r.score, issues: r.issues }])),
        };
      } catch (e) {
        console.error(`[ConsistencyDashboard] Audit failed for ${char.name}:`, e);
      }
    }

    setLocalScores(newScores);
    setLocalAuditDetails(newDetails);
    onUpdateConsistencyScores(newScores);
    setAuditProgress('');
    setIsAuditing(false);
  };

  const getFailingScenes = (): number[] => {
    const failing = new Set<number>();
    Object.values(localScores).forEach(score => {
      if (score.sceneScores) {
        Object.entries(score.sceneScores).forEach(([id, data]) => {
          if (data.score < 60) failing.add(Number(id));
        });
      }
    });
    return Array.from(failing);
  };

  const failingScenes = getFailingScenes();

  const selectedCharDetails = selectedCharId ? localAuditDetails[selectedCharId] : null;
  const selectedChar = project.characters.find(c => c.id === selectedCharId);

  return (
    <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-6xl h-full max-h-[90vh] flex flex-col glass-panel rounded-[2rem] border border-white/5 overflow-hidden">

        {/* Header */}
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-deep-sage/10 border border-deep-sage/30 flex items-center justify-center text-deep-sage">
              <i className="fa-solid fa-chart-mixed text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono italic">Consistency Dashboard</h2>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">
                Per-character visual integrity scores across the timeline
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {failingScenes.length > 0 && (
              <button
                onClick={() => { onMarkScenesForRegeneration(failingScenes); onClose(); }}
                className="px-5 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-red-500/20 transition-all"
              >
                <i className="fa-solid fa-rotate mr-2"></i>Re-gen {failingScenes.length} failing scenes
              </button>
            )}
            <button
              onClick={runFullAudit}
              disabled={isAuditing}
              className="px-6 py-2.5 bg-deep-sage/10 border border-deep-sage/30 text-deep-sage text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-deep-sage/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isAuditing
                ? <><i className="fa-solid fa-spinner fa-spin"></i>{auditProgress}</>
                : <><i className="fa-solid fa-magnifying-glass-chart"></i>Run Full Audit</>
              }
            </button>
            <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Character Score Cards */}
            <div className="lg:col-span-1 space-y-4">
              <p className="text-[9px] text-mystic-gray uppercase font-black tracking-[0.3em] mb-4">Character Radar</p>
              {project.characters.map(char => {
                const score = localScores[char.id];
                const isSelected = selectedCharId === char.id;

                return (
                  <button
                    key={char.id}
                    onClick={() => setSelectedCharId(isSelected ? null : char.id)}
                    className={`w-full p-5 rounded-2xl border text-left transition-all ${isSelected ? 'bg-luna-gold/5 border-luna-gold/30' : 'bg-white/3 border-white/5 hover:border-white/10'}`}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10">
                        {char.referenceImageBase64
                          ? <img src={char.referenceImageBase64} className="w-full h-full object-cover" alt={char.name} />
                          : <div className="w-full h-full bg-white/5 flex items-center justify-center"><i className="fa-solid fa-user text-mystic-gray text-xs"></i></div>
                        }
                      </div>
                      <div>
                        <p className="text-sm font-black text-white uppercase tracking-tight font-mono">{char.name}</p>
                        <p className="text-[8px] text-mystic-gray">{char.gender}</p>
                      </div>
                      {score && (
                        <div className={`ml-auto text-lg font-black font-mono ${score.overall >= 80 ? 'text-deep-sage' : score.overall >= 60 ? 'text-solar-amber' : 'text-red-500'}`}>
                          {score.overall}%
                        </div>
                      )}
                    </div>
                    {score ? (
                      <div className="space-y-2">
                        <ScoreBar label="Face" value={score.face} />
                        <ScoreBar label="Hair" value={score.hair} />
                        <ScoreBar label="Clothing" value={score.clothing} />
                        <ScoreBar label="Marks" value={score.marks} />
                      </div>
                    ) : (
                      <p className="text-[8px] text-mystic-gray italic">No audit data — run full audit</p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Scene Heatmap & Detail */}
            <div className="lg:col-span-2 space-y-6">
              {/* Scene Heatmap */}
              <div className="p-6 rounded-2xl bg-white/3 border border-white/5">
                <p className="text-[9px] text-mystic-gray uppercase font-black tracking-[0.3em] mb-4">Scene Heatmap</p>
                {Object.keys(localScores).length === 0 ? (
                  <p className="text-[11px] text-mystic-gray italic text-center py-8">Run Full Audit to generate heatmap data</p>
                ) : (
                  <div className="space-y-4">
                    {project.characters.map(char => {
                      const score = localScores[char.id];
                      if (!score?.sceneScores) return null;
                      return (
                        <div key={char.id}>
                          <p className="text-[8px] text-luna-gold font-bold uppercase tracking-widest mb-2">{char.name}</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(score.sceneScores).map(([sceneId, data]) => (
                              <HeatmapCell
                                key={sceneId}
                                sceneId={Number(sceneId)}
                                score={data.score}
                                issues={data.issues}
                                selected={selectedSceneId === Number(sceneId)}
                                onClick={() => {
                                  setSelectedSceneId(selectedSceneId === Number(sceneId) ? null : Number(sceneId));
                                  setSelectedCharId(char.id);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Scene Detail / Issues */}
              {selectedCharDetails && selectedSceneId && selectedChar && (
                <div className="p-6 rounded-2xl bg-white/3 border border-white/5">
                  <p className="text-[9px] text-mystic-gray uppercase font-black tracking-[0.3em] mb-4">
                    Scene #{selectedSceneId} — {selectedChar.name} — Issue Detail
                  </p>
                  {(() => {
                    const detail = selectedCharDetails.find(r => r.sceneId === selectedSceneId);
                    if (!detail) return <p className="text-[11px] text-mystic-gray italic">No detail available</p>;
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className={`text-3xl font-black font-mono ${detail.score >= 80 ? 'text-deep-sage' : detail.score >= 60 ? 'text-solar-amber' : 'text-red-500'}`}>
                            {detail.score}%
                          </div>
                          <div>
                            <p className="text-[9px] text-mystic-gray uppercase tracking-widest">Consistency Score</p>
                            <p className="text-[11px] text-white">{detail.score >= 80 ? 'High — within acceptable range' : detail.score >= 60 ? 'Medium — some inconsistencies' : 'Low — significant deviation from reference'}</p>
                          </div>
                        </div>
                        {detail.issues.length > 0 && (
                          <div>
                            <p className="text-[8px] text-red-400 font-black uppercase tracking-widest mb-2">Issues Detected</p>
                            <ul className="space-y-1">
                              {detail.issues.map((issue, i) => (
                                <li key={i} className="text-[11px] text-celestial-stone flex items-start gap-2">
                                  <i className="fa-solid fa-circle-exclamation text-red-400 text-[8px] mt-1"></i>
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {detail.suggestions.length > 0 && (
                          <div>
                            <p className="text-[8px] text-deep-sage font-black uppercase tracking-widest mb-2">Suggestions</p>
                            <ul className="space-y-1">
                              {detail.suggestions.map((s, i) => (
                                <li key={i} className="text-[11px] text-celestial-stone flex items-start gap-2">
                                  <i className="fa-solid fa-circle-check text-deep-sage text-[8px] mt-1"></i>
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <button
                          onClick={() => { onMarkScenesForRegeneration([selectedSceneId]); onClose(); }}
                          className="w-full py-2 mt-2 bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-red-500/20 transition-all"
                        >
                          Re-generate This Scene
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-white/3 flex justify-between items-center">
          {localScores && Object.keys(localScores).length > 0 && (
            <p className="text-[9px] text-mystic-gray italic">
              Last audit: {new Date(Math.max(...Object.values(localScores).map(s => s.lastAudit || 0))).toLocaleTimeString()}
            </p>
          )}
          <div className="ml-auto">
            <button onClick={onClose} className="px-10 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-luna-gold hover:text-white transition-all">
              Close Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
