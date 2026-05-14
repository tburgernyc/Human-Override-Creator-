#!/usr/bin/env node
// Generates public/luts/bleach_bypass.cube — a hand-authored SIZE-17 3D LUT
// applying the classic bleach-bypass transform:
//
//   1. Compute Rec.709 luma:  L = 0.2126·R + 0.7152·G + 0.0722·B
//   2. Desaturate toward luma:  rgb' = lerp(rgb, vec3(L), DESAT)
//   3. Linear S-curve contrast around midpoint:  out = (rgb' − 0.5)·GAIN + 0.5
//   4. Clamp to [0, 1]
//
// The crushed shadows and blown highlights at the extremes of the linear
// S-curve are intentional — they reproduce the bleach-bypass "harsh silver"
// look that comes from skipping the bleach step in a film print.
//
// Run with: node scripts/generate-bleach-bypass-lut.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const SIZE = 17;
const DESAT = 0.65;   // 65% toward luma — bleach bypass partial desaturation
const GAIN = 1.4;     // ±40% contrast scale around 0.5

const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const transform = (r, g, b) => {
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const rd = r + (L - r) * DESAT;
    const gd = g + (L - g) * DESAT;
    const bd = b + (L - b) * DESAT;
    return [
        clamp01((rd - 0.5) * GAIN + 0.5),
        clamp01((gd - 0.5) * GAIN + 0.5),
        clamp01((bd - 0.5) * GAIN + 0.5),
    ];
};

const lines = [
    'TITLE "Bleach Bypass — luma desat + linear S-curve"',
    '# Hand-authored by scripts/generate-bleach-bypass-lut.mjs',
    `# Recipe: L = 0.2126*R + 0.7152*G + 0.0722*B (Rec.709 luma)`,
    `#         rgb_desat = lerp(rgb, vec3(L), ${DESAT})`,
    `#         out = clamp((rgb_desat - 0.5) * ${GAIN} + 0.5)`,
    `LUT_3D_SIZE ${SIZE}`,
];

// .cube format: R varies fastest, then G, then B (outer-most).
for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
        for (let r = 0; r < SIZE; r++) {
            const [R, G, B] = transform(r / (SIZE - 1), g / (SIZE - 1), b / (SIZE - 1));
            lines.push(`${R.toFixed(6)} ${G.toFixed(6)} ${B.toFixed(6)}`);
        }
    }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(here, '..', 'public', 'luts', 'bleach_bypass.cube');
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${outPath} (SIZE=${SIZE}, ${lines.length - 6} entries)`);
