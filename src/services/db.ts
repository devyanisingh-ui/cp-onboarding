import type { Database } from '@/types';
import { buildSeed, SCHEMA_VERSION } from '@/data/seed';

/**
 * In-memory "database" persisted to localStorage so the prototype survives reloads and
 * several tabs (e.g. BD Executive in one, Legal in another) stay in sync.
 */
const KEY = 'cp-onboarding-db';
let db: Database | null = null;
const listeners = new Set<() => void>();
/**
 * True when the saved data comes from a newer build of the app than this tab is running (an old
 * tab left open after an update). This tab then never writes, so it can't wipe the newer data.
 */
let outdated = false;

function load(): Database {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Database;
      if (parsed.schemaVersion === SCHEMA_VERSION) {
        // Collections added since this data was saved start empty (no reset, nothing lost).
        parsed.sms ??= [];
        parsed.leads ??= [];
        return parsed;
      }
      if (parsed.schemaVersion > SCHEMA_VERSION) {
        outdated = true;
        return buildSeed();
      }
    }
  } catch {
    /* corrupted or unavailable storage: fall back to seed */
  }
  const fresh = buildSeed();
  persist(fresh);
  return fresh;
}

function persist(d: Database) {
  if (outdated) return;
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

function versionOf(raw: string | null): number | undefined {
  const m = raw ? /"schemaVersion":(\d+)/.exec(raw) : null;
  return m ? Number(m[1]) : undefined;
}

if (typeof window !== 'undefined') {
  // Another tab saved. Data from a different build must not replace ours: a newer build means this
  // tab is out of date (reload it); an older build's data is ignored. Previously two tabs on
  // different builds kept re-seeding each other, wiping records just created (e.g. "Agreement not
  // found" in the new-agreement wizard).
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    const v = versionOf(e.newValue);
    if (v !== undefined && v > SCHEMA_VERSION) {
      outdated = true;
      window.location.reload();
      return;
    }
    // Ignore (don't write back straight away: an old tab may answer by re-seeding again). Our
    // in-memory data stays, and our next save puts it back.
    if (v !== undefined && v < SCHEMA_VERSION) return;
    db = null;
    listeners.forEach((l) => l());
  });
}
