// IndexedDB-backed persistence for the active project's generated assets.
// localStorage can't hold base64-encoded videos/images (quota ~5-10MB), so the
// previous code stripped assets on save — meaning a page refresh wiped 10-20
// minutes of generation work. This module keeps the active assets durable.
//
// Scope: only the *active* (currently-loaded) project's assets are persisted
// here. Archived projects still go to localStorage without assets, matching
// existing behaviour. Archive-with-assets would require per-project keying
// and is deferred.

import type { GeneratedAssets } from '../types';

const DB_NAME = 'human-override-creator';
const STORE_NAME = 'active-assets';
const RECORD_KEY = 'active';
const DB_VERSION = 1;

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

export const saveAssets = async (assets: GeneratedAssets): Promise<void> => {
  const db = await openDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(assets, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => { console.warn('IDB save failed:', tx.error); resolve(); };
      tx.onabort = () => { console.warn('IDB save aborted:', tx.error); resolve(); };
    } catch (e) {
      console.warn('IDB save threw:', e);
      resolve();
    }
  });
  db.close();
};

export const loadAssets = async (): Promise<GeneratedAssets | null> => {
  const db = await openDB();
  if (!db) return null;
  const result = await new Promise<GeneratedAssets | null>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => { console.warn('IDB load failed:', req.error); resolve(null); };
    } catch (e) {
      console.warn('IDB load threw:', e);
      resolve(null);
    }
  });
  db.close();
  return result;
};

export const clearAssets = async (): Promise<void> => {
  const db = await openDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
};
