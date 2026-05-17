import { describe, it, expect } from 'vitest';
import { normalizeLutPreset, LEGACY_LUT_MAP } from '../services/lutMigration';

describe('normalizeLutPreset — legacy enum migration', () => {
  it('kodak_5219 → kodak_vision3_250d', () => expect(normalizeLutPreset('kodak_5219')).toBe('kodak_vision3_250d'));
  it('fuji_400h → fuji_eterna_250d', () => expect(normalizeLutPreset('fuji_400h')).toBe('fuji_eterna_250d'));
  it('noir → bleach_bypass', () => expect(normalizeLutPreset('noir')).toBe('bleach_bypass'));
  it('technicolor → kodak_2383', () => expect(normalizeLutPreset('technicolor')).toBe('kodak_2383'));
  it('garbage_value → none', () => expect(normalizeLutPreset('garbage_value')).toBe('none'));
  it('none passthrough', () => expect(normalizeLutPreset('none')).toBe('none'));
  it('canonical kodak_2383 passthrough', () => expect(normalizeLutPreset('kodak_2383')).toBe('kodak_2383'));
  it('undefined → none', () => expect(normalizeLutPreset(undefined)).toBe('none'));
  it('null → none', () => expect(normalizeLutPreset(null)).toBe('none'));
  it('number → none', () => expect(normalizeLutPreset(42)).toBe('none'));
  it('LEGACY_LUT_MAP covers all 4 documented values', () => {
    expect(Object.keys(LEGACY_LUT_MAP).sort()).toEqual(['fuji_400h', 'kodak_5219', 'noir', 'technicolor']);
  });
});
