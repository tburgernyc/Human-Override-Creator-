// IndexedDB-backed persistence for the active project's generated assets.
// localStorage can't hold base64-encoded videos/images (quota ~5-10MB), so the
// previous code stripped assets on save — meaning a page refresh wiped 10-20
// minutes of generation work. This module keeps the active assets durable.
//
// Records are keyed by projectId so two tabs editing different projects don't
// stomp each other, and so loading an archive doesn't ambiguously share the
// same 'active' bucket. The legacy 'active' key is auto-migrated on first read.

import type { GeneratedAssets } from '../types';

const DB_NAME = 'human-override-creator';
const STORE_NAME = 'active-assets';
const LEGACY_RECORD_KEY = 'active';
const RECORD_KEY_PREFIX = 'proj_';
const DB_VERSION = 1;

const recordKey = (projectId: string) => `${RECORD_KEY_PREFIX}${projectId}`;

const supportsIDB = (): boolean => typeof indexedDB !== 'undefined';

const openDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (!supportsIDB()) { resolve(null); return; }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      console.warn('IDB open threw synchronously:', e);
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { console.warn('IDB open failed:', req.error); resolve(null); };
    req.onblocked = () => { console.warn('IDB open blocked'); resolve(null); };
  });
};

// Resolves on success. Rejects with the IDBRequest/IDBTransaction error when the
// write actually fails (e.g. QuotaExceededError) so callers can surface a toast.
// Returns silently when IDB is unavailable (private browsing, SSR) since that's
// a soft fallback rather than a recoverable failure.
export const saveAssets = async (projectId: string, assets: GeneratedAssets): Promise<void> => {
  if (!projectId) return;
  const db = await openDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(assets, recordKey(projectId));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IDB save failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IDB save aborted'));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  } finally {
    db.close();
  }
};

export const loadAssets = async (projectId: string): Promise<GeneratedAssets | null> => {
  if (!projectId) return null;
  const db = await openDB();
  if (!db) return null;

  const readKey = (key: string) => new Promise<GeneratedAssets | null>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => { console.warn('IDB load failed:', req.error); resolve(null); };
    } catch (e) {
      console.warn('IDB load threw:', e);
      resolve(null);
    }
  });

  let result = await readKey(recordKey(projectId));

  // Adopt any pre-B15 record left under the unscoped 'active' key — happens once
  // per browser. After adoption the legacy key is dropped so subsequent project
  // switches don't pick it up.
  if (result == null) {
    const legacy = await readKey(LEGACY_RECORD_KEY);
    if (legacy) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(legacy, recordKey(projectId));
          tx.objectStore(STORE_NAME).delete(LEGACY_RECORD_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch { resolve(); }
      });
      result = legacy;
    }
  }

  db.close();
  return result;
};

export const clearAssets = async (projectId: string): Promise<void> => {
  if (!projectId) return;
  const db = await openDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(recordKey(projectId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
};
