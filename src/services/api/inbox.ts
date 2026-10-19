import type { AppNotification, AuditEvent, EmailMessage, Task, TaskType } from '@/types';
import { daysBetween, daysUntil, shiftDays, today } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { taskLink } from '@/lib/links';
import { IN_PROGRESS_STATUSES } from '@/lib/status';
import { assertCan, commit, ctx, delay, getDb, inScope, userName } from './core';
import { toSummary, type AgreementSummary } from './dto';

export interface TaskItem extends Task {
  link: string;
  cpName?: string;
  institutionCode?: string;
  overdue: boolean;
  daysLeft: number;
  assigneeName: string;
  escalatedToName?: string;
  escalatedToMe: boolean;
}

function toItem(t: Task, userId: string): TaskItem {
  const d = getDb();
  return {
    ...t,
    link: taskLink(t),
    cpName: t.cpId ? d.cps.find((c) => c.id === t.cpId)?.legalName : undefined,
    institutionCode: t.institutionId ? d.institutions.find((i) => i.id === t.institutionId)?.shortCode : undefined,
    overdue: t.status === 'open' && t.dueDate < today(),
    daysLeft: daysUntil(t.dueDate),
    assigneeName: userName(t.assigneeId),
    escalatedToName: t.escalatedToId ? userName(t.escalatedToId) : undefined,
    escalatedToMe: t.escalatedToId === userId && t.assigneeId !== userId,
  };
}

export async function listMyTasks(f: { type?: TaskType | ''; institutionId?: string; status?: 'open' | 'done' } = {}): Promise<TaskItem[]> {
  await delay();
  const user = ctx();
  const status = f.status ?? 'open';
  return getDb()
    .tasks.filter((t) => (t.assigneeId === user.id || t.escalatedToId === user.id) && t.status === (status === 'open' ? 'open' : 'done'))
    .filter((t) => (!f.type || t.type === f.type) && (!f.institutionId || t.institutionId === f.institutionId))
    .map((t) => toItem(t, user.id))
    .sort((a, b) => (status === 'open' ? a.dueDate.localeCompare(b.dueDate) : (b.completedAt ?? '').localeCompare(a.completedAt ?? '')));
}

export interface Dashboard {
  pendingTasks: TaskItem[];
  overdueCount: number;
  drafts: AgreementSummary[];
  awaitingSigned: AgreementSummary[];
  expiring: AgreementSummary[];
  pendingApproval: AgreementSummary[];
  pendingGate2: AgreementSummary[];
  pendingAdminApproval: AgreementSummary[];
  counts: { active: number; inProgress: number; nonStandard: number; cps: number };
  wizardDrafts: number;
  /** BD Executive view: their own agreements laid out along the workflow. */
  bd?: BdDashboard;
}

/** Who an agreement is waiting on when the next move is not the BD Executive's. */
export type WaitingOn = 'legal' | 'admin' | 'cp' | 'signers' | 'deviation';

export interface WaitingItem {
  agreement: AgreementSummary;
  on: WaitingOn;
  /** What is happening, in words. */
  what: string;
  since: string;
  days: number;
}

export interface BdDashboard {
  /** The BD's agreements at each step of the workflow (counts). */
  stages: { draft: number; signing: number; legal: number; admin: number; active: number };
  waiting: WaitingItem[];
  /** Live agreements owned by the BD, expiring within 60 days (soonest first). */
  expiring: AgreementSummary[];
  stats: { active: number; expiring: number; activated30d: number; cps: number; nonStandard: number };
}

export async function dashboard(institutionId?: string): Promise<Dashboard> {
  await delay();
  const user = ctx();
  const d = getDb();
  const ags = d.agreements.filter((a) => inScope(user, a.institutionId) && (!institutionId || a.institutionId === institutionId));
  const mine = (a: (typeof ags)[number]) => !user.roles.includes('bd_exec') || a.ownerId === user.id || can(user, 'scope.all');
  const tasks = d.tasks
    .filter((t) => t.status === 'open' && (t.assigneeId === user.id || t.escalatedToId === user.id) && (!institutionId || !t.institutionId || t.institutionId === institutionId))
    .map((t) => toItem(t, user.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const sum = (list: typeof ags) => list.map(toSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    pendingTasks: tasks,
    overdueCount: tasks.filter((t) => t.overdue).length,
    drafts: sum(ags.filter((a) => a.status === 'draft' && mine(a))),
    awaitingSigned: sum(ags.filter((a) => a.status === 'approved_for_signing' && mine(a))),
    expiring: sum(ags.filter((a) => a.status === 'active' && a.endDate && daysUntil(a.endDate) <= 60)).sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? '')),
    pendingApproval: sum(ags.filter((a) => a.status === 'pending_approval')),
    pendingGate2: sum(ags.filter((a) => a.status === 'signed_copy_uploaded')),
    pendingAdminApproval: sum(ags.filter((a) => a.status === 'pending_admin_approval')),
    counts: {
      active: ags.filter((a) => a.status === 'active' || a.status === 'notice_period').length,
      inProgress: ags.filter((a) => IN_PROGRESS_STATUSES.includes(a.status)).length,
      nonStandard: ags.filter((a) => a.nonStandard && (a.status === 'active' || IN_PROGRESS_STATUSES.includes(a.status))).length,
      cps: new Set(ags.map((a) => a.cpId)).size,
    },
    wizardDrafts: d.wizardDrafts.filter((w) => w.userId === user.id).length,
    bd: user.roles.includes('bd_exec') ? bdDashboard(ags.filter((a) => a.ownerId === user.id)) : undefined,
  };
}

