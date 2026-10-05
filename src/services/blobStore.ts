import { createStore, del, get, set, clear } from 'idb-keyval';

/** Uploaded files live in IndexedDB (stand-in for encrypted S3/Azure Blob storage). */
// Opening IndexedDB throws in some sandboxed viewers; fall back to memory-only file storage.
function openStore() {
  try {
    return typeof indexedDB !== 'undefined' ? createStore('cp-onboarding-files', 'blobs') : undefined;
  } catch {
    return undefined;
  }
}
const store = openStore();
const memory = new Map<string, Blob>();

export async function putBlob(key: string, blob: Blob): Promise<void> {
  memory.set(key, blob);
  if (store) await set(key, blob, store).catch(() => undefined);
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  if (memory.has(key)) return memory.get(key);
  if (!store) return undefined;
  return get<Blob>(key, store).catch(() => undefined);
}

export async function deleteBlob(key: string): Promise<void> {
  memory.delete(key);
  if (store) await del(key, store).catch(() => undefined);
}

export async function clearBlobs(): Promise<void> {
  memory.clear();
  if (store) await clear(store).catch(() => undefined);
}
