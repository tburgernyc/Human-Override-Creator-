
import React, { useState } from 'react';

interface AddCharacterModalProps {
  onClose: () => void;
  onCreate: (name: string, gender: 'Male' | 'Female', description: string) => Promise<void>;
}

export const AddCharacterModal: React.FC<AddCharacterModalProps> = ({ onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<'Male' | 'Female'>('Female');
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !isCreating;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsCreating(true);
    try {
      await onCreate(name.trim(), gender, description.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add character');
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-eclipse-black/80 backdrop-blur-md animate-in fade-in">
      <div className="glass-panel w-full max-w-md rounded-3xl overflow-hidden border-luna-gold/20 shadow-2xl">
        <div className="p-8 border-b border-white/5">
          <h3 className="text-xl font-bold text-white font-mono uppercase tracking-tighter">Register New Personnel</h3>
          <p className="text-[10px] text-mystic-gray uppercase tracking-[0.3em] font-bold mt-2">Cast Synthesis</p>
        </div>

        <div className="p-8 space-y-6">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-celestial-stone mb-2 block font-bold">Identity Label</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Character name"
              autoFocus
              disabled={isCreating}
              className="w-full bg-eclipse-black border border-white/10 rounded-lg p-3 text-sm focus:border-luna-gold outline-none transition-colors disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-celestial-stone mb-2 block font-bold">Gender</label>
            <div className="flex gap-3">
              {(['Female', 'Male'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  disabled={isCreating}
                  onClick={() => setGender(g)}
                  className={`flex-1 p-3 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${gender === g ? 'bg-luna-gold/10 border-luna-gold text-luna-gold' : 'bg-white/5 border-white/10 text-celestial-stone hover:text-white'} disabled:opacity-50`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-celestial-stone mb-2 block font-bold">
              Description <span className="text-mystic-gray/50 normal-case tracking-normal font-normal ml-2">(optional — model will fill in)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              disabled={isCreating}
              placeholder="Leave blank to let the model invent a backstory, or describe the character yourself."
              className="w-full bg-eclipse-black border border-white/10 rounded-lg p-3 text-xs focus:border-luna-gold outline-none transition-colors disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="text-[10px] text-solar-amber font-bold uppercase tracking-widest p-3 border border-solar-amber/20 rounded-lg bg-solar-amber/5">
              {error}
            </div>
          )}

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="flex-1 bg-white/5 text-white border border-white/10 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="flex-1 bg-luna-gold text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-luna-gold/20 disabled:opacity-30"
            >
              {isCreating ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i>Synthesizing...</> : 'Synthesize'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
