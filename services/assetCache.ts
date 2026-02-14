// Asset caching service to reduce redundant API calls
// Stores generated images/videos in localStorage with LRU eviction

interface CacheEntry {
  hash: string;
  assetUrl: string;
  timestamp: number;
  size: number; // Approximate size in bytes
}

const CACHE_KEY = 'human_override_asset_cache_v1';
const MAX_ENTRIES = 50;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Simple hash function for cache keys
const hashKey = (...parts: string[]): string => {
  const combined = parts.join('|');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

// Estimate base64 data URI size
const estimateSize = (dataUri: string): number => {
  return dataUri.length * 0.75; // Base64 is ~33% larger than binary
};

// Load cache from localStorage
const loadCache = (): CacheEntry[] => {
  try {
    const saved = localStorage.getItem(CACHE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[AssetCache] Failed to load cache:', e);
  }
  return [];
};

// Save cache to localStorage
const saveCache = (entries: CacheEntry[]): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('[AssetCache] Failed to save cache:', e);
    // If quota exceeded, clear cache and try again
    clearCache();
  }
};

// Get cached asset
export const getCachedAsset = (
  visualPrompt: string,
  style: string,
  resolution: string,
  aspectRatio: string,
  seed: number
): string | null => {
  const hash = hashKey(visualPrompt, style, resolution, aspectRatio, seed.toString());
  const cache = loadCache();
  const entry = cache.find(e => e.hash === hash);

  if (entry) {
    console.log(`[AssetCache] Cache HIT for hash ${hash}`);
    // Update timestamp for LRU
    entry.timestamp = Date.now();
    saveCache(cache);
    return entry.assetUrl;
  }

  console.log(`[AssetCache] Cache MISS for hash ${hash}`);
  return null;
};

// Store asset in cache
export const cacheAsset = (
  assetUrl: string,
  visualPrompt: string,
  style: string,
  resolution: string,
  aspectRatio: string,
  seed: number
): void => {
  const hash = hashKey(visualPrompt, style, resolution, aspectRatio, seed.toString());
  const size = estimateSize(assetUrl);
  let cache = loadCache();

  // Check if already cached
  const existingIndex = cache.findIndex(e => e.hash === hash);
  if (existingIndex >= 0) {
    cache[existingIndex].timestamp = Date.now();
    cache[existingIndex].assetUrl = assetUrl;
    saveCache(cache);
    return;
  }

  // Add new entry
  const newEntry: CacheEntry = {
    hash,
    assetUrl,
    timestamp: Date.now(),
    size
  };
  cache.push(newEntry);

  // Apply LRU eviction if needed
  cache = evictIfNeeded(cache);
  saveCache(cache);
  console.log(`[AssetCache] Cached asset ${hash} (${(size / 1024).toFixed(1)} KB)`);
};

// Evict oldest entries if cache exceeds limits
const evictIfNeeded = (cache: CacheEntry[]): CacheEntry[] => {
  // Sort by timestamp (oldest first)
  cache.sort((a, b) => a.timestamp - b.timestamp);

  // Evict by count
  while (cache.length > MAX_ENTRIES) {
    const evicted = cache.shift();
    console.log(`[AssetCache] Evicted by count: ${evicted?.hash}`);
  }

  // Evict by size
  let totalSize = cache.reduce((sum, e) => sum + e.size, 0);
  while (totalSize > MAX_SIZE_BYTES && cache.length > 0) {
    const evicted = cache.shift();
    if (evicted) {
      totalSize -= evicted.size;
      console.log(`[AssetCache] Evicted by size: ${evicted.hash} (${(evicted.size / 1024).toFixed(1)} KB)`);
    }
  }

  // Re-sort by timestamp (newest first) for efficient access
  cache.sort((a, b) => b.timestamp - a.timestamp);
  return cache;
};

// Clear entire cache
export const clearCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('[AssetCache] Cache cleared');
  } catch (e) {
    console.warn('[AssetCache] Failed to clear cache:', e);
  }
};

// Get cache statistics
export const getCacheStats = (): { entries: number, totalSize: number, maxSize: number } => {
  const cache = loadCache();
  const totalSize = cache.reduce((sum, e) => sum + e.size, 0);
  return {
    entries: cache.length,
    totalSize,
    maxSize: MAX_SIZE_BYTES
  };
};
