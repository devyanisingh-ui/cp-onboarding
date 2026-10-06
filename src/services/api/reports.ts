import type { Agreement, CpType } from '@/types';
import { daysUntil, formatShortDate, today } from '@/lib/dates';
import { CP_TYPE_LABELS, formatInr } from '@/lib/format';
import { STATUS_META, displayStatus } from '@/lib/status';
import { assertCan, ctx, delay, getDb, inScope, userName } from './core';

export type ReportId =
  | 'by_status'
  | 'stuck'
  | 'expiring'
  | 'non_standard'
  | 'register'
  | 'reasons'
  | 'legacy';

export const REPORTS: { id: ReportId; title: string; description: string }[] = [
  { id: 'by_status', title: 'Agreements by status', description: 'Count and list per status, per institution.' },
  { id: 'stuck', title: 'Stuck / overdue items', description: 'Items past SLA, days overdue, owner and who it was escalated to.' },
  { id: 'expiring', title: 'Expiring in 60 days', description: 'Agreements nearing expiry and their renewal decision status.' },
  { id: 'non_standard', title: 'Non-standard CPs', description: 'Agreements with deviations: what changed and who approved it.' },
  { id: 'register', title: 'Active CP register', description: 'All active CPs with institution, dates and rate card version.' },
  { id: 'reasons', title: 'Non-renewal & termination reasons', description: 'Counts by reason and institution.' },
  { id: 'legacy', title: 'Legacy import status', description: 'Imported, awaiting scan, verified and rejected legacy agreements.' },
];

export interface ReportFilters {
  institutionId?: string;
  regionId?: string;
  cpType?: CpType | '';
  ownerId?: string;
  from?: string;
  to?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'right';
}

export interface ReportResult {
  id: ReportId;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  summary: { label: string; value: string | number; tone?: string }[];
  links: (string | undefined)[];
}

