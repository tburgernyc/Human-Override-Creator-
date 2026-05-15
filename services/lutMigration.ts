import { LUT_PRESETS, type LutPreset } from '../types';

// Phase 14: old `lutPreset` values map to the new filmstock-named enum at read
// time. Don't write back — let the next save persist the normalized value.
export const LEGACY_LUT_MAP: Record<string, LutPreset> = {
  kodak_5219:  'kodak_vision3_250d',
  fuji_400h:   'fuji_eterna_250d',
  noir:        'bleach_bypass',
  technicolor: 'kodak_2383',
};

export const normalizeLutPreset = (raw: unknown): LutPreset => {
  if (typeof raw !== 'string' || raw === 'none') return 'none';
  if ((LUT_PRESETS as readonly string[]).includes(raw)) return raw as LutPreset;
  return LEGACY_LUT_MAP[raw] ?? 'none';
};
