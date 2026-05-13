
import React, { useState, useCallback } from 'react';
import { ProjectState } from '../types';
import { analyzeCharacterContinuity } from '../services/gemini';

interface ContinuityAuditorProps {
  project: ProjectState;
  onSyncPrompts: (characterId: string, masterPrompt: string) => void;
  onClose: () => void;
}

type ScoreEntry = { score: number; notes: string; loading?: boolean };

const scoreColor = (s: number): string => {
  if (s >= 80) return 'text-deep-sage';
  if (s >= 60) return 'text-luna-gold';
  if (s >= 40) return 'text-solar-amber';
  return 'text-red-400';
};

const scoreBarColor = (s: number): string => {
  if (s >= 80) return 'bg-deep-sage';
  if (s >= 60) return 'bg-luna-gold';
  if (s >= 40) return 'bg-solar-amber';
  return 'bg-red-400';
};

export const ContinuityAuditor: React.FC<ContinuityAuditorProps> = ({ project, onSyncPrompts, onClose }) => {
  const [scores, setScores] = useState<Record<string, ScoreEntry>>({});
  const [isAuditingAll, setIsAuditingAll] = useState(false);

  const keyOf = (charId: string, sceneId: string) => `${charId}::${sceneId}`;

  const scoreOne = useCallback(async (charId: string, sceneId: string) => {
    const char = project.characters.find(c => c.id === charId);
    const sceneImg = project.assets[sceneId]?.imageUrl;
    if (!char?.referenceImageBase64 || !sceneImg) return;

    const k = keyOf(charId, sceneId);
    setScores(s => ({ ...s, [k]: { score: 0, notes: '', loading: true } }));
    const result = await analyzeCharacterContinuity(char.referenceImageBase64, sceneImg, char.name);
    setScores(s => ({ ...s, [k]: { ...result, loading: false } }));
  }, [project]);

  const runFullAudit = useCallback(async () => {
    if (isAuditingAll) return;
    setIsAuditingAll(true);
    const pairs: Array<[string, string]> = [];
    for (const char of project.characters) {
      if (!char.referenceImageBase64) continue;
      for (const scene of project.scenes) {
        if (!scene.charactersInScene.includes(char.name)) continue;
        if (!project.assets[scene.id]?.imageUrl) continue;
        pairs.push([char.id, scene.id]);
      }
    }
    // Bounded concurrency — Flash is fast but we still want to be polite.
    const concurrency = 3;
    let cursor = 0;
    const worker = async () => {
      while (cursor < pairs.length) {
        const myIdx = cursor++;
        const [charId, sceneId] = pairs[myIdx];
        await scoreOne(charId, sceneId);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, pairs.length) }, () => worker()));
    setIsAuditingAll(false);
  }, [project, scoreOne, isAuditingAll]);

  return (
    <div className="fixed inset-0 z-[400] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-6xl h-full max-h-[85vh] nm-panel flex flex-col overflow-hidden border border-white/5">

        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-solar-amber/10 border border-solar-amber/30 flex items-center justify-center text-solar-amber">
              <i className="fa-solid fa-fingerprint text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter font-mono italic">Continuity Firewall</h2>
              <p className="text-[10px] text-mystic-gray uppercase font-bold tracking-[0.3em]">Auditing visual persistence across the timeline</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={runFullAudit}
              disabled={isAuditingAll}
              className="px-6 py-2 nm-button-gold text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-nm-gold hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
            >
              {isAuditingAll ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i> Auditing...</> : <><i className="fa-solid fa-bolt-lightning mr-2"></i> Run Full Audit</>}
            </button>
            <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide space-y-12">
          {project.characters.map(char => {
            const charScenes = project.scenes.filter(s => s.charactersInScene.includes(char.name));
            return (
              <div key={char.id} className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/10 nm-button">
                    {char.referenceImageBase64 ? (
                      <img src={char.referenceImageBase64} className="w-full h-full object-cover" alt={char.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-mystic-gray">
                        <i className="fa-solid fa-user-astronaut"></i>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight font-mono">
                      {char.name} <span className="text-mystic-gray font-normal ml-2">[{char.gender}]</span>
                    </h3>
                    <div className="flex gap-4 mt-2">
                      {char.referenceImageBase64 ? (
                        <span className="text-[8px] font-bold text-deep-sage uppercase tracking-widest px-2 py-1 rounded bg-deep-sage/10 border border-deep-sage/20">Reference Locked</span>
                      ) : (
                        <span className="text-[8px] font-bold text-solar-amber uppercase tracking-widest px-2 py-1 rounded bg-solar-amber/10 border border-solar-amber/20">No Reference Image</span>
                      )}
                      <button
                        onClick={() => onSyncPrompts(char.id, char.visualPrompt)}
                        className="text-[8px] font-bold text-luna-gold uppercase tracking-widest hover:underline"
                      >
                        Append Master Prompt to All Scenes
                      </button>
                    </div>
                  </div>
                </div>

                {charScenes.length === 0 ? (
                  <p className="text-[10px] text-mystic-gray italic px-6">Character does not appear in any scene yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {charScenes.map((scene, i) => {
                      const sceneIdx = project.scenes.indexOf(scene);
                      const sceneImg = project.assets[scene.id]?.imageUrl;
                      const k = keyOf(char.id, scene.id);
                      const entry = scores[k];
                      const canScore = !!char.referenceImageBase64 && !!sceneImg;

                      return (
                        <div key={scene.id} className="nm-panel p-5 rounded-2xl border border-white/5 group hover:border-white/10 transition-all space-y-3">
                          <div className="flex justify-between items-start">
                            <p className="text-[9px] font-black text-mystic-gray uppercase tracking-widest">Scene #{sceneIdx + 1}</p>
                            <span className="text-[7px] text-luna-gold font-mono">SEQ_{scene.id.slice(0, 6)}</span>
                          </div>

                          {sceneImg ? (
                            <img src={sceneImg} className="w-full aspect-video object-cover rounded-lg border border-white/5" alt={`Scene ${sceneIdx + 1}`} />
                          ) : (
                            <div className="w-full aspect-video bg-white/5 rounded-lg flex items-center justify-center text-mystic-gray/40">
                              <span className="text-[9px] uppercase tracking-widest font-bold">No scene image yet</span>
                            </div>
                          )}

                          <p className="text-[10px] text-starlight leading-relaxed opacity-60 line-clamp-2 italic">"{scene.visualPrompt}"</p>

                          <div className="pt-2 border-t border-white/5">
                            {entry?.loading ? (
                              <div className="flex items-center gap-2 text-[9px] text-mystic-gray uppercase tracking-widest font-bold">
                                <i className="fa-solid fa-spinner fa-spin"></i> Scoring...
                              </div>
                            ) : entry ? (
                              <>
                                <div className="flex items-center justify-between mb-2">
                                  <span className={`text-xs font-mono font-black ${scoreColor(entry.score)}`}>{entry.score}%</span>
                                  <span className="text-[8px] font-bold text-mystic-gray uppercase tracking-widest">Identity Match</span>
                                </div>
                                <div className="h-1 w-full nm-inset-input rounded-full overflow-hidden mb-2">
                                  <div className={`h-full transition-all ${scoreBarColor(entry.score)}`} style={{ width: `${entry.score}%` }}></div>
                                </div>
                                {entry.notes && <p className="text-[8px] text-celestial-stone leading-snug">{entry.notes}</p>}
                              </>
                            ) : (
                              <button
                                onClick={() => scoreOne(char.id, scene.id)}
                                disabled={!canScore}
                                className="w-full nm-button text-[8px] font-bold text-mystic-gray hover:text-luna-gold uppercase tracking-widest py-2 rounded-lg transition-all disabled:opacity-30 border border-white/5"
                              >
                                {!char.referenceImageBase64 ? 'No reference image' : !sceneImg ? 'No scene image yet' : 'Score this scene'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="h-px bg-white/5 mt-10"></div>
              </div>
            );
          })}
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5 flex justify-between items-center gap-6">
          <p className="text-[10px] text-celestial-stone italic flex items-center gap-3">
            <i className="fa-solid fa-shield-halved text-deep-sage"></i>
            Scores are produced by the Gemini Flash vision judge — not heuristic.
          </p>
          <button onClick={onClose} className="px-12 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-solar-amber hover:text-white transition-all">Seal Manifest</button>
        </div>
      </div>
    </div>
  );
};
