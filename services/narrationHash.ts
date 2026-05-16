import { DialogueLine } from '../types';

// Stable identity for a scene's narration. Used to detect when audio is stale
// after the user edits text/emotion/speaker on a scene whose audio was already
// synthesized. We don't need a cryptographic hash here — any deterministic
// projection of the fields the TTS pipeline actually consumes is fine.
export function hashNarration(lines: DialogueLine[]): string {
  const projection = (lines || []).map(l => ({
    speaker: l.speaker ?? '',
    emotion: l.emotion ?? '',
    text: (l.text ?? '').trim(),
  }));
  return JSON.stringify(projection);
}

export function isAudioStale(
  currentLines: DialogueLine[],
  storedHash: string | undefined,
  hasAudio: boolean,
): boolean {
  if (!hasAudio) return false;
  if (!storedHash) return false;
  return hashNarration(currentLines) !== storedHash;
}
