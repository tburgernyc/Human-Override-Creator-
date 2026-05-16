// Audit slice A4 — bounded LRU cache for the Renderer's decoded audio buffers.
//
// The Renderer used to hold music + ambient AudioBuffers in plain Map<string,
// AudioBuffer> instances that never shrank. A 30-scene project with 3 mood
// pools could pin ~60 stereo 44.1kHz buffers in memory (often 500 MB+) until
// the entire render finished. This helper caps the cache by entry count using
// classic LRU eviction (Map insertion order = recency order in JS, so we
// re-insert on access to bubble entries to the most-recently-used slot).
//
// Pure — no DOM, no AudioBuffer-specific knowledge — so it's straightforward
// to unit-test. The Renderer wraps it in a thin adapter at the call sites.

export class LruCache<K, V> {
  private readonly maxEntries: number;
  private readonly store: Map<K, V>;
  // Optional eviction hook — used by the Renderer to call AudioContext-level
  // cleanup (e.g. dropping outstanding references) when a buffer is evicted.
  private readonly onEvict?: (key: K, value: V) => void;

  constructor(maxEntries: number, onEvict?: (key: K, value: V) => void) {
    if (!Number.isFinite(maxEntries) || maxEntries <= 0) {
      throw new Error(`LruCache maxEntries must be a positive integer, got ${maxEntries}`);
    }
    this.maxEntries = Math.floor(maxEntries);
    this.store = new Map();
    this.onEvict = onEvict;
  }

  get size(): number {
    return this.store.size;
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  get(key: K): V | undefined {
    if (!this.store.has(key)) return undefined;
    const value = this.store.get(key)!;
    // Move-to-most-recent: delete then re-insert so iteration order reflects use.
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // Updating an existing key should refresh its recency, not double-count.
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, value);
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value as K;
      const oldestValue = this.store.get(oldestKey) as V;
      this.store.delete(oldestKey);
      try {
        this.onEvict?.(oldestKey, oldestValue);
      } catch {
        // Eviction callbacks must not break the cache itself.
      }
    }
  }

  clear(): void {
    if (this.onEvict) {
      for (const [k, v] of this.store) {
        try { this.onEvict(k, v); } catch { /* see set() */ }
      }
    }
    this.store.clear();
  }

  // Visible for tests + diagnostics.
  keys(): IterableIterator<K> {
    return this.store.keys();
  }
}
