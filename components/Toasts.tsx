
import React, { useEffect } from 'react';

export interface ToastItem {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
  timestamp: number;
}

interface ToastsProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const TOAST_TTL_MS = 6000;

const COLORS: Record<ToastItem['type'], { ring: string; text: string; icon: string }> = {
  error:   { ring: 'border-red-400/40',   text: 'text-red-300',     icon: 'fa-circle-exclamation' },
  success: { ring: 'border-deep-sage/40', text: 'text-deep-sage',   icon: 'fa-circle-check' },
  info:    { ring: 'border-luna-gold/30', text: 'text-luna-gold',   icon: 'fa-circle-info' },
};

const Toast: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), TOAST_TTL_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const c = COLORS[toast.type];

  return (
    <div className={`pointer-events-auto nm-panel border ${c.ring} rounded-2xl p-4 shadow-2xl bg-eclipse-black/90 backdrop-blur-xl flex items-start gap-3 max-w-md animate-in slide-in-from-right-5 fade-in duration-300`}>
      <i className={`fa-solid ${c.icon} ${c.text} text-base mt-0.5 shrink-0`}></i>
      <p className={`text-[11px] leading-relaxed flex-1 font-mono ${c.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="text-mystic-gray hover:text-white transition-colors text-xs shrink-0"
      >
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
};

export const Toasts: React.FC<ToastsProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-24 right-6 z-[800] flex flex-col gap-3 pointer-events-none w-[min(420px,90vw)]">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
