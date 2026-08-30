const DB_NAME = "rustdesk-web";
const STORE_NAME = "kv";
const DB_VERSION = 1;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(key: string): Promise<string> {
  if (!hasIndexedDB()) {
    return (typeof localStorage !== "undefined" && localStorage.getItem(key)) || "";
  }
  const db = await openDb();
  return new Promise<string>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    let result = "";
    req.onsuccess = () => {
      result = (req.result as string) ?? "";
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function idbSet(key: string, value: string): Promise<void> {
  if (!hasIndexedDB()) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    return;
  }
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function idbRemove(key: string): Promise<void> {
  if (!hasIndexedDB()) {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    return;
  }
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}