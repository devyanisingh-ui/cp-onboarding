/**
 * Leads and revenue per CP, pulled from the CRM.
 *
 * The sync asks the CRM connector for leads, matches each to a CP (the CP's CRM partner code, or
 * its ID) and an institution (short code), and stores them without personal data. It runs at most
 * hourly with the scheduled jobs, and on demand from Admin → System. Only Admin changes anything:
 * a correction to a lead (kept across syncs) or a CP's partner code.
 */
import type { CpLead, CrmSyncState, LeadStatus } from '@/types';
import { conflict, invalid, notFound } from '../errors';
import { nextId } from '../db';
import { assertCan, audit, commit, ctx, delay, getDb, inScope, now } from './core';
import { cpFullAccess } from './dto';
import type { CrmConnector } from '../crm/connector';
import { demoCrm } from '../crm/demoCrm';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = { lead: 'Lead', applied: 'Applied', admitted: 'Admitted', dropped: 'Dropped' };
const SYNC_EVERY_MS = 60 * 60 * 1000;

/** The CP's code in the CRM. */
export const partnerCodeOf = (cp: { id: string; crmPartnerCode?: string }) => cp.crmPartnerCode?.trim() || cp.id;

/**
 * The connector in use. Until a CRM is chosen this is the demo: it "knows" the partners that have
 * agreements, the way the real CRM would know the partner codes set up in it.
 */
function connector(): CrmConnector {
  const d = getDb();
  const partners = d.cps
    .map((cp) => ({
      code: partnerCodeOf(cp),
      institutionCodes: [...new Set(d.agreements.filter((a) => a.cpId === cp.id && a.status !== 'draft').map((a) => d.institutions.find((i) => i.id === a.institutionId)!.shortCode))],
    }))
    .filter((p) => p.institutionCodes.length);
  return demoCrm(partners);
}

/** Effective status and fee: Admin's correction wins over the CRM's values. */
export function effective(l: CpLead): { status: LeadStatus; feeInr?: number } {
  return l.correction ? { status: l.correction.status, feeInr: l.correction.feeInr } : { status: l.status, feeInr: l.feeInr };
}

export async function syncCrm(by: 'system' | { id: string; name: string } = 'system'): Promise<NonNullable<CrmSyncState['lastResult']>> {
  const d = getDb();
  const c = connector();
  const state: CrmSyncState = (d.crmSync ??= { connector: c.label });
  state.connector = c.label;
  let fetched;
  try {
    fetched = await c.fetchLeads(state.lastSyncAt);
  } catch (e) {
    state.lastSyncAt = now();
    state.lastResult = { fetched: 0, created: 0, updated: 0, unmatched: 0, error: e instanceof Error ? e.message : 'The CRM could not be reached.' };
    commit();
    return state.lastResult;
  }
  const leads = (d.leads ??= []);
  const cpByCode = new Map(d.cps.map((cp) => [partnerCodeOf(cp).toUpperCase(), cp]));
  const instByCode = new Map(d.institutions.map((i) => [i.shortCode.toUpperCase(), i]));
  const result = { fetched: fetched.length, created: 0, updated: 0, unmatched: 0 };
  for (const x of fetched) {
    const cp = cpByCode.get(x.partnerCode.toUpperCase());
    const inst = instByCode.get(x.institutionCode.toUpperCase());
    if (!cp || !inst) {
      result.unmatched++;
      continue;
    }
    const fields = {
      cpId: cp.id,
      institutionId: inst.id,
      programme: x.programme,
      academicYear: x.academicYear,
      status: x.status,
      createdOn: x.createdOn,
      appliedOn: x.appliedOn,
      admittedOn: x.admittedOn,
      droppedOn: x.droppedOn,
      feeInr: x.feeInr,
      syncedAt: now(),
    };
    const existing = leads.find((l) => l.crmId === x.crmId);
    if (!existing) {
      leads.push({ id: nextId('lead', 'L-', 5), crmId: x.crmId, ...fields });
      result.created++;
    } else if ((Object.keys(fields) as (keyof typeof fields)[]).some((k) => k !== 'syncedAt' && existing[k] !== fields[k])) {
      Object.assign(existing, fields);
      result.updated++;
    } else {
      existing.syncedAt = fields.syncedAt;
    }
  }
  state.lastSyncAt = now();
  state.lastResult = result;
  if (by !== 'system' || result.created || result.updated) {
    audit(by, 'sync', 'crm', 'leads', `CRM sync (${c.label}): ${result.fetched} fetched, ${result.created} new, ${result.updated} updated, ${result.unmatched} not matched to a CP`);
  }
  commit();
  return result;
}

/** With the scheduled jobs: syncs when the last sync is over an hour old. */
export async function syncCrmIfDue(): Promise<void> {
  const last = getDb().crmSync?.lastSyncAt;
  if (last && Date.now() - Date.parse(last) < SYNC_EVERY_MS) return;
  await syncCrm('system');
}

// ---------------- Screens ----------------

export interface LeadTotals {
  leads: number;
  applications: number;
  admissions: number;
  dropped: number;
  /** Admissions ÷ leads, 0–100. */
  conversion: number;
  revenueInr: number;
}

export interface CpLeadsView {
  partnerCode: string;
  sync?: CrmSyncState;
  years: string[];
  totals: LeadTotals;
  byInstitution: ({ institutionId: string; institutionCode: string } & LeadTotals)[];
  leads: (CpLead & { institutionCode: string; effectiveStatus: LeadStatus; effectiveFeeInr?: number })[];
  canEdit: boolean;
}

