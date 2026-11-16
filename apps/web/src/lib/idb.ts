// A few values kept in IndexedDB on this device (D55): the saved query cache and the queue of
// changes made offline. One database, one store, keyed by name. Every call resolves, even where
// IndexedDB is missing or blocked (a private window): reads give undefined, writes do nothing.

const DB = 'strekatron';
const STORE = 'kv';

let opening: Promise<IDBDatabase | null> | undefined;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const idbGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key) as IDBRequest<T>);

export const idbSet = async (key: string, value: unknown) => {
  await run('readwrite', (s) => s.put(value, key));
};

export const idbDelete = async (key: string) => {
  await run('readwrite', (s) => s.delete(key));
};
