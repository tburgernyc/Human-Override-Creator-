import { describe, it, expect } from 'vitest';
import { hashNarration, isAudioStale } from '../services/narrationHash';
import type { DialogueLine } from '../types';

const line = (overrides: Partial<DialogueLine> = {}): DialogueLine => ({
  speaker: 'NARRATOR',
  emotion: 'neutral',
  text: 'Hello world',
  ...overrides,
});

describe('hashNarration + isAudioStale', () => {
  it('empty array produces a stable hash', () => {
    expect(hashNarration([])).toBe(hashNarration([]));
  });

  it('identical narration produces identical hashes', () => {
    const a = [line({ text: 'one' }), line({ text: 'two' })];
    const b = [line({ text: 'one' }), line({ text: 'two' })];
    expect(hashNarration(a)).toBe(hashNarration(b));
  });

  it('text change flips the hash', () => {
    expect(hashNarration([line({ text: 'original' })]))
      .not.toBe(hashNarration([line({ text: 'edited' })]));
  });

  it('emotion change flips the hash', () => {
    expect(hashNarration([line({ emotion: 'neutral' })]))
      .not.toBe(hashNarration([line({ emotion: 'excited' })]));
  });

  it('speaker change flips the hash', () => {
    expect(hashNarration([line({ speaker: 'NARRATOR' })]))
      .not.toBe(hashNarration([line({ speaker: 'CHARACTER_A' })]));
  });

  it('whitespace-only edits do not flip (text is trimmed)', () => {
    expect(hashNarration([line({ text: 'hello' })]))
      .toBe(hashNarration([line({ text: '  hello  ' })]));
  });

  it('isAudioStale is false when no audio has been synthesized', () => {
    const lines = [line({ text: 'fresh' })];
    expect(isAudioStale(lines, hashNarration(lines), false)).toBe(false);
  });

  it('isAudioStale is false when hash matches current narration', () => {
    const lines = [line({ text: 'matching' })];
    expect(isAudioStale(lines, hashNarration(lines), true)).toBe(false);
  });

  it('isAudioStale is true when narration drifts from stored hash', () => {
    const original = [line({ text: 'original' })];
    const edited = [line({ text: 'edited' })];
    expect(isAudioStale(edited, hashNarration(original), true)).toBe(true);
  });

  it('isAudioStale is false when stored hash is missing (legacy scenes)', () => {
    expect(isAudioStale([line({ text: 'anything' })], undefined, true)).toBe(false);
  });
});
