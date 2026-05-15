#!/usr/bin/env -S npx tsx
// Load-bearing test for the Phase 14 legacy LUT enum migration.
// Imports the real production helper from services/lutMigration.ts so the
// assertions catch drift if the mapping table changes.
//
// Run with: npx tsx scripts/lut-migration.test.mts

import assert from 'node:assert/strict';
import { normalizeLutPreset, LEGACY_LUT_MAP } from '../services/lutMigration';

let passed = 0, failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e: any) { console.log(`  FAIL  ${name}\n    ${e.message}`); failed++; }
};

console.log('\nnormalizeLutPreset — legacy enum migration');
test('kodak_5219 → kodak_vision3_250d', () => assert.equal(normalizeLutPreset('kodak_5219'), 'kodak_vision3_250d'));
test('fuji_400h → fuji_eterna_250d',    () => assert.equal(normalizeLutPreset('fuji_400h'),   'fuji_eterna_250d'));
test('noir → bleach_bypass',            () => assert.equal(normalizeLutPreset('noir'),        'bleach_bypass'));
test('technicolor → kodak_2383',        () => assert.equal(normalizeLutPreset('technicolor'), 'kodak_2383'));
test('garbage_value → none',            () => assert.equal(normalizeLutPreset('garbage_value'), 'none'));
test('none passthrough',                () => assert.equal(normalizeLutPreset('none'),         'none'));
test('canonical kodak_2383 passthrough', () => assert.equal(normalizeLutPreset('kodak_2383'),  'kodak_2383'));
test('undefined → none',                () => assert.equal(normalizeLutPreset(undefined),     'none'));
test('null → none',                     () => assert.equal(normalizeLutPreset(null),          'none'));
test('number → none',                   () => assert.equal(normalizeLutPreset(42),            'none'));
test('LEGACY_LUT_MAP covers all 4 documented values', () => {
  assert.deepEqual(Object.keys(LEGACY_LUT_MAP).sort(), ['fuji_400h','kodak_5219','noir','technicolor']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