function totalsOf(list: CpLead[]): LeadTotals {
  const eff = list.map(effective);
  const admitted = eff.filter((e) => e.status === 'admitted');
  const applications = list.filter((l, i) => l.appliedOn || eff[i]!.status === 'applied' || eff[i]!.status === 'admitted').length;
  return {
    leads: list.length,
    applications,
    admissions: admitted.length,
    dropped: eff.filter((e) => e.status === 'dropped').length,
    conversion: list.length ? Math.round((admitted.length / list.length) * 1000) / 10 : 0,
    revenueInr: admitted.reduce((s, e) => s + (e.feeInr ?? 0), 0),
  };
}

/** The CP's leads and revenue, for institutions in the user's scope. `year` filters by admission cycle. */
export async function getCpLeads(cpId: string, year?: string): Promise<CpLeadsView> {
  await delay();
  const user = ctx();
  const d = getDb();
  const cp = d.cps.find((c) => c.id === cpId);
  if (!cp || !cpFullAccess(user, cpId)) throw notFound('Channel Partner');
  const all = (d.leads ?? []).filter((l) => l.cpId === cpId && inScope(user, l.institutionId));
  const years = [...new Set(all.map((l) => l.academicYear))].sort().reverse();
  const list = year ? all.filter((l) => l.academicYear === year) : all;
  const code = (id: string) => d.institutions.find((i) => i.id === id)?.shortCode ?? id;
  const instIds = [...new Set(list.map((l) => l.institutionId))].sort((a, b) => code(a).localeCompare(code(b)));
  return {
    partnerCode: partnerCodeOf(cp),
    sync: d.crmSync,
    years,
    totals: totalsOf(list),
    byInstitution: instIds.map((id) => ({ institutionId: id, institutionCode: code(id), ...totalsOf(list.filter((l) => l.institutionId === id)) })),
    leads: list
      .slice()
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
      .map((l) => ({ ...l, institutionCode: code(l.institutionId), effectiveStatus: effective(l).status, effectiveFeeInr: effective(l).feeInr })),
    canEdit: user.roles.includes('admin'),
  };
}

// ---------------- Admin ----------------

function assertAdmin() {
  const user = ctx();
  assertCan(user, 'config.manage', 'Only Admin can change leads and revenue.');
  return user;
}

/** Admin corrects a lead's status or fee (e.g. the CRM is behind). `null` clears the correction. */
export async function correctLead(leadId: string, correction: { status: LeadStatus; feeInr?: number; note: string } | null): Promise<void> {
  await delay('write');
  const user = assertAdmin();
  const lead = (getDb().leads ?? []).find((l) => l.id === leadId);
  if (!lead) throw notFound('Lead');
  if (correction === null) {
    if (!lead.correction) return;
    audit(user, 'update', 'lead', lead.id, `Removed the correction on lead ${lead.crmId}; the CRM's values apply again`, { status: lead.correction.status, feeInr: lead.correction.feeInr }, { status: lead.status, feeInr: lead.feeInr });
    lead.correction = undefined;
    commit();
    return;
  }
  if (!correction.note.trim() || correction.note.trim().length < 5) throw invalid('Say why the CRM value is wrong (at least 5 characters).', { note: 'Required' });
  if (correction.status === 'admitted' && !(Number(correction.feeInr) > 0)) throw invalid('Enter the fee for an admitted student.', { feeInr: 'Required for admitted' });
  if (correction.status !== 'admitted' && correction.feeInr) throw invalid('Only admitted students bring fees. Clear the fee, or set the status to Admitted.', { feeInr: 'Only for admitted' });
  const before = effective(lead);
  lead.correction = { status: correction.status, feeInr: correction.status === 'admitted' ? Number(correction.feeInr) : undefined, note: correction.note.trim(), byId: user.id, at: now() };
  audit(user, 'update', 'lead', lead.id, `Corrected lead ${lead.crmId}: ${correction.note.trim()}`, { ...before }, { status: lead.correction.status, feeInr: lead.correction.feeInr });
  commit();
}

/** Admin sets the CP's partner code in the CRM (blank = use the CP ID). */
export async function setCrmPartnerCode(cpId: string, code: string): Promise<void> {
  await delay('write');
  const user = assertAdmin();
  const d = getDb();
  const cp = d.cps.find((c) => c.id === cpId);
  if (!cp) throw notFound('Channel Partner');
  const value = code.trim().toUpperCase();
  if (value && !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(value)) throw invalid('Use 2–40 letters, digits, - or _.', { code: 'Invalid code' });
  const clash = d.cps.find((c) => c.id !== cpId && partnerCodeOf(c).toUpperCase() === (value || cpId).toUpperCase());
  if (clash) throw conflict(`${clash.legalName} already uses that CRM code.`);
  const before = partnerCodeOf(cp);
  cp.crmPartnerCode = value || undefined;
  audit(user, 'config_change', 'cp', cp.id, `Set the CRM partner code of ${cp.legalName} to ${partnerCodeOf(cp)}`, { crmPartnerCode: before }, { crmPartnerCode: partnerCodeOf(cp) });
  commit();
}

/** Admin → System: sync now. */
export async function syncCrmNow() {
  await delay('write');
  const user = assertAdmin();
  return syncCrm(user);
}

export async function crmStatus(): Promise<CrmSyncState & { leads: number }> {
  await delay();
  assertCan(ctx(), 'config.view');
  const d = getDb();
  return { ...(d.crmSync ?? { connector: connector().label }), leads: d.leads?.length ?? 0 };
}
