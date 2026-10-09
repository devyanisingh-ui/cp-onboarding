import type { AppNotification, AuditEvent, Task, TaskType, User } from '@/types';
import { commit, getDb, nextId } from '../db';
import { forbidden, unauthorized, ApiError } from '../errors';
import { can, type Capability } from '@/lib/permissions';
import { addWorkingDays, today } from '@/lib/dates';
import { taskLink } from '@/lib/links';
import { deliver } from '../notificationChannels';

// ---------- Session (stands in for the OIDC session cookie) ----------

const SESSION_KEY = 'cp-onboarding-session';
// In-memory copy, so sign-in still works where sessionStorage is blocked (sandboxed viewers).
let memorySession: string | null = null;

export function getSessionUserId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? memorySession;
  } catch {
    return memorySession;
  }
}

export function setSessionUserId(id: string | null) {
  memorySession = id;
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked: the in-memory copy is used */
  }
}

// ---------- Request plumbing ----------

let latencyMs = { min: 150, max: 450 };
export function setLatency(min: number, max: number) {
  latencyMs = { min, max };
}

export async function delay(kind: 'read' | 'write' = 'read') {
  const ms = latencyMs.min + Math.random() * (latencyMs.max - latencyMs.min) * (kind === 'write' ? 1.4 : 1);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  if (getDb().settings.simulateErrors && Math.random() < 0.3) {
    throw new ApiError(503, 'The server could not be reached (simulated network error). Please retry.');
  }
}

/** Resolves the signed-in user on every call — the mock equivalent of checking the bearer token. */
export function ctx(): User {
  const id = getSessionUserId();
  const user = id ? getDb().users.find((u) => u.id === id && u.active) : undefined;
  if (!user) throw unauthorized();
  return user;
}

export function assertCan(user: User, cap: Capability, msg?: string) {
  if (!can(user, cap)) throw forbidden(msg);
}

export function inScope(user: User, institutionId: string): boolean {
  return can(user, 'scope.all') || user.institutionIds.includes(institutionId);
}

export function userName(id?: string): string {
  if (!id) return '—';
  if (id === 'system') return 'System';
  return getDb().users.find((u) => u.id === id)?.name ?? 'Unknown user';
}

export function now(): string {
  return new Date().toISOString();
}

// ---------- Audit (immutable, append-only) ----------

function device(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : 'Linux';
  return `${browser} · ${os}`;
}

export function audit(
  actor: Pick<User, 'id' | 'name'> | 'system',
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
) {
  const ev: AuditEvent = {
    id: nextId('audit', 'EV-', 5),
    actorId: actor === 'system' ? 'system' : actor.id,
    actorName: actor === 'system' ? 'System' : actor.name,
    action,
    entityType,
    entityId,
    summary,
    before,
    after,
    at: now(),
    ip: '10.20.4.17',
    device: actor === 'system' ? 'Scheduler' : device(),
  };
  getDb().audit.push(ev);
}

/** Returns only the keys that changed, for before/after audit values. */
export function diff<T extends object>(before: T, after: Partial<T>, redact: string[] = []) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after) as (keyof T & string)[]) {
    const bv = before[k];
    const av = after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = redact.includes(k) ? '[redacted]' : bv;
      a[k] = redact.includes(k) ? '[redacted]' : av;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

// ---------- Notifications ----------

/** PRD §9 content rule: only CP name, agreement ID, action and link. Enforced here. */
const SENSITIVE = [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/, /\b\d{9,18}\b/, /\b\d{4}\s\d{4}\s\d{4}\b/, /₹|INR\s?\d/];

export function containsSensitive(text: string): boolean {
  return SENSITIVE.some((re) => re.test(text));
}

export function notify(
  userIds: (string | undefined)[],
  msg: { title: string; body: string; link: string },
  opts: { email?: 'task' | 'reminder' | 'escalation' | 'event' | false } = {},
) {
  if (containsSensitive(`${msg.title} ${msg.body}`)) {
    throw new Error('Notification blocked: it contains personal or rate data.');
  }
  const d = getDb();
  const unique = [...new Set(userIds.filter(Boolean) as string[])];
  for (const uid of unique) {
    const user = d.users.find((u) => u.id === uid);
    if (!user) continue;
    const n: AppNotification = { id: nextId('notif', 'N-'), userId: uid, ...msg, createdAt: now(), read: false };
    d.notifications.push(n);
    const kind = opts.email ?? 'event';
    if (kind === false) continue;
    // Legal and Admin get the 9 AM digest instead of individual reminder emails.
    const digestUser = user.roles.some((r) => r === 'legal' || r === 'admin');
    if (kind === 'reminder' && digestUser) continue;
    deliver(user, { ...msg, kind });
  }
}

// ---------- Tasks ----------

export function createTask(t: {
  type: TaskType;
  title: string;
  assigneeId: string;
  slaDays?: number;
  dueDate?: string;
  agreementId?: string;
  cpId?: string;
  refId?: string;
  institutionId?: string;
  cpName?: string;
}): Task {
  const d = getDb();
  const task: Task = {
    id: nextId('task', 'T-'),
    type: t.type,
    title: t.title,
    assigneeId: t.assigneeId,
    agreementId: t.agreementId,
    cpId: t.cpId,
    refId: t.refId,
    institutionId: t.institutionId,
    dueDate: t.dueDate ?? addWorkingDays(today(), t.slaDays ?? 2),
    createdAt: now(),
    status: 'open',
  };
  d.tasks.push(task);
  notify(
    [t.assigneeId],
    { title: `New task: ${t.title}`, body: t.agreementId ? `Agreement ${t.agreementId}` : 'Open the task to act.', link: taskLink(task) },
    { email: 'task' },
  );
  return task;
}

export function closeTasks(
  match: { agreementId?: string; refId?: string; types: TaskType[] },
  by: User | 'system',
  status: 'done' | 'cancelled' = 'done',
) {
  for (const t of getDb().tasks) {
    if (t.status !== 'open' || !match.types.includes(t.type)) continue;
    if (match.agreementId && t.agreementId !== match.agreementId) continue;
    if (match.refId && t.refId !== match.refId) continue;
    t.status = status;
    t.completedAt = now();
    t.completedById = by === 'system' ? 'system' : by.id;
  }
}

export function firstUserWithRole(role: User['roles'][number], institutionId?: string): User | undefined {
  const users = getDb().users.filter((u) => u.active && u.roles.includes(role));
  return (institutionId && users.find((u) => u.institutionIds.includes(institutionId))) || users[0];
}

export function routeFor(institutionId: string, nonStandard: boolean) {
  const d = getDb();
  const cond = nonStandard ? 'non_standard' : 'standard';
  return (
    d.routing.find((r) => r.institutionId === institutionId && r.condition === cond) ??
    d.routing.find((r) => r.institutionId === institutionId)
  );
}

export { commit, getDb };