function bdDashboard(own: ReturnType<typeof getDb>['agreements']): BdDashboard {
  const d = getDb();
  const t = today();
  const at = (iso?: string) => (iso ?? t).slice(0, 10);
  const waiting: WaitingItem[] = [];
  const wait = (a: (typeof own)[number], on: WaitingOn, what: string, since?: string) =>
    waiting.push({ agreement: toSummary(a), on, what, since: at(since), days: Math.max(0, daysBetween(at(since), t)) });
  for (const a of own) {
    if (a.status === 'pending_approval') wait(a, 'legal', 'Legal is reviewing the signed agreement', a.updatedAt);
    else if (a.status === 'pending_admin_approval') wait(a, 'admin', 'Admin final approval', a.updatedAt);
    else if (a.status === 'approved_for_signing' && a.esign?.status === 'in_progress') wait(a, 'signers', 'Out for e-signature', a.esign.sentAt ?? a.updatedAt);
    else if (a.docRequest?.status === 'sent_to_cp') wait(a, 'cp', 'CP to upload corrected documents', a.docRequest.sentAt);
    else if (a.status === 'draft' && d.deviations.some((x) => x.agreementId === a.id && x.status === 'pending')) {
      const first = d.deviations.filter((x) => x.agreementId === a.id && x.status === 'pending').map((x) => x.requestedAt).sort()[0];
      wait(a, 'deviation', 'Legal is reviewing a deviation request', first);
    }
  }
  const live = own.filter((a) => a.status === 'active' || a.status === 'notice_period');
  const expiring = own
    .filter((a) => a.status === 'active' && a.endDate && daysUntil(a.endDate) <= 60)
    .map(toSummary)
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));
  const since30 = shiftDays(t, -30);
  return {
    stages: {
      draft: own.filter((a) => a.status === 'draft').length,
      signing: own.filter((a) => a.status === 'approved_for_signing').length,
      legal: own.filter((a) => a.status === 'pending_approval' || (a.status === 'signed_copy_uploaded' && a.source === 'app')).length,
      admin: own.filter((a) => a.status === 'pending_admin_approval').length,
      active: live.length,
    },
    waiting: waiting.sort((a, b) => b.days - a.days),
    expiring,
    stats: {
      active: live.length,
      expiring: expiring.length,
      activated30d: own.filter((a) => a.activatedAt && a.activatedAt.slice(0, 10) >= since30).length,
      cps: new Set(own.map((a) => a.cpId)).size,
      nonStandard: live.filter((a) => a.nonStandard).length,
    },
  };
}

export async function listNotifications(): Promise<AppNotification[]> {
  await delay('read');
  const user = ctx();
  return getDb()
    .notifications.filter((n) => n.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
}

/** Cheap synchronous count for the header bell (real build: websocket push). */
export function unreadCount(): number {
  try {
    const user = ctx();
    return getDb().notifications.filter((n) => n.userId === user.id && !n.read).length;
  } catch {
    return 0;
  }
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const user = ctx();
  for (const n of getDb().notifications) if (n.userId === user.id && (!ids || ids.includes(n.id))) n.read = true;
  commit();
}

export interface AuditFilters {
  q?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

export async function listAudit(f: AuditFilters = {}): Promise<AuditEvent[]> {
  await delay();
  const user = ctx();
  assertCan(user, 'audit.view');
  const q = f.q?.toLowerCase().trim();
  return getDb()
    .audit.filter((e) => {
      if (f.actorId && e.actorId !== f.actorId) return false;
      if (f.action && e.action !== f.action) return false;
      if (f.entityType && e.entityType !== f.entityType) return false;
      if (f.from && e.at.slice(0, 10) < f.from) return false;
      if (f.to && e.at.slice(0, 10) > f.to) return false;
      if (q && !`${e.summary} ${e.entityId} ${e.actorName}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .slice()
    .reverse();
}

export async function listEmails(): Promise<EmailMessage[]> {
  await delay();
  assertCan(ctx(), 'config.view');
  return getDb().emails.slice().reverse().slice(0, 200);
}
