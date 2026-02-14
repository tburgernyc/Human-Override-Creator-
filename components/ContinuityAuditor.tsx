
import React from 'react';
import { ProjectState, Character, Scene } from '../types';

interface ContinuityAuditorProps {
  project: ProjectState;
  onSyncPrompts: (characterId: string, masterPrompt: string) => void;
  onClose: () => void;
}

// Calculate visual similarity between character description and scene prompt
const calculateVisualSimilarity = (characterPrompt: string, scenePrompt: string): number => {
  if (!characterPrompt || !scenePrompt) return 0;

  // Normalize text: lowercase, remove punctuation
  const normalize = (text: string) =>
    text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);

  const charWords = normalize(characterPrompt);
  const sceneWords = normalize(scenePrompt);

  // Extract important keywords (weighted terms)
  const importantTerms = ['hair', 'eyes', 'clothing', 'attire', 'wearing', 'dress', 'suit', 'skin', 'features', 'appearance', 'build', 'height', 'age'];

  let matches = 0;
  let weightedMatches = 0;
  let totalWeight = 0;

  charWords.forEach(charWord => {
    const isImportant = importantTerms.some(term => charWord.includes(term) || term.includes(charWord));
    const weight = isImportant ? 2 : 1;
    totalWeight += weight;

    if (sceneWords.includes(charWord)) {
      matches++;
      weightedMatches += weight;
    }
  });

  // Calculate percentage based on weighted matches
  const baseScore = totalWeight > 0 ? (weightedMatches / totalWeight) * 100 : 0;

  // Bonus for character name mention
  const characterNameInScene = sceneWords.some(word =>
    charWords.slice(0, 2).includes(word) // Check if first 2 words (name) appear
  );
  const nameBonus = characterNameInScene ? 10 : 0;

  return Math.min(Math.round(baseScore + nameBonus), 100);
};

// Get color class based on match percentage
const getMatchColor = (percentage: number): string => {
  if (percentage >= 80) return 'text-deep-sage'; // Green
  if (percentage >= 60) return 'text-solar-amber'; // Yellow
  return 'text-crimson-red'; // Red
};

export const ContinuityAuditor: React.FC<ContinuityAuditorProps> = ({ project, onSyncPrompts, onClose }) => {
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
          <button onClick={onClose} className="w-10 h-10 rounded-full nm-button flex items-center justify-center text-mystic-gray hover:text-white transition-all">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide space-y-12">
            {project.characters.map(char => (
                <div key={char.id} className="space-y-6">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/10 nm-button">
                            {char.referenceImageBase64 && <img src={char.referenceImageBase64} className="w-full h-full object-cover" />}
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white uppercase tracking-tight font-mono">{char.name} <span className="text-mystic-gray font-normal ml-2">[{char.gender}]</span></h3>
                            <div className="flex gap-4 mt-2">
                                <span className="text-[8px] font-bold text-deep-sage uppercase tracking-widest px-2 py-1 rounded bg-deep-sage/10 border border-deep-sage/20">Persistence Locked</span>
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

                        {project.scenes.filter(s => s.charactersInScene.includes(char.name)).map((scene, i) => {
                            const matchPercentage = calculateVisualSimilarity(char.visualPrompt, scene.visualPrompt);
                            const matchColor = getMatchColor(matchPercentage);
                            const filledDots = Math.round((matchPercentage / 100) * 5);

                            return (
                              <div key={scene.id} className="nm-panel p-6 rounded-2xl border border-white/5 group hover:border-white/10 transition-all">
                                  <div className="flex justify-between items-start mb-4">
                                      <p className="text-[9px] font-black text-mystic-gray uppercase tracking-widest">Scene #{i + 1} Usage</p>
                                      <span className="text-[7px] text-luna-gold font-mono">SEQ_{scene.id}</span>
                                  </div>
                                  <p className="text-[10px] text-starlight leading-relaxed opacity-60 line-clamp-3">"{scene.visualPrompt}"</p>
                                  <div className="mt-4 flex items-center justify-between">
                                      <div className="flex gap-1">
                                          {[...Array(5)].map((_, j) => (
                                            <div key={j} className={`w-1 h-1 rounded-full ${j < filledDots ? matchColor.replace('text-', 'bg-') : 'bg-white/10'}`}></div>
                                          ))}
                                      </div>
                                      <span className={`text-[8px] font-bold uppercase tracking-widest ${matchColor}`}>
                                        {matchPercentage}% Match
                                      </span>
                                  </div>
                                  {matchPercentage < 60 && (
                                    <div className="mt-3 p-2 bg-crimson-red/10 border border-crimson-red/30 rounded-lg">
                                      <p className="text-[8px] text-crimson-red font-bold">⚠ Low continuity - consider updating scene prompt</p>
                                    </div>
                                  )}
                              </div>
                            );
                        })}
                    </div>
                    <div className="h-px bg-white/5 mt-10"></div>
                </div>
            ))}
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5 flex justify-end gap-6">
          <p className="text-[10px] text-celestial-stone italic flex items-center gap-3">
            <i className="fa-solid fa-shield-halved text-deep-sage"></i>
            Neural continuity verified for all active personnel profiles.
          </p>
          <button onClick={onClose} className="px-12 py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-solar-amber hover:text-white transition-all">Seal Manifest</button>
        </div>
      </div>
    </div>
  );
};
