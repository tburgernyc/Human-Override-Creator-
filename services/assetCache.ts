// Asset caching service — IndexedDB backend (replaces localStorage)
// DB: human_override_assets_v2  |  Max: 500MB / 500 entries

const DB_NAME = 'human_override_assets_v2';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const MAX_ENTRIES = 500;
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

interface CacheEntry {
  hash: string;
  assetUrl: string;
  timestamp: number;
  size: number;
}

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
};

const dbGet = async (hash: string): Promise<CacheEntry | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(hash);
    req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
    req.onerror = () => reject(req.error);
  });
};

const dbPut = async (entry: CacheEntry): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const dbGetAll = async (): Promise<CacheEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as CacheEntry[]);
    req.onerror = () => reject(req.error);
  });
};

const dbDelete = async (hash: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const dbClear = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ─── Utilities ──────────────────────────────────────────────────────────────

const hashKey = (...parts: string[]): string => {
  const combined = parts.join('|');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

const estimateSize = (dataUri: string): number => dataUri.length * 0.75;

// LRU eviction: keep newest MAX_ENTRIES entries under MAX_SIZE_BYTES
const evictIfNeeded = async (all: CacheEntry[]): Promise<void> => {
  // Sort oldest first
  all.sort((a, b) => a.timestamp - b.timestamp);

  while (all.length > MAX_ENTRIES) {
    const evicted = all.shift()!;
    await dbDelete(evicted.hash);
    console.log(`[AssetCache] Evicted by count: ${evicted.hash}`);
  }

  let totalSize = all.reduce((sum, e) => sum + e.size, 0);
  while (totalSize > MAX_SIZE_BYTES && all.length > 0) {
    const evicted = all.shift()!;
    totalSize -= evicted.size;
    await dbDelete(evicted.hash);
    console.log(`[AssetCache] Evicted by size: ${evicted.hash}`);
  }
};

// ─── Public API ─────────────────────────────────────────────────────────────

export const getCachedAsset = async (
  visualPrompt: string,
  style: string,
  resolution: string,
  aspectRatio: string,
  seed: number
): Promise<string | null> => {
  try {
    const hash = hashKey(visualPrompt, style, resolution, aspectRatio, seed.toString());
    const entry = await dbGet(hash);
    if (entry) {
      console.log(`[AssetCache] HIT ${hash}`);
      // Refresh LRU timestamp
      await dbPut({ ...entry, timestamp: Date.now() });
      return entry.assetUrl;
    }
    console.log(`[AssetCache] MISS ${hash}`);
    return null;
  } catch (e) {
    console.warn('[AssetCache] getCachedAsset error:', e);
    return null;
  }
};

export const cacheAsset = async (
  assetUrl: string,
  visualPrompt: string,
  style: string,
  resolution: string,
  aspectRatio: string,
  seed: number
): Promise<void> => {
  try {
    const hash = hashKey(visualPrompt, style, resolution, aspectRatio, seed.toString());
    const size = estimateSize(assetUrl);
    await dbPut({ hash, assetUrl, timestamp: Date.now(), size });
    console.log(`[AssetCache] Cached ${hash} (${(size / 1024).toFixed(1)} KB)`);
    // Evict async — don't block caller
    dbGetAll().then(evictIfNeeded).catch(() => {});
  } catch (e) {
    console.warn('[AssetCache] cacheAsset error:', e);
  }
};

export const clearCache = async (): Promise<void> => {
  try {
    await dbClear();
    console.log('[AssetCache] Cache cleared');
  } catch (e) {
    console.warn('[AssetCache] clearCache error:', e);
  }
};

export const getCacheStats = async (): Promise<{ entries: number; totalSize: number; maxSize: number }> => {
  try {
    const all = await dbGetAll();
    const totalSize = all.reduce((sum, e) => sum + e.size, 0);
    return { entries: all.length, totalSize, maxSize: MAX_SIZE_BYTES };
  } catch (e) {
    return { entries: 0, totalSize: 0, maxSize: MAX_SIZE_BYTES };
  }
};
