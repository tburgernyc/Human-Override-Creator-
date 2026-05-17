// Phase 15 G11 — pre-flight confirmation for the Manifest All batch.
// Plain presentational React; all data comes via props. Cancel / overlay
// click close the modal with no side effects; Continue calls the parent's
// onContinue (which closes the modal and fires handleManifestAll).

import React from 'react';
import type { BatchCostEstimate } from '../services/costEstimator';

interface BatchManifestConfirmModalProps {
  estimate: BatchCostEstimate;
  runtimeMin: number;
  onCancel: () => void;
  onContinue: () => void;
}

export const BatchManifestConfirmModal: React.FC<BatchManifestConfirmModalProps> = ({
  estimate,
  runtimeMin,
  onCancel,
  onContinue,
}) => {
  // Clicking the dark overlay (outside the card) cancels; clicks inside the
  // card don't bubble out.
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-eclipse-black/80 backdrop-blur-md animate-in fade-in"
    >
      <div className="glass-panel w-full max-w-md rounded-3xl overflow-hidden border-luna-gold/20 shadow-2xl p-8">
        <h2 className="text-luna-gold text-lg font-bold uppercase tracking-[0.2em] mb-4">
          Confirm Batch Manifest
        </h2>
        <p className="text-mystic-gray text-sm mb-2">
          {estimate.sceneCount} scene{estimate.sceneCount === 1 ? '' : 's'} pending
        </p>
        <p className="text-white text-2xl font-bold mb-1">
          ≈ ${estimate.totalUsd.toFixed(2)}
        </p>
        <p className="text-mystic-gray text-xs mb-4">
          {estimate.imageCount} image{estimate.imageCount === 1 ? '' : 's'} ·{' '}
          {estimate.videoCount} video{estimate.videoCount === 1 ? '' : 's'} ·{' '}
          {estimate.ttsCount} TTS call{estimate.ttsCount === 1 ? '' : 's'}
        </p>
        <p className="text-mystic-gray text-xs mb-6">
          ~{runtimeMin} min estimated runtime
        </p>
        <p className="text-mystic-gray/70 text-[10px] uppercase tracking-[0.15em] mb-6">
          Directional estimate — actual cost depends on Gemini pricing at call time.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl border border-white/10 text-mystic-gray hover:text-white hover:border-white/30 transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="flex-1 py-3 rounded-2xl bg-luna-gold text-eclipse-black hover:bg-luna-gold/90 transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
