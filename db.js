'use strict';

// Prosta baza danych graczy w IndexedDB (przechowywana w przeglądarce na tym urządzeniu).
const DB = (() => {
  const NAME = 'odejmowanko';
  const VERSION = 1;
  const STORE = 'players';
  let dbPromise;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(NAME, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  // Poproś przeglądarkę, żeby nie kasowała danych przy braku miejsca.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  return {
    all:    ()     => run('readonly',  s => s.getAll()),
    get:    id     => run('readonly',  s => s.get(id)),
    put:    player => run('readwrite', s => s.put(player)), // zwraca id
    remove: id     => run('readwrite', s => s.delete(id)),
  };
})();
