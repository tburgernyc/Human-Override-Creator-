import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted so the mock factory below can reference it — vi.mock is hoisted to
// the top of the file by vitest, ahead of any top-level `const` declarations.
const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));

// Mock @google/genai before importing services/gemini.ts. The SDK is
// constructed inside getAIClient() at call time, so we just need the
// `new GoogleGenAI(...)` call to return an object whose `models.generateContent`
// is our spy.
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  // The module also imports these named enums; provide enough surface so
  // services/gemini.ts loads at runtime.
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
  HarmCategory: {},
  HarmBlockThreshold: {},
}));

// Import after the mock so the SDK is replaced.
import {
  base64ToUint8Array,
  uint8ArrayToBase64,
  optimizeVisualPrompt,
} from '../services/gemini';
import { MODEL_NAMES } from '../constants';

beforeEach(() => {
  mockGenerateContent.mockReset();
});

describe('base64ToUint8Array + uint8ArrayToBase64 — round trip', () => {
  it('round-trips ASCII text', () => {
    const original = 'Hello, world!';
    const b64 = btoa(original);
    const bytes = base64ToUint8Array(b64);
    expect(bytes.length).toBe(original.length);
    expect(uint8ArrayToBase64(bytes)).toBe(b64);
  });

  it('round-trips a binary buffer with every byte value 0–255', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const b64 = uint8ArrayToBase64(bytes);
    const back = base64ToUint8Array(b64);
    expect(back).toEqual(bytes);
  });

  it('chunks large buffers without RangeError (>32KB chunk boundary)', () => {
    // CHUNK is 0x8000 (32768). A 100KB buffer crosses multiple chunks; the
    // bug we'd catch is String.fromCharCode(...arr) blowing the call stack.
    const bytes = new Uint8Array(100_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(() => uint8ArrayToBase64(bytes)).not.toThrow();
    const back = base64ToUint8Array(uint8ArrayToBase64(bytes));
    expect(back.length).toBe(bytes.length);
    expect(back[42]).toBe(42);
    expect(back[99_999]).toBe(99_999 % 256);
  });

  it('empty input round-trips to empty', () => {
    expect(uint8ArrayToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToUint8Array('')).toEqual(new Uint8Array(0));
  });
});

describe('optimizeVisualPrompt', () => {
  it('calls the CHECK model and builds the expected prompt', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'cinematic close-up of a detective in the rain' });
    const out = await optimizeVisualPrompt('detective in rain', 'High-End Cinematic');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.model).toBe(MODEL_NAMES.CHECK);
    expect(callArg.contents).toContain('High-End Cinematic');
    expect(callArg.contents).toContain('detective in rain');
    expect(out).toBe('cinematic close-up of a detective in the rain');
  });

  it('falls back to the original line when the model returns empty text', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '' });
    const out = await optimizeVisualPrompt('lone figure on a bridge', 'Noir');
    expect(out).toBe('lone figure on a bridge');
  });

  it('falls back to the original line when text is missing entirely', async () => {
    mockGenerateContent.mockResolvedValueOnce({});
    const out = await optimizeVisualPrompt('warehouse interior', 'Cinematic');
    expect(out).toBe('warehouse interior');
  });

  it('lets SDK errors propagate to the caller (no silent swallow)', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('upstream 429 rate limit'));
    await expect(optimizeVisualPrompt('anything', 'Cinematic')).rejects.toThrow(/429/);
  });
});
