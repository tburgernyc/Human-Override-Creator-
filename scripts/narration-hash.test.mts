#!/usr/bin/env -S npx tsx
// Unit tests for hashNarration / isAudioStale — the stale-audio detector for the
// per-phase regenerate flow (audit slice A1).
// Run with: npx tsx scripts/narration-hash.test.mts

import assert from 'node:assert/strict';
import { hashNarration, isAudioStale } from '../services/narrationHash';
import type { DialogueLine } from '../types';

let passed = 0, failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e: any) { console.log(`  FAIL  ${name}\n    ${e.message}`); failed++; }
};

const line = (overrides: Partial<DialogueLine> = {}): DialogueLine => ({
  speaker: 'NARRATOR',
  emotion: 'neutral',
  text: 'Hello world',
  ...overrides,
});

console.log('\nhashNarration + isAudioStale');

test('empty array produces a stable hash', () => {
  assert.equal(hashNarration([]), hashNarration([]));
});

test('identical narration produces identical hashes', () => {
  const a = [line({ text: 'one' }), line({ text: 'two' })];
  const b = [line({ text: 'one' }), line({ text: 'two' })];
  assert.equal(hashNarration(a), hashNarration(b));
});

test('text change flips the hash', () => {
  const a = [line({ text: 'original' })];
  const b = [line({ text: 'edited' })];
  assert.notEqual(hashNarration(a), hashNarration(b));
});

test('emotion change flips the hash', () => {
  const a = [line({ emotion: 'neutral' })];
  const b = [line({ emotion: 'excited' })];
  assert.notEqual(hashNarration(a), hashNarration(b));
});

test('speaker change flips the hash', () => {
  const a = [line({ speaker: 'NARRATOR' })];
  const b = [line({ speaker: 'CHARACTER_A' })];
  assert.notEqual(hashNarration(a), hashNarration(b));
});

test('whitespace-only edits do not flip (we trim text)', () => {
  const a = [line({ text: 'hello' })];
  const b = [line({ text: '  hello  ' })];
  assert.equal(hashNarration(a), hashNarration(b));
});

test('isAudioStale false when no audio has been synthesized', () => {
  const lines = [line({ text: 'fresh' })];
  assert.equal(isAudioStale(lines, hashNarration(lines), /*hasAudio*/ false), false);
});

test('isAudioStale false when hash matches current narration', () => {
  const lines = [line({ text: 'matching' })];
  assert.equal(isAudioStale(lines, hashNarration(lines), true), false);
});

test('isAudioStale true when narration drifts from stored hash', () => {
  const original = [line({ text: 'original' })];
  const edited = [line({ text: 'edited' })];
  assert.equal(isAudioStale(edited, hashNarration(original), true), true);
});

test('isAudioStale false when stored hash is missing (legacy scenes pre-migration)', () => {
  const lines = [line({ text: 'anything' })];
  assert.equal(isAudioStale(lines, undefined, true), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
