import type { Agreement, AgreementStatus, CpType, Deviation, RateCard, TemplateVersion, User, WizardDraft } from '@/types';
import { SLABS } from '@/types';
import { can } from '@/lib/permissions';
import { addWorkingDays, daysBetween, daysUntil, shiftDays, today } from '@/lib/dates';
import { missingFields, mergeFields, renderAgreementHtml, wordDocument, clausesFor, type MergeField } from '@/lib/agreementTemplate';
import { agreementDateErrors } from '@/lib/validation';
import { displayStatus, FINAL_STATUSES, LIVE_STATUSES, IN_PROGRESS_STATUSES } from '@/lib/status';
import type { CpFormValues } from '@/lib/schemas';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { nextId } from '../db';
import {
  assertCan,
  audit,
  closeTasks,
  commit,
  createTask,
  ctx,
  delay,
  diff,
  firstUserWithRole,
  getDb,
  inScope,
  notify,
  now,
  routeFor,
  userName,
} from './core';
import { toCpDTO, toSummary, type AgreementActions, type AgreementDetail, type AgreementSummary } from './dto';
import { upsertCp } from './cps';
import { storeDocument } from './documents';

// ---------------- Helpers ----------------

function load(id: string, user: User): Agreement {
  const a = getDb().agreements.find((x) => x.id === id);
  if (!a || !inScope(user, a.institutionId)) throw notFound('Agreement');
  return a;
}

function touch(a: Agreement) {
  a.updatedAt = now();
}

function cpName(a: Agreement) {
  return getDb().cps.find((c) => c.id === a.cpId)!.legalName;
}

function requireComment(comment: string | undefined, what = 'a comment') {
  if (!comment || comment.trim().length < 5) throw invalid(`Add ${what} (at least 5 characters).`, { comment: 'A comment is required' });
  return comment.trim();
}

/** Latest published version whose effective date has arrived. */
export function currentTemplate(cpType: CpType, institutionId: string): TemplateVersion | undefined {
  const t = today();
  const live = getDb().templates.filter((x) => x.status === 'published' && x.cpType === cpType && x.effectiveFrom <= t);
  const specific = live.filter((x) => x.institutionId === institutionId).sort((a, b) => b.version - a.version)[0];
  return specific ?? live.filter((x) => x.institutionId === null).sort((a, b) => b.version - a.version)[0];
}

export function currentRateCard(institutionId: string): RateCard | undefined {
  const t = today();
  return getDb()
    .rateCards.filter((r) => r.institutionId === institutionId && r.status === 'published' && r.effectiveFrom <= t)
    .sort((a, b) => b.version - a.version)[0];
}

function mergeContext(a: Agreement) {
  const d = getDb();
  return {
    agreement: a,
    cp: d.cps.find((c) => c.id === a.cpId)!,
    institution: d.institutions.find((i) => i.id === a.institutionId)!,
    rateCard: d.rateCards.find((r) => r.id === a.rateCardVersionId)!,
    template: d.templates.find((t) => t.id === a.templateVersionId)!,
    deviations: d.deviations.filter((x) => x.agreementId === a.id),
  };
}

const REQUIRED_KYC = ['pan', 'aadhaar_masked', 'cancelled_cheque'] as const;

export function kycGaps(cpId: string): string[] {
  const d = getDb();
  const cp = d.cps.find((c) => c.id === cpId)!;
  const docs = d.documents.filter((x) => x.ownerType === 'cp' && x.ownerId === cpId);
  const labels: Record<string, string> = { pan: 'PAN copy', aadhaar_masked: 'Masked Aadhaar', cancelled_cheque: 'Cancelled cheque', gst_certificate: 'GST certificate' };
  const need: string[] = [...REQUIRED_KYC, ...(cp.gstRegistered ? ['gst_certificate'] : [])];
  return need.filter((t) => !docs.some((x) => x.type === t)).map((t) => labels[t]!);
}

/** Everything that blocks Gate 1 submission. */
export function submissionBlockers(a: Agreement): string[] {
  const d = getDb();
  const blockers: string[] = [];
  const missing = missingFields(mergeContext(a));
  if (missing.length) blockers.push(`Missing fields: ${missing.map((m) => m.label).join(', ')}`);
  const dateErrs = Object.values(agreementDateErrors(a));
  blockers.push(...dateErrs);
  const gaps = kycGaps(a.cpId);
  if (gaps.length) blockers.push(`Missing KYC documents: ${gaps.join(', ')}`);
  if (d.deviations.some((x) => x.agreementId === a.id && x.status === 'pending')) blockers.push('A deviation is waiting for Legal review');
  if (a.override && a.override.status !== 'approved') blockers.push('The CP has a warning flag: an Admin override is required');
  if (a.executionDate && a.executionDate < today() && a.source === 'app') blockers.push('Execution date is in the past');
  return blockers;
}

