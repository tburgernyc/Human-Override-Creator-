import React from 'react';

// Audit slice C7 — confirm-before-delete gate. Keeps the existing undo-toast
// safety net (handleDeleteScene snapshots + restores via toast action), but
// stops accidental clicks in the Take menu from immediately removing the scene.
interface DeleteSceneConfirmModalProps {
  sceneNumber: number;
  hasGeneratedAssets: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteSceneConfirmModal: React.FC<DeleteSceneConfirmModalProps> = ({
  sceneNumber,
  hasGeneratedAssets,
  onCancel,
  onConfirm,
}) => {
  return (
    <div
      className="fixed inset-0 z-[400] bg-eclipse-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-scene-title"
    >
      <div
        className="glass-panel rounded-3xl border border-white/10 w-full max-w-md p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
            <i className="fa-solid fa-triangle-exclamation text-lg"></i>
          </div>
          <div>
            <h2 id="delete-scene-title" className="text-base font-black text-white uppercase tracking-tight font-mono">
              Delete Scene #{sceneNumber}?
            </h2>
            <p className="text-xs text-celestial-stone mt-2 leading-relaxed">
              {hasGeneratedAssets
                ? 'The scene and its generated image, video, and audio will be removed from the timeline.'
                : 'The scene will be removed from the timeline.'}
              {' '}You can undo this from the toast that appears, but only until the toast clears.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-celestial-stone hover:text-white hover:border-white/30 transition-all text-[11px] font-bold uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 hover:text-red-200 transition-all text-[11px] font-bold uppercase tracking-widest"
          >
            <i className="fa-solid fa-trash-can mr-2"></i>
            Delete Scene
          </button>
        </div>
      </div>
    </div>
  );
};
