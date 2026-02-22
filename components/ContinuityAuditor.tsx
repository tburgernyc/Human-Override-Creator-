
import React, { useState } from 'react';
import { ProjectState, Character, Scene } from '../types';
import { auditCharacterConsistency, ConsistencyAuditResult } from '../services/gemini';

interface ContinuityAuditorProps {
  project: ProjectState;
  onSyncPrompts: (characterId: string, masterPrompt: string) => void;
  onMarkScenesForRegeneration: (sceneIds: number[]) => void;
  onClose: () => void;
}

// Calculate visual similarity between character description and scene prompt (word-match preview)
const calculateVisualSimilarity = (characterPrompt: string, scenePrompt: string): number => {
  if (!characterPrompt || !scenePrompt) return 0;

  const normalize = (text: string) =>
    text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);

  const charWords = normalize(characterPrompt);
  const sceneWords = normalize(scenePrompt);

  const importantTerms = ['hair', 'eyes', 'clothing', 'attire', 'wearing', 'dress', 'suit', 'skin', 'features', 'appearance', 'build', 'height', 'age'];

  let weightedMatches = 0;
  let totalWeight = 0;

  charWords.forEach(charWord => {
    const isImportant = importantTerms.some(term => charWord.includes(term) || term.includes(charWord));
    const weight = isImportant ? 2 : 1;
    totalWeight += weight;
    if (sceneWords.includes(charWord)) weightedMatches += weight;
  });

  const baseScore = totalWeight > 0 ? (weightedMatches / totalWeight) * 100 : 0;
  const nameBonus = sceneWords.some(word => charWords.slice(0, 2).includes(word)) ? 10 : 0;
  return Math.min(Math.round(baseScore + nameBonus), 100);
};

const getMatchColor = (pct: number): string => {
  if (pct >= 80) return 'text-deep-sage';
  if (pct >= 60) return 'text-solar-amber';
  return 'text-red-500';
};