function actionsFor(user: User, a: Agreement): AgreementActions {
  const d = getDb();
  const isOwnerSide = can(user, 'agreement.edit') && inScope(user, a.institutionId);
  const pendingDev = d.deviations.some((x) => x.agreementId === a.id && x.status === 'pending');
  const route = routeFor(a.institutionId, a.nonStandard);
  const renewalWindow = a.endDate ? daysUntil(a.endDate) <= d.settings.sla.renewalLeadDays : false;
  return {
    edit: a.status === 'draft' && isOwnerSide,
    submit: a.status === 'draft' && isOwnerSide,
    requestDeviation: a.status === 'draft' && can(user, 'deviation.request') && inScope(user, a.institutionId),
    decideDeviation: pendingDev && can(user, 'deviation.decide'),
    approveGate1:
      a.status === 'pending_approval' &&
      a.ownerId !== user.id &&
      ((user.roles.includes('approver') && (route?.approverId === user.id || route?.escalateToId === user.id || inScope(user, a.institutionId))) ||
        (user.roles.includes('legal') && a.nonStandard)),
    uploadSigned:
      (a.status === 'approved_for_signing' || (a.source === 'legacy' && a.status === 'signed_copy_uploaded' && !hasSignedCopy(a.id))) &&
      can(user, 'signed.upload') &&
      inScope(user, a.institutionId),
    verifyGate2: a.status === 'signed_copy_uploaded' && hasSignedCopy(a.id) && can(user, 'gate2.verify'),
    renewalDecision: a.status === 'active' && renewalWindow && !a.renewal && can(user, 'renewal.decide') && inScope(user, a.institutionId),
    confirmNonRenewal: a.renewal?.decision === 'do_not_renew' && a.renewal.confirmation === 'pending' && can(user, 'renewal.confirm') && inScope(user, a.institutionId),
    terminate: a.status === 'active' && !a.termination && can(user, 'termination.start') && inScope(user, a.institutionId),
    confirmTermination: a.termination?.confirmation === 'pending' && can(user, 'termination.confirm') && inScope(user, a.institutionId),
    decideOverride: a.override?.status === 'pending' && can(user, 'override.decide'),
    download: true,
  };
}

function hasSignedCopy(agreementId: string) {
  return getDb().documents.some((x) => x.ownerType === 'agreement' && x.ownerId === agreementId && x.type === 'signed_copy' && x.verificationStatus !== 'mismatch');
}

// ---------------- Queries ----------------

export interface AgreementFilters {
  q?: string;
  status?: string;
  institutionId?: string;
  cpType?: CpType | '';
  ownerId?: string;
  mine?: boolean;
  nonStandard?: boolean;
}