export async function runReport(id: ReportId, f: ReportFilters = {}): Promise<ReportResult> {
  await delay();
  const user = ctx();
  assertCan(user, 'reports.view');
  const d = getDb();
  const inst = (id: string) => d.institutions.find((i) => i.id === id)!;
  const cp = (id: string) => d.cps.find((c) => c.id === id)!;
  const inRange = (date?: string) => (!f.from || (date ?? '') >= f.from) && (!f.to || (date ?? '') <= f.to);
  const scoped = d.agreements.filter(
    (a) =>
      inScope(user, a.institutionId) &&
      (!f.institutionId || a.institutionId === f.institutionId) &&
      (!f.regionId || inst(a.institutionId).regionId === f.regionId) &&
      (!f.cpType || cp(a.cpId).type === f.cpType) &&
      (!f.ownerId || a.ownerId === f.ownerId),
  );
  const title = REPORTS.find((r) => r.id === id)!.title;
  const base = (a: Agreement) => ({ agreement: a.id, cp: cp(a.cpId).legalName, institution: inst(a.institutionId).shortCode });

  switch (id) {
    case 'by_status': {
      const list = scoped.filter((a) => inRange(a.createdAt.slice(0, 10)));
      const counts = new Map<string, number>();
      list.forEach((a) => counts.set(displayStatus(a), (counts.get(displayStatus(a)) ?? 0) + 1));
      return {
        id, title,
        columns: [{ key: 'agreement', label: 'Agreement' }, { key: 'cp', label: 'CP' }, { key: 'institution', label: 'Institution' }, { key: 'type', label: 'CP type' }, { key: 'status', label: 'Status' }, { key: 'owner', label: 'Owner' }, { key: 'updated', label: 'Last updated' }],
        rows: list.map((a) => ({ ...base(a), type: CP_TYPE_LABELS[cp(a.cpId).type], status: STATUS_META[displayStatus(a)].label, owner: userName(a.ownerId), updated: formatShortDate(a.updatedAt) })),
        summary: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ label: STATUS_META[s as keyof typeof STATUS_META].label, value: n, tone: s })),
        links: list.map((a) => `/agreements/${a.id}`),
      };
    }
    case 'stuck': {
      const ids = new Set(scoped.map((a) => a.id));
      const tasks = d.tasks.filter((t) => t.status === 'open' && t.dueDate < today() && (!t.agreementId || ids.has(t.agreementId)) && inRange(t.dueDate));
      return {
        id, title,
        columns: [{ key: 'task', label: 'Item' }, { key: 'agreement', label: 'Agreement' }, { key: 'owner', label: 'Owner' }, { key: 'due', label: 'Due' }, { key: 'overdue', label: 'Days overdue', align: 'right' }, { key: 'escalated', label: 'Escalated to' }],
        rows: tasks.map((t) => ({ task: t.title, agreement: t.agreementId ?? '—', owner: userName(t.assigneeId), due: formatShortDate(t.dueDate), overdue: -daysUntil(t.dueDate), escalated: t.escalatedToId ? userName(t.escalatedToId) : '—' })).sort((a, b) => Number(b.overdue) - Number(a.overdue)),
        summary: [{ label: 'Overdue items', value: tasks.length }, { label: 'Escalated', value: tasks.filter((t) => t.escalatedToId).length }],
        links: tasks.map((t) => (t.agreementId ? `/agreements/${t.agreementId}` : undefined)),
      };
    }
    case 'expiring': {
      const list = scoped.filter((a) => a.status === 'active' && a.endDate && daysUntil(a.endDate) <= 60 && inRange(a.endDate)).sort((a, b) => a.endDate!.localeCompare(b.endDate!));
      const decision = (a: Agreement) =>
        !a.renewal ? 'No decision yet' : a.renewal.decision === 'do_not_renew' ? `Do not renew (${a.renewal.confirmation === 'confirmed' ? 'confirmed' : 'awaiting Approver'})` : `Renewing → ${a.renewal.successorId}`;
      return {
        id, title,
        columns: [{ key: 'agreement', label: 'Agreement' }, { key: 'cp', label: 'CP' }, { key: 'institution', label: 'Institution' }, { key: 'expiry', label: 'Expiry' }, { key: 'days', label: 'Days left', align: 'right' }, { key: 'decision', label: 'Renewal decision' }, { key: 'owner', label: 'Owner' }],
        rows: list.map((a) => ({ ...base(a), expiry: formatShortDate(a.endDate), days: daysUntil(a.endDate!), decision: decision(a), owner: userName(a.ownerId) })),
        summary: [{ label: 'Expiring', value: list.length }, { label: 'Pending decision', value: list.filter((a) => !a.renewal).length }],
        links: list.map((a) => `/agreements/${a.id}`),
      };
    }
    case 'non_standard': {
      const ids = new Set(scoped.filter((a) => inRange(a.createdAt.slice(0, 10))).map((a) => a.id));
      const devs = d.deviations.filter((x) => x.status === 'approved' && ids.has(x.agreementId));
      return {
        id, title,
        columns: [{ key: 'agreement', label: 'Agreement' }, { key: 'cp', label: 'CP' }, { key: 'change', label: 'What changed' }, { key: 'standard', label: 'Standard' }, { key: 'agreed', label: 'Agreed' }, { key: 'by', label: 'Approved by' }, { key: 'on', label: 'On' }],
        rows: devs.map((x) => {
          const a = d.agreements.find((y) => y.id === x.agreementId)!;
          const fmt = (v?: string) => (x.type === 'rate' ? formatInr(Number(v)) : `${(v ?? '').slice(0, 60)}…`);
          return { agreement: a.id, cp: cp(a.cpId).legalName, change: x.label, standard: fmt(x.standardValue), agreed: fmt(x.agreedValue), by: userName(x.decidedById), on: formatShortDate(x.decidedAt) };
        }),
        summary: [{ label: 'Non-standard agreements', value: new Set(devs.map((x) => x.agreementId)).size }, { label: 'Approved deviations', value: devs.length }],
        links: devs.map((x) => `/agreements/${x.agreementId}`),
      };
    }
    case 'register': {
      const list = scoped.filter((a) => (a.status === 'active' || a.status === 'notice_period') && inRange(a.startDate));
      return {
        id, title,
        columns: [{ key: 'cp', label: 'CP' }, { key: 'type', label: 'Type' }, { key: 'institution', label: 'Institution' }, { key: 'agreement', label: 'Agreement' }, { key: 'start', label: 'Commencement' }, { key: 'end', label: 'Expiry' }, { key: 'rate', label: 'Rate card' }, { key: 'source', label: 'Source' }],
        rows: list.map((a) => ({ ...base(a), type: CP_TYPE_LABELS[cp(a.cpId).type], start: formatShortDate(a.startDate), end: formatShortDate(a.endDate), rate: `v${d.rateCards.find((r) => r.id === a.rateCardVersionId)?.version ?? '?'}`, source: a.source === 'legacy' ? 'Legacy' : 'App' })),
        summary: [{ label: 'Active CPs', value: new Set(list.map((a) => a.cpId)).size }, { label: 'Active agreements', value: list.length }],
        links: list.map((a) => `/agreements/${a.id}`),
      };
    }
    case 'reasons': {
      const counts = new Map<string, { kind: string; reason: string; institution: string; count: number }>();
      for (const a of scoped) {
        const add = (kind: string, reason: string, date?: string) => {
          if (!inRange(date)) return;
          const key = `${kind}|${reason}|${a.institutionId}`;
          const row = counts.get(key) ?? { kind, reason, institution: inst(a.institutionId).shortCode, count: 0 };
          row.count++;
          counts.set(key, row);
        };
        if (a.renewal?.decision === 'do_not_renew' && a.renewal.reason) add('Non-renewal', a.renewal.reason, a.renewal.decidedAt.slice(0, 10));
        if (a.termination && a.termination.confirmation === 'confirmed') add(`Termination (${a.termination.type})`, a.termination.reason, a.termination.noticeDate);
      }
      const rows = [...counts.values()].sort((a, b) => b.count - a.count);
      return {
        id, title,
        columns: [{ key: 'kind', label: 'Type' }, { key: 'reason', label: 'Reason' }, { key: 'institution', label: 'Institution' }, { key: 'count', label: 'Count', align: 'right' }],
        rows,
        summary: [{ label: 'Non-renewals', value: rows.filter((r) => r.kind === 'Non-renewal').reduce((s, r) => s + r.count, 0) }, { label: 'Terminations', value: rows.filter((r) => r.kind.startsWith('Termination')).reduce((s, r) => s + r.count, 0) }],
        links: [],
      };
    }
    case 'legacy': {
      const list = scoped.filter((a) => a.source === 'legacy' && inRange(a.createdAt.slice(0, 10)));
      const hasScan = (a: Agreement) => d.documents.some((x) => x.ownerId === a.id && x.type === 'signed_copy' && x.verificationStatus !== 'mismatch');
      const state = (a: Agreement) => (a.status === 'active' || a.status === 'notice_period' || a.status === 'expired' ? 'Verified' : a.lastRejection?.gate === 2 ? 'Rejected' : hasScan(a) ? 'Awaiting Gate 2' : 'Awaiting scan');
      const rows = list.map((a) => ({ ...base(a), batch: a.legacyBatchId ?? '—', state: state(a), owner: userName(a.ownerId), imported: formatShortDate(a.createdAt) }));
      const count = (s: string) => rows.filter((r) => r.state === s).length;
      return {
        id, title,
        columns: [{ key: 'agreement', label: 'Agreement' }, { key: 'cp', label: 'CP' }, { key: 'institution', label: 'Institution' }, { key: 'batch', label: 'Batch' }, { key: 'state', label: 'Status' }, { key: 'owner', label: 'Owner' }, { key: 'imported', label: 'Imported' }],
        rows,
        summary: [{ label: 'Imported', value: rows.length }, { label: 'Awaiting scan', value: count('Awaiting scan') }, { label: 'Awaiting Gate 2', value: count('Awaiting Gate 2') }, { label: 'Verified', value: count('Verified') }, { label: 'Rejected', value: count('Rejected') }],
        links: list.map((a) => `/agreements/${a.id}`),
      };
    }
  }
}