export const ContinuityAuditor: React.FC<ContinuityAuditorProps> = ({
  project, onSyncPrompts, onMarkScenesForRegeneration, onClose
}) => {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResults, setAuditResults] = useState<Record<string, ConsistencyAuditResult[]>>({});
  const [auditProgress, setAuditProgress] = useState('');
  const [failingScenes, setFailingScenes] = useState<Set<number>>(new Set());

  const runAIAudit = async () => {
    setIsAuditing(true);
    setAuditResults({});
    const newResults: Record<string, ConsistencyAuditResult[]> = {};
    const allFailing = new Set<number>();

    for (const char of project.characters) {
      setAuditProgress(`Auditing ${char.name}...`);
      const scenesWithChar = project.scenes.filter(s => (s.charactersInScene || []).includes(char.name));
      const sceneImages = scenesWithChar
        .filter(s => project.assets[s.id]?.imageUrl)
        .map(s => ({ sceneId: s.id, imageBase64: project.assets[s.id]?.imageUrl as string }));

      if (sceneImages.length === 0) continue;

      try {
        const results = await auditCharacterConsistency(char, sceneImages);
        newResults[char.id] = results;
        results.filter(r => r.score < 60).forEach(r => allFailing.add(r.sceneId));
      } catch (e) {
        console.error(`[ContinuityAuditor] AI audit failed for ${char.name}:`, e);
      }
    }

    setAuditResults(newResults);
    setFailingScenes(allFailing);
    setAuditProgress('');
    setIsAuditing(false);
  };

  const handleFixAllFailing = () => {
    onMarkScenesForRegeneration(Array.from(failingScenes));
    onClose();
  };

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
              onClick={runAIAudit}
              disabled={isAuditing}
              className="px-6 py-2.5 bg-solar-amber/10 border border-solar-amber/30 text-solar-amber text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-solar-amber/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isAuditing
                ? <><i className="fa-solid fa-spinner fa-spin"></i>{auditProgress || 'Auditing...'}</>
                : <><i className="fa-solid fa-eye"></i>Run AI Audit</>
              }
            </button>
            {failingScenes.size > 0 && (
              <button
                onClick={handleFixAllFailing}
                className="px-6 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-red-500/20 transition-all"
              >
                <i className="fa-solid fa-rotate mr-2"></i>Re-gen {failingScenes.size} failing
              </button>
            )}
            <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide space-y-12">
          {project.characters.map(char => {
            const charAuditResults = auditResults[char.id] || [];
            const avgAIScore = charAuditResults.length > 0
              ? Math.round(charAuditResults.reduce((a, r) => a + r.score, 0) / charAuditResults.length)
              : null;

            return (
              <div key={char.id} className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/10 nm-button">
                    {char.referenceImageBase64 && <img src={char.referenceImageBase64} className="w-full h-full object-cover" alt={char.name} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight font-mono">
                      {char.name}
                      <span className="text-mystic-gray font-normal ml-2">[{char.gender}]</span>
                      {avgAIScore !== null && (
                        <span className={`ml-3 text-sm font-bold ${getMatchColor(avgAIScore)}`}>
                          AI Score: {avgAIScore}%
                        </span>
                      )}
                    </h3>
                    <div className="flex gap-4 mt-2">
                      <span className="text-[8px] font-bold text-deep-sage uppercase tracking-widest px-2 py-1 rounded bg-deep-sage/10 border border-deep-sage/20">
                        {char.referenceImageApproved ? 'Canon Approved' : 'Persistence Locked'}
                      </span>
                      <button
                        onClick={() => onSyncPrompts(char.id, char.visualPrompt)}
                        className="text-[8px] font-bold text-luna-gold uppercase tracking-widest hover:underline"
                      >
                        Force Master Sync to All Scenes
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="nm-inset-input p-6 rounded-2xl border border-luna-gold/10">
                    <p className="text-[9px] font-black text-luna-gold uppercase tracking-[0.2em] mb-4">Master Visual Profile</p>
                    <p className="text-[11px] text-celestial-stone leading-relaxed italic opacity-80 line-clamp-4">"{char.visualPrompt}"</p>
                  </div>

                  {project.scenes.filter(s => (s.charactersInScene || []).includes(char.name)).map((scene, i) => {
                    // AI audit result takes priority over word-match
                    const aiResult = charAuditResults.find(r => r.sceneId === scene.id);
                    const wordMatchPct = calculateVisualSimilarity(char.visualPrompt, scene.visualPrompt);
                    const displayPct = aiResult ? aiResult.score : wordMatchPct;
                    const matchColor = getMatchColor(displayPct);
                    const filledDots = Math.round((displayPct / 100) * 5);
                    const isAIResult = !!aiResult;

                    return (
                      <div key={scene.id} className="nm-panel p-6 rounded-2xl border border-white/5 group hover:border-white/10 transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <p className="text-[9px] font-black text-mystic-gray uppercase tracking-widest">Scene #{i + 1} Usage</p>
                          <div className="flex items-center gap-2">
                            {isAIResult && <span className="text-[7px] text-solar-amber font-bold uppercase">AI Verified</span>}
                            <span className="text-[7px] text-luna-gold font-mono">SEQ_{scene.id}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-starlight leading-relaxed opacity-60 line-clamp-3">"{scene.visualPrompt}"</p>

                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex gap-1">
                            {[...Array(5)].map((_, j) => (
                              <div key={j} className={`w-1.5 h-1.5 rounded-full ${j < filledDots ? matchColor.replace('text-', 'bg-') : 'bg-white/10'}`}></div>
                            ))}
                          </div>
                          <span className={`text-[8px] font-bold uppercase tracking-widest ${matchColor}`}>
                            {displayPct}% {isAIResult ? 'AI Match' : 'Est. Match'}
                          </span>
                        </div>

                        {/* AI issues */}
                        {aiResult && aiResult.issues.length > 0 && (
                          <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                            {aiResult.issues.slice(0, 2).map((issue, idx) => (
                              <p key={idx} className="text-[8px] text-red-400 font-medium">{issue}</p>
                            ))}
                          </div>
                        )}

                        {/* Word-match warning */}
                        {!isAIResult && displayPct < 60 && (
                          <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <p className="text-[8px] text-red-500 font-bold">Low continuity — consider running AI audit</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="h-px bg-white/5 mt-10"></div>
              </div>
            );
          })}
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5 flex justify-between items-center gap-6">
          <p className="text-[10px] text-celestial-stone italic flex items-center gap-3">
            <i className="fa-solid fa-shield-halved text-deep-sage"></i>
            Neural continuity {Object.keys(auditResults).length > 0 ? 'AI-verified' : 'estimated'} for {project.characters.length} active personnel.
          </p>
          <button onClick={onClose} className="px-12 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-solar-amber hover:text-white transition-all">Seal Manifest</button>
        </div>
      </div>
    </div>
  );
};