export async function listAgreements(f: AgreementFilters = {}): Promise<AgreementSummary[]> {
  await delay();
  const user = ctx();
  const q = f.q?.trim().toLowerCase();
  return getDb()
    .agreements.filter((a) => inScope(user, a.institutionId))
    .map(toSummary)
    .filter((s) => {
      if (q && !s.cpName.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q)) return false;
      if (f.status) {
        if (f.status === 'in_progress') {
          if (!IN_PROGRESS_STATUSES.includes(s.status)) return false;
        } else if (f.status === 'closed') {
          if (!FINAL_STATUSES.includes(s.status)) return false;
        } else if (s.displayStatus !== f.status && s.status !== f.status) return false;
      }
      if (f.institutionId && s.institutionId !== f.institutionId) return false;
      if (f.cpType && s.cpType !== f.cpType) return false;
      if (f.mine && s.ownerId !== user.id) return false;
      if (f.ownerId && s.ownerId !== f.ownerId) return false;
      if (f.nonStandard && !s.nonStandard) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAgreement(id: string): Promise<AgreementDetail> {
  await delay();
  const user = ctx();
  const d = getDb();
  const a = load(id, user);
  const ctxm = mergeContext(a);
  const loc = ctxm.institution.locations.find((l) => l.id === a.locationId);
  const pred = a.predecessorId ? d.agreements.find((x) => x.id === a.predecessorId) : undefined;
  const succ = a.successorId ? d.agreements.find((x) => x.id === a.successorId) : undefined;
  const devIds = new Set(ctxm.deviations.map((x) => x.id));
  const docIds = new Set(d.documents.filter((x) => x.ownerId === a.id).map((x) => x.id));
  return structuredClone({
    agreement: a,
    summary: toSummary(a),
    cp: toCpDTO(ctxm.cp),
    institution: ctxm.institution,
    locationName: loc ? `${loc.name}, ${loc.city}` : '—',
    template: ctxm.template,
    rateCard: ctxm.rateCard,
    deviations: ctxm.deviations,
    documents: d.documents.filter((x) => x.ownerType === 'agreement' && x.ownerId === a.id).reverse(),
    cpDocuments: d.documents.filter((x) => x.ownerType === 'cp' && x.ownerId === a.cpId).reverse(),
    events: d.audit.filter((e) => e.entityId === a.id || devIds.has(e.entityId) || docIds.has(e.entityId)).slice().reverse(),
    openTasks: d.tasks.filter((t) => t.agreementId === a.id && t.status === 'open').map((t) => ({ ...t, assigneeName: userName(t.assigneeId) })),
    predecessor: pred && inScope(user, pred.institutionId) ? toSummary(pred) : undefined,
    successor: succ && inScope(user, succ.institutionId) ? toSummary(succ) : undefined,
    actions: actionsFor(user, a),
    names: Object.fromEntries(d.users.map((u) => [u.id, u.name])),
  });
}

export interface RenderedDocument {
  html: string;
  fields: MergeField[];
  missing: MergeField[];
  blockers: string[];
}

/** Server-side merge: the browser receives rendered HTML, not raw CP master data. */
export async function renderDocument(id: string): Promise<RenderedDocument> {
  await delay();
  const user = ctx();
  const a = load(id, user);
  const m = mergeContext(a);
  const fields = mergeFields(m).map((f) => (f.key === 'cp.pan' && f.value ? { ...f, value: `${f.value.slice(0, 5)}••••${f.value.slice(9)}` } : f));
  return { html: renderAgreementHtml(m), fields, missing: missingFields(m), blockers: a.status === 'draft' ? submissionBlockers(a) : [] };
}

export async function downloadDocument(id: string, format: 'docx' | 'pdf'): Promise<{ fileName: string; content: string }> {
  await delay();
  const user = ctx();
  const a = load(id, user);
  const m = mergeContext(a);
  if (format === 'docx' && missingFields(m).length && a.status !== 'draft') throw conflict('Document has missing fields.');
  audit(user, 'download', 'agreement', a.id, `Downloaded ${format.toUpperCase()} of ${a.id}`);
  commit();
  return { fileName: `${a.id}_v${a.version}.${format === 'docx' ? 'doc' : 'html'}`, content: wordDocument(m) };
}

// ---------------- Wizard ----------------

export interface WizardContext {
  institutions: { id: string; name: string; shortCode: string; locations: { id: string; name: string }[]; hasTemplate: Record<CpType, boolean>; hasRateCard: boolean; signatoryName: string; signatoryDesignation: string; coordinatorName: string; city: string }[];
}

export async function wizardContext(): Promise<WizardContext> {
  await delay();
  const user = ctx();
  const d = getDb();
  return {
    institutions: d.institutions
      .filter((i) => i.active && inScope(user, i.id))
      .map((i) => ({
        id: i.id,
        name: i.legalName,
        shortCode: i.shortCode,
        city: i.city,
        locations: i.locations.map((l) => ({ id: l.id, name: `${l.name}, ${l.city}` })),
        hasTemplate: {
          sole_prop: !!currentTemplate('sole_prop', i.id),
          pvt_ltd: !!currentTemplate('pvt_ltd', i.id),
          partnership: !!currentTemplate('partnership', i.id),
          individual: !!currentTemplate('individual', i.id),
        },
        hasRateCard: !!currentRateCard(i.id),
        signatoryName: i.signatoryName,
        signatoryDesignation: i.signatoryDesignation,
        coordinatorName: i.coordinatorName,
      })),
  };
}

export async function saveWizardDraft(input: { id?: string; step: number; data: Record<string, unknown>; label: string }): Promise<WizardDraft> {
  await delay('write');
  const user = ctx();
  const d = getDb();
  let w = input.id ? d.wizardDrafts.find((x) => x.id === input.id && x.userId === user.id) : undefined;
  if (!w) {
    w = { id: nextId('wiz', 'WD-'), userId: user.id, step: input.step, data: input.data, label: input.label, updatedAt: now() };
    d.wizardDrafts.push(w);
  } else Object.assign(w, { step: input.step, data: input.data, label: input.label, updatedAt: now() });
  commit();
  return w;
}

export async function listWizardDrafts(): Promise<WizardDraft[]> {
  await delay();
  const user = ctx();
  return getDb().wizardDrafts.filter((w) => w.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getWizardDraft(id: string): Promise<WizardDraft> {
  await delay();
  const user = ctx();
  const w = getDb().wizardDrafts.find((x) => x.id === id && x.userId === user.id);
  if (!w) throw notFound('Saved draft');
  return w;
}

export async function discardWizardDraft(id: string): Promise<void> {
  await delay('write');
  const user = ctx();
  const d = getDb();
  d.wizardDrafts = d.wizardDrafts.filter((w) => !(w.id === id && w.userId === user.id));
  commit();
}

/**
 * Wizard step 3 → creates/updates the CP master and the draft agreement.
 * Enforces one active agreement per CP per institution and the warning-flag override.
 */
export async function saveCpAndDraft(input: {
  agreementId?: string;
  existingCpId?: string;
  institutionId: string;
  locationId: string;
  cp: CpFormValues;
  overrideReason?: string;
  wizardDraftId?: string;
}): Promise<{ agreementId: string; cpId: string }> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'agreement.create');
  const d = getDb();
  if (!inScope(user, input.institutionId)) throw forbidden('You are not assigned to this institution.');

  if (input.agreementId) {
    const a = load(input.agreementId, user);
    if (a.status !== 'draft') throw conflict('Only drafts can be edited.');
    upsertCp(input.cp, a.cpId);
    if (a.locationId !== input.locationId) {
      audit(user, 'update', 'agreement', a.id, 'Changed location', { locationId: a.locationId }, { locationId: input.locationId });
      a.locationId = input.locationId;
    }
    touch(a);
    commit();
    return { agreementId: a.id, cpId: a.cpId };
  }

  const existing = input.existingCpId ? d.cps.find((c) => c.id === input.existingCpId) : undefined;
  if (existing) {
    const clash = d.agreements.find(
      (a) => a.cpId === existing.id && a.institutionId === input.institutionId && (LIVE_STATUSES.includes(a.status) || IN_PROGRESS_STATUSES.includes(a.status)),
    );
    if (clash)
      throw conflict(
        LIVE_STATUSES.includes(clash.status)
          ? `This CP already has an active agreement (${clash.id}) with this institution. Use Renew on that agreement instead.`
          : `This CP already has an agreement in progress (${clash.id}) with this institution.`,
      );
  }
  const cp = upsertCp(input.cp, existing?.id);
  const template = currentTemplate(cp.type, input.institutionId);
  const rateCard = currentRateCard(input.institutionId);
  if (!template) throw conflict('There is no published template for this CP type yet. Ask Admin to publish one.');
  if (!rateCard) throw conflict('There is no published rate card for this institution yet.');
  const inst = d.institutions.find((i) => i.id === input.institutionId)!;
  const year = new Date().getFullYear();
  const id = `AGR-${inst.shortCode}-${year}-${nextId('agreement', '').padStart(4, '0')}`;
  const loc = inst.locations.find((l) => l.id === input.locationId);
  const a: Agreement = {
    id,
    version: 1,
    cpId: cp.id,
    institutionId: inst.id,
    locationId: input.locationId,
    templateVersionId: template.id,
    rateCardVersionId: rateCard.id,
    executionPlace: loc?.city ?? inst.city,
    signatoryName: inst.signatoryName,
    signatoryDesignation: inst.signatoryDesignation,
    coordinatorName: inst.coordinatorName,
    nonStandard: false,
    status: 'draft',
    source: 'app',
    ownerId: user.id,
    createdAt: now(),
    updatedAt: now(),
  };
  if (cp.warning) {
    const reason = requireComment(input.overrideReason, 'a reason for the Admin override');
    a.override = { status: 'pending', requestReason: reason, requestedById: user.id, requestedAt: now() };
  }
  d.agreements.push(a);
  audit(user, 'create', 'agreement', id, `Created draft agreement for ${cp.legalName}`, undefined, { status: 'draft', templateVersionId: template.id, rateCardVersionId: rateCard.id });
  if (a.override) {
    const admin = firstUserWithRole('admin');
    if (admin)
      createTask({ type: 'warning_override', title: `Admin override needed: ${cp.legalName}`, assigneeId: admin.id, slaDays: 2, agreementId: id, cpId: cp.id, institutionId: inst.id });
    audit(user, 'request', 'override', id, `Requested Admin override for warning-flagged CP: ${a.override.requestReason}`);
  }
  if (input.wizardDraftId) d.wizardDrafts = d.wizardDrafts.filter((w) => w.id !== input.wizardDraftId);
  commit();
  return { agreementId: id, cpId: cp.id };
}

export async function saveAgreementFields(
  id: string,
  values: Partial<Pick<Agreement, 'locationId' | 'executionDate' | 'executionPlace' | 'startDate' | 'endDate' | 'signatoryName' | 'signatoryDesignation' | 'coordinatorName'>>,
): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'agreement.edit');
  const a = load(id, user);
  if (a.status !== 'draft') throw conflict('This agreement is no longer a draft, so it cannot be edited.');
  const errs = agreementDateErrors({ ...a, ...values });
  if (Object.keys(errs).length) throw invalid('Check the agreement dates.', errs);
  const ch = diff(a, values);
  if (!ch.changed.length) return;
  Object.assign(a, values);
  touch(a);
  audit(user, 'update', 'agreement', a.id, `Updated agreement fields (${ch.changed.join(', ')})`, ch.before, ch.after);
  commit();
}

