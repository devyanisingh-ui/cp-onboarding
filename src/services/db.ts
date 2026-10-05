import type { Database } from '@/types';
import { buildSeed, SCHEMA_VERSION } from '@/data/seed';

/**
 * In-memory "database" persisted to localStorage so the prototype survives reloads and
 * several tabs (e.g. BD Executive in one, Approver in another) stay in sync.
 */
const KEY = 'cp-onboarding-db';
let db: Database | null = null;
const listeners = new Set<() => void>();

function load(): Database {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Database;
      if (parsed.schemaVersion === SCHEMA_VERSION) return parsed;
    }
  } catch {
    /* corrupted or unavailable storage: fall back to seed */
  }
  const fresh = buildSeed();
  persist(fresh);
  return fresh;
}

function persist(d: Database) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* quota exceeded or storage blocked: keep working in memory */
  }
}

export function getDb(): Database {
  if (!db) db = load();
  return db;
}

/** Call after every mutation. */
export function commit() {
  if (db) persist(db);
  listeners.forEach((l) => l());
}

export function resetDb() {
  db = buildSeed();
  commit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function nextId(counter: string, prefix: string, pad = 4): string {
  const d = getDb();
  d.counters[counter] = (d.counters[counter] ?? 0) + 1;
  return `${prefix}${String(d.counters[counter]).padStart(pad, '0')}`;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      db = null;
      listeners.forEach((l) => l());
    }
  });
}
