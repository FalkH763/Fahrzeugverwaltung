// Lokale Ablage importierter GLB-Dateien in IndexedDB (Schlüssel: SHA-256).
// Das Projekt-JSON enthält nur die Referenz, nicht die Modellbytes.

const DB_NAME = 'charakteratelier';
const DB_VERSION = 1;
const STORE = 'figures';

function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'sha256' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export function putFigure({ sha256, name, bytes, report }) {
  return tx('readwrite', (s) => wrap(s.put({ sha256, name, bytes, report, storedAt: new Date().toISOString() })));
}

export function getFigure(sha256) {
  return tx('readonly', (s) => wrap(s.get(sha256)));
}

export function listFigures() {
  return tx('readonly', (s) => wrap(s.getAll())).then((all) => all.map(({ bytes, ...meta }) => ({ ...meta, sizeBytes: bytes?.byteLength ?? 0 })));
}

export function deleteFigure(sha256) {
  return tx('readwrite', (s) => wrap(s.delete(sha256)));
}