// ---------------- Gate 1 ----------------

export async function submitForApproval(id: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'agreement.edit', 'Only BD Executives can submit drafts.');
  const a = load(id, user);
  if (a.status !== 'draft') throw conflict('Only drafts can be submitted.');
  const blockers = submissionBlockers(a);
  if (blockers.length) throw invalid(`Cannot submit yet: ${blockers.join('; ')}.`);
  const d = getDb();
  const route = routeFor(a.institutionId, a.nonStandard);
  const approverId = route?.approverId ?? firstUserWithRole('approver', a.institutionId)?.id;
  if (!approverId) throw conflict('No approval routing rule is set for this institution. Ask Admin to add one.');
  const before = { status: a.status };
  a.status = 'pending_approval';
  a.submittedAt = now();
  a.lastRejection = undefined;
  touch(a);
  closeTasks({ agreementId: id, types: ['fix_rejected'] }, user);
  createTask({ type: 'gate1_approval', title: `Gate 1 approval: ${cpName(a)}`, assigneeId: approverId, slaDays: d.settings.sla.gate1Days, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
  audit(user, 'submit', 'agreement', id, `Submitted for Gate 1 approval${a.nonStandard ? ' (Non-standard)' : ''}`, before, { status: a.status });
  commit();
}

export async function decideGate1(id: string, decision: 'approve' | 'reject', comment?: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'gate1.approve');
  const a = load(id, user);
  if (a.status !== 'pending_approval') throw conflict('This agreement is not waiting for Gate 1 approval.');
  if (!actionsFor(user, a).approveGate1) throw forbidden(a.ownerId === user.id ? 'You cannot approve a draft you created.' : 'This approval is routed to someone else.');
  const d = getDb();
  const before = { status: a.status };
  closeTasks({ agreementId: id, types: ['gate1_approval'] }, user);
  if (decision === 'approve') {
    a.status = 'approved_for_signing';
    touch(a);
    createTask({ type: 'signing_upload', title: `Get signed & upload: ${cpName(a)}`, assigneeId: a.ownerId, slaDays: d.settings.sla.signingDays, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
    notify([a.ownerId], { title: 'Final agreement ready to print', body: `${cpName(a)} · ${a.id} was approved. Download the PDF and print two copies on stamp paper.`, link: `/agreements/${id}` });
    audit(user, 'approve', 'agreement', id, `Gate 1 approved${comment ? `: ${comment}` : ''}`, before, { status: a.status });
  } else {
    const c = requireComment(comment);
    a.status = 'draft';
    a.lastRejection = { gate: 1, byId: user.id, at: now(), comment: c };
    touch(a);
    createTask({ type: 'fix_rejected', title: `Rework rejected draft: ${cpName(a)}`, assigneeId: a.ownerId, slaDays: 2, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
    notify([a.ownerId], { title: 'Draft rejected at Gate 1', body: `${cpName(a)} · ${a.id} was returned with comments.`, link: `/agreements/${id}` });
    audit(user, 'reject', 'agreement', id, `Rejected at Gate 1: ${c}`, before, { status: a.status });
  }
  commit();
}

// ---------------- Deviations ----------------

export interface DeviationRequestItem {
  type: 'rate' | 'clause';
  ref: string;
  proposedValue: string;
}

export async function requestDeviation(id: string, items: DeviationRequestItem[], reason: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'deviation.request');
  const a = load(id, user);
  if (a.status !== 'draft') throw conflict('Deviations can only be requested on drafts.');
  if (!items.length) throw invalid('Change at least one rate or clause.');
  const why = requireComment(reason, 'a reason for the deviation');
  const d = getDb();
  const m = mergeContext(a);
  const clauses = clausesFor(m.institution, m.template);
  for (const it of items) {
    let label = '';
    let standard = '';
    if (it.type === 'rate') {
      const n = Number(it.proposedValue);
      if (!Number.isFinite(n) || n <= 0) throw invalid('Proposed rates must be positive amounts.');
      if (it.ref.startsWith('extra:')) {
        const ex = m.rateCard.extras.find((e) => `extra:${e.id}` === it.ref);
        if (!ex) throw invalid('Unknown rate line.');
        label = ex.label;
        standard = String(ex.amountInr);
      } else {
        const [rowId, slab] = it.ref.split(':');
        const row = m.rateCard.rows.find((r) => r.id === rowId);
        if (!row || !SLABS.includes(slab as never)) throw invalid('Unknown rate cell.');
        label = `${row.programmeGroup} · ${slab} admissions`;
        standard = String(row.slabs[slab as (typeof SLABS)[number]]);
      }
      if (String(n) === standard) continue;
    } else {
      const c = clauses.find((x) => x.id === it.ref);
      if (!c) throw invalid('Unknown clause.');
      if (it.proposedValue.trim().length < 20) throw invalid('Proposed clause text is too short.');
      label = `Clause ${clauses.indexOf(c) + 1} · ${c.title}`;
      standard = c.text(m.institution);
    }
    // Replace any open request on the same cell/clause.
    d.deviations = d.deviations.filter((x) => !(x.agreementId === id && x.ref === it.ref && x.status === 'pending'));
    const dev: Deviation = {
      id: nextId('dev', 'DEV-'),
      agreementId: id,
      type: it.type,
      ref: it.ref,
      label,
      standardValue: standard,
      proposedValue: it.type === 'rate' ? String(Number(it.proposedValue)) : it.proposedValue.trim(),
      reason: why,
      requestedById: user.id,
      requestedAt: now(),
      status: 'pending',
    };
    d.deviations.push(dev);
    audit(user, 'request', 'deviation', dev.id, `Requested ${dev.type} deviation on ${id}: ${label}`, { value: standard }, { value: dev.proposedValue });
  }
  touch(a);
  const legal = firstUserWithRole('legal', a.institutionId);
  if (legal && !d.tasks.some((t) => t.type === 'deviation_review' && t.agreementId === id && t.status === 'open'))
    createTask({ type: 'deviation_review', title: `Review deviation: ${cpName(a)}`, assigneeId: legal.id, slaDays: d.settings.sla.deviationDays, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
  commit();
}

export async function decideDeviation(devId: string, decision: 'approve' | 'reject', opts: { agreedValue?: string; comment?: string }): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'deviation.decide', 'Only Legal can decide deviations.');
  const d = getDb();
  const dev = d.deviations.find((x) => x.id === devId);
  if (!dev) throw notFound('Deviation');
  const a = load(dev.agreementId, user);
  if (dev.status !== 'pending') throw conflict('This deviation has already been decided.');
  if (a.status !== 'draft') throw conflict('The agreement is no longer a draft.');
  if (decision === 'approve') {
    const agreed = (opts.agreedValue ?? dev.proposedValue).trim();
    if (dev.type === 'rate' && !(Number(agreed) > 0)) throw invalid('Agreed rate must be a positive amount.');
    Object.assign(dev, { status: 'approved', agreedValue: dev.type === 'rate' ? String(Number(agreed)) : agreed, decidedById: user.id, decidedAt: now(), legalComment: opts.comment?.trim() });
    audit(user, 'approve', 'deviation', dev.id, `Approved deviation on ${a.id}: ${dev.label}`, { value: dev.standardValue }, { value: dev.agreedValue });
  } else {
    const c = requireComment(opts.comment);
    Object.assign(dev, { status: 'rejected', decidedById: user.id, decidedAt: now(), legalComment: c });
    audit(user, 'reject', 'deviation', dev.id, `Rejected deviation on ${a.id} — standard terms apply: ${c}`);
  }
  const wasNon = a.nonStandard;
  a.nonStandard = d.deviations.some((x) => x.agreementId === a.id && x.status === 'approved');
  if (wasNon !== a.nonStandard) audit(user, 'update', 'agreement', a.id, a.nonStandard ? 'Tagged Non-standard' : 'Returned to standard terms', { nonStandard: wasNon }, { nonStandard: a.nonStandard });
  touch(a);
  if (!d.deviations.some((x) => x.agreementId === a.id && x.status === 'pending')) {
    closeTasks({ agreementId: a.id, types: ['deviation_review'] }, user);
    notify([a.ownerId], { title: 'Deviation decided', body: `${cpName(a)} · ${a.id}: Legal has reviewed your deviation request.`, link: `/agreements/${a.id}/preview` });
  }
  commit();
}

// ---------------- Signing & Gate 2 ----------------

export async function uploadSignedCopy(
  id: string,
  input: {
    stampPaper: Agreement['stampPaper'];
    signedOn: string;
    signedById?: string;
    signedFile: Blob;
    signedFileName: string;
    stampFile: Blob;
    stampFileName: string;
    checklist: boolean[];
  },
): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'signed.upload');
  const a = load(id, user);
  const legacyScan = a.source === 'legacy' && a.status === 'signed_copy_uploaded';
  if (a.status !== 'approved_for_signing' && !legacyScan) throw conflict('This agreement is not waiting for a signed copy.');
  if (!input.checklist.every(Boolean)) throw invalid('Confirm every item on the checklist.');
  if (!input.stampPaper) throw invalid('Stamp paper details are mandatory before Gate 2.');
  if (input.signedOn > today()) throw invalid('Signing date cannot be in the future.', { signedOn: 'Cannot be in the future' });
  if (a.executionDate && input.signedOn < a.executionDate && a.source === 'app')
    throw invalid('Signing date cannot be before the execution date.', { signedOn: 'Before execution date' });
  const d = getDb();
  // Previous rejected scans are kept (retention) but superseded.
  await storeDocument(user, 'agreement', id, 'signed_copy', input.signedFile, input.signedFileName);
  await storeDocument(user, 'agreement', id, 'stamp_paper_scan', input.stampFile, input.stampFileName);
  const before = { status: a.status, stampPaper: a.stampPaper };
  a.stampPaper = input.stampPaper;
  a.signedOn = input.signedOn;
  a.signedById = input.signedById;
  a.status = 'signed_copy_uploaded';
  a.lastRejection = undefined;
  a.verification = undefined;
  touch(a);
  closeTasks({ agreementId: id, types: ['signing_upload', 'legacy_scan_upload'] }, user);
  const auditor = firstUserWithRole('audit');
  if (auditor)
    createTask({ type: 'gate2_verification', title: `Gate 2 verification${a.source === 'legacy' ? ' (Legacy)' : ''}: ${cpName(a)}`, assigneeId: auditor.id, slaDays: d.settings.sla.gate2Days, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
  audit(user, 'upload', 'agreement', id, `Uploaded signed copy and stamp paper ${input.stampPaper.number}${input.signedById ? `; signed by ${userName(input.signedById)}` : ''}`, before, { status: a.status, stampPaper: a.stampPaper });
  commit();
}

export async function decideGate2(id: string, decision: 'approve' | 'reject', checks: Agreement['verification'], comment?: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'gate2.verify', 'Only Audit can verify signed copies.');
  const a = load(id, user);
  if (a.status !== 'signed_copy_uploaded') throw conflict('This agreement is not waiting for Gate 2 verification.');
  const d = getDb();
  const entries = Object.values(checks ?? {});
  const before = { status: a.status };
  closeTasks({ agreementId: id, types: ['gate2_verification'] }, user);
  const agreementDocs = d.documents.filter((x) => x.ownerType === 'agreement' && x.ownerId === id && (x.type === 'signed_copy' || x.type === 'stamp_paper_scan') && x.verificationStatus === 'pending');
  if (decision === 'approve') {
    if (!entries.length || entries.some((e) => e.status !== 'verified')) throw invalid('Every field must be marked Verified before approving.');
    a.verification = checks;
    a.status = 'active';
    a.activatedAt = now();
    touch(a);
    const stamp = { verificationStatus: 'verified' as const, verifiedById: user.id, verifiedOn: now(), verificationMethod: 'manual' as const };
    agreementDocs.forEach((x) => Object.assign(x, stamp, { retentionUntil: shiftDays(a.endDate ?? today(), 365 * 8 + 2) }));
    d.documents.filter((x) => x.ownerType === 'cp' && x.ownerId === a.cpId && x.verificationStatus === 'pending').forEach((x) => Object.assign(x, stamp));
    const cp = d.cps.find((c) => c.id === a.cpId)!;
    cp.reverificationRequired = false;
    if (a.predecessorId) {
      const p = d.agreements.find((x) => x.id === a.predecessorId);
      if (p) p.successorId = a.id;
    }
    notify([a.ownerId], { title: 'Agreement active', body: `${cpName(a)} · ${a.id} passed Gate 2 and is now Active.`, link: `/agreements/${id}` });
    audit(user, 'approve', 'agreement', id, `Gate 2 verified — agreement Active${a.source === 'legacy' ? ' (Legacy)' : ''}`, before, { status: a.status });
  } else {
    const c = requireComment(comment);
    a.verification = checks;
    a.lastRejection = { gate: 2, byId: user.id, at: now(), comment: c };
    agreementDocs.forEach((x) => Object.assign(x, { verificationStatus: 'mismatch', verifiedById: user.id, verifiedOn: now(), verificationMethod: 'manual', remarks: c }));
    if (a.source === 'legacy') {
      createTask({ type: 'legacy_scan_upload', title: `Re-upload legacy scan: ${cpName(a)}`, assigneeId: a.ownerId, slaDays: d.settings.sla.signingDays, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
    } else {
      a.status = 'approved_for_signing';
      createTask({ type: 'signing_upload', title: `Fix & re-upload signed copy: ${cpName(a)}`, assigneeId: a.ownerId, slaDays: d.settings.sla.signingDays, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
    }
    touch(a);
    notify([a.ownerId], { title: 'Signed copy rejected at Gate 2', body: `${cpName(a)} · ${a.id} was returned by Audit with comments.`, link: `/agreements/${id}` });
    audit(user, 'reject', 'agreement', id, `Rejected at Gate 2: ${c}`, before, { status: a.status });
  }
  commit();
}

// ---------------- Renewal ----------------

export async function decideRenewal(id: string, decision: 'renew' | 'renew_with_changes' | 'do_not_renew', reason?: string): Promise<{ newAgreementId?: string }> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'renewal.decide', 'Only BD Executives make renewal decisions.');
  const a = load(id, user);
  const d = getDb();
  if (a.status !== 'active') throw conflict('Only active agreements can be renewed.');
  if (a.renewal && a.renewal.confirmation !== 'rejected') throw conflict('A renewal decision has already been made.');
  closeTasks({ agreementId: id, types: ['renewal_decision'] }, user);
  if (decision === 'do_not_renew') {
    const why = requireComment(reason, 'a reason');
    a.renewal = { decision, reason: why, decidedById: user.id, decidedAt: now(), confirmation: 'pending' };
    touch(a);
    const route = routeFor(a.institutionId, false);
    const approver = route?.approverId ?? firstUserWithRole('approver', a.institutionId)?.id;
    if (approver)
      createTask({ type: 'non_renewal_confirm', title: `Confirm "Do not renew": ${cpName(a)}`, assigneeId: approver, slaDays: d.settings.sla.gate1Days, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
    audit(user, 'renewal_decision', 'agreement', id, `Decided: Do not renew — ${why}`);
    commit();
    return {};
  }
  const cp = d.cps.find((c) => c.id === a.cpId)!;
  const template = currentTemplate(cp.type, a.institutionId);
  const rateCard = currentRateCard(a.institutionId);
  if (!template || !rateCard) throw conflict('No published template or rate card is available for the renewal.');
  const inst = d.institutions.find((i) => i.id === a.institutionId)!;
  const start = shiftDays(a.endDate!, 1);
  const term = a.startDate && a.endDate ? daysBetween(a.startDate, a.endDate) : 364;
  const newId = `AGR-${inst.shortCode}-${new Date().getFullYear()}-${nextId('agreement', '').padStart(4, '0')}`;
  const n: Agreement = {
    id: newId,
    version: 1,
    cpId: a.cpId,
    institutionId: a.institutionId,
    locationId: a.locationId,
    templateVersionId: template.id,
    rateCardVersionId: rateCard.id,
    executionPlace: a.executionPlace,
    executionDate: shiftDays(a.endDate!, -7) < today() ? today() : shiftDays(a.endDate!, -7),
    startDate: start,
    endDate: shiftDays(start, term),
    signatoryName: a.signatoryName,
    signatoryDesignation: a.signatoryDesignation,
    coordinatorName: a.coordinatorName,
    nonStandard: false,
    status: 'draft',
    predecessorId: a.id,
    source: 'app',
    ownerId: user.id,
    createdAt: now(),
    updatedAt: now(),
  };
  if (cp.warning) n.override = { status: 'pending', requestReason: 'Renewal of an existing agreement', requestedById: user.id, requestedAt: now() };
  d.agreements.push(n);
  a.renewal = { decision, decidedById: user.id, decidedAt: now(), successorId: newId };
  a.successorId = newId;
  touch(a);
  audit(user, 'renewal_decision', 'agreement', id, `Decided: ${decision === 'renew' ? 'Renew' : 'Renew with changes'} → ${newId}`);
  audit(user, 'create', 'agreement', newId, `Created renewal draft from ${a.id}`, undefined, { status: 'draft', predecessorId: a.id });
  if (n.override) {
    const admin = firstUserWithRole('admin');
    if (admin) createTask({ type: 'warning_override', title: `Admin override needed: ${cp.legalName}`, assigneeId: admin.id, slaDays: 2, agreementId: newId, cpId: cp.id, institutionId: n.institutionId });
  }
  commit();
  return { newAgreementId: newId };
}

export async function confirmNonRenewal(id: string, decision: 'confirm' | 'reject', comment?: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'renewal.confirm', 'Only Approvers confirm non-renewal.');
  const a = load(id, user);
  if (a.renewal?.decision !== 'do_not_renew' || a.renewal.confirmation !== 'pending') throw conflict('Nothing to confirm.');
  closeTasks({ agreementId: id, types: ['non_renewal_confirm'] }, user);
  if (decision === 'confirm') {
    Object.assign(a.renewal, { confirmation: 'confirmed', confirmedById: user.id, confirmedAt: now() });
    notify([a.ownerId], { title: 'Non-renewal confirmed', body: `${cpName(a)} · ${a.id} will run to expiry and then close as Not renewed.`, link: `/agreements/${id}` });
    audit(user, 'approve', 'agreement', id, 'Confirmed "Do not renew" — agreement runs to expiry');
  } else {
    const c = requireComment(comment);
    Object.assign(a.renewal, { confirmation: 'rejected', confirmedById: user.id, confirmedAt: now() });
    createTask({ type: 'renewal_decision', title: `Renewal decision (re-decide): ${cpName(a)}`, assigneeId: a.ownerId, dueDate: shiftDays(a.endDate!, -getDb().settings.sla.renewalEscalationDays) > today() ? shiftDays(a.endDate!, -getDb().settings.sla.renewalEscalationDays) : addWorkingDays(today(), 2), agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
    notify([a.ownerId], { title: 'Non-renewal not confirmed', body: `${cpName(a)} · ${a.id}: the Approver asked you to reconsider.`, link: `/agreements/${id}/renewal` });
    audit(user, 'reject', 'agreement', id, `Did not confirm "Do not renew": ${c}`);
  }
  touch(a);
  commit();
}

// ---------------- Termination ----------------

export async function startTermination(
  id: string,
  input: { type: 'convenience' | 'breach'; reason: string; noticeDate: string; effectiveDate: string; noticeFile: Blob; noticeFileName: string },
): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'termination.start');
  const a = load(id, user);
  if (a.status !== 'active') throw conflict('Only active agreements can be terminated.');
  if (a.termination && a.termination.confirmation !== 'rejected') throw conflict('A termination is already in progress.');
  if (!input.reason) throw invalid('Choose a reason.', { reason: 'Required' });
  if (input.effectiveDate < input.noticeDate) throw invalid('Effective date cannot be before the notice date.', { effectiveDate: 'Must be on or after the notice date' });
  if (!input.noticeFile) throw invalid('Upload the termination notice letter.', { notice: 'Required' });
  const { document } = await storeDocument(user, 'agreement', id, 'termination_notice', input.noticeFile, input.noticeFileName);
  a.termination = {
    type: input.type,
    reason: input.reason,
    noticeDate: input.noticeDate,
    effectiveDate: input.effectiveDate,
    noticeDocumentId: document.id,
    startedById: user.id,
    startedAt: now(),
    confirmation: 'pending',
  };
  touch(a);
  audit(user, 'terminate_start', 'agreement', id, `Started termination (${input.type}): ${input.reason}`, undefined, { noticeDate: input.noticeDate, effectiveDate: input.effectiveDate });
  const others = [a.ownerId];
  if (user.roles.includes('approver')) {
    applyTerminationConfirm(a, user);
  } else {
    const route = routeFor(a.institutionId, false);
    const approver = route?.approverId ?? firstUserWithRole('approver', a.institutionId)?.id;
    if (approver)
      createTask({ type: 'termination_confirm', title: `Confirm termination: ${cpName(a)}`, assigneeId: approver, slaDays: getDb().settings.sla.gate1Days, agreementId: id, cpId: a.cpId, institutionId: a.institutionId });
    notify(others.filter((o) => o !== user.id), { title: 'Termination started', body: `${cpName(a)} · ${a.id}: termination is waiting for Approver confirmation.`, link: `/agreements/${id}` });
  }
  commit();
}

function applyTerminationConfirm(a: Agreement, user: User) {
  const d = getDb();
  const t = a.termination!;
  Object.assign(t, { confirmation: 'confirmed', confirmedById: user.id, confirmedAt: now() });
  const before = { status: a.status };
  a.status = t.effectiveDate <= today() ? 'terminated' : 'notice_period';
  if (a.status === 'terminated') a.closedAt = now();
  closeTasks({ agreementId: a.id, types: ['renewal_decision', 'non_renewal_confirm', 'termination_confirm'] }, user, 'cancelled');
  if (t.type === 'breach') {
    const cp = d.cps.find((c) => c.id === a.cpId)!;
    const prev = cp.warning;
    cp.warning = { reason: `Agreement ${a.id} terminated for breach: ${t.reason}`, setAt: now(), setById: user.id, sourceAgreementId: a.id };
    audit(user, 'warning_flag', 'cp', cp.id, 'Warning flag set: terminated for breach (visible to all institutions)', { warning: prev?.reason ?? null }, { warning: cp.warning.reason });
  }
  notify([a.ownerId, t.startedById], { title: a.status === 'terminated' ? 'Agreement terminated' : 'Termination confirmed', body: `${cpName(a)} · ${a.id} — ${a.status === 'terminated' ? 'terminated' : 'in notice period until the effective date'}.`, link: `/agreements/${a.id}` });
  audit(user, 'terminate_confirm', 'agreement', a.id, `Termination confirmed — ${a.status === 'terminated' ? 'Terminated' : 'Notice period'}`, before, { status: a.status });
}

export async function confirmTermination(id: string, decision: 'confirm' | 'reject', comment?: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'termination.confirm', 'Only Approvers confirm terminations.');
  const a = load(id, user);
  if (a.termination?.confirmation !== 'pending') throw conflict('No termination is waiting for confirmation.');
  if (decision === 'confirm') applyTerminationConfirm(a, user);
  else {
    const c = requireComment(comment);
    Object.assign(a.termination, { confirmation: 'rejected', confirmedById: user.id, confirmedAt: now(), rejectComment: c });
    closeTasks({ agreementId: id, types: ['termination_confirm'] }, user);
    notify([a.termination.startedById], { title: 'Termination not confirmed', body: `${cpName(a)} · ${a.id}: the Approver did not confirm the termination.`, link: `/agreements/${id}` });
    audit(user, 'reject', 'agreement', id, `Termination not confirmed: ${c}`);
  }
  touch(a);
  commit();
}

// ---------------- Warning override ----------------

export async function decideOverride(id: string, decision: 'approve' | 'reject', reason: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'override.decide', 'Only Admin can override a warning flag.');
  const a = load(id, user);
  if (a.override?.status !== 'pending') throw conflict('No override is pending.');
  const why = requireComment(reason, 'a reason');
  Object.assign(a.override, { status: decision === 'approve' ? 'approved' : 'rejected', decidedById: user.id, decidedAt: now(), decisionReason: why });
  closeTasks({ agreementId: id, types: ['warning_override'] }, user);
  notify([a.ownerId], { title: decision === 'approve' ? 'Admin override granted' : 'Admin override refused', body: `${cpName(a)} · ${a.id}`, link: `/agreements/${id}` });
  audit(user, decision === 'approve' ? 'override' : 'reject', 'agreement', id, `${decision === 'approve' ? 'Granted' : 'Refused'} Admin override for warning-flagged CP: ${why}`);
  touch(a);
  commit();
}

export async function clearReviewFlag(id: string): Promise<void> {
  await delay('write');
  const user = ctx();
  const a = load(id, user);
  if (!a.reviewFlag) return;
  audit(user, 'review', 'agreement', id, `Reviewed rate-revision flag: ${a.reviewFlag.reason}`);
  a.reviewFlag = undefined;
  closeTasks({ agreementId: id, types: ['rate_review'] }, user);
  touch(a);
  commit();
}

export { displayStatus };
export type { AgreementStatus };
