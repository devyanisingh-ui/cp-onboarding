import type { Institution, MasterLists, RateCard, RoutingRule, SlaSettings, TemplateVersion, User, CpType } from '@/types';
import { SLABS } from '@/types';
import { today } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { emailSchema } from '@/lib/validation';
import { CP_TYPE_LABELS } from '@/lib/format';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { nextId } from '../db';
import { assertCan, audit, closeTasks, commit, createTask, ctx, delay, diff, firstUserWithRole, getDb, notify, now } from './core';
import { storeDocument } from './documents';
import { contentFor, validateContent } from '@/lib/templateContent';
import { docxToTemplate } from '@/lib/docxImport';
import type { TemplateContent } from '@/types';

// ---------------- Lookups (any signed-in user) ----------------

export async function lookups() {
  await delay();
  ctx();
  const d = getDb();
  return structuredClone({
    regions: d.regions,
    institutions: d.institutions,
    users: d.users.map(({ id, name, roles, designation, institutionIds, regionId, active, email, managerId }) => ({ id, name, roles, designation, institutionIds, regionId, active, email, managerId })),
    masterLists: d.masterLists,
    sla: d.settings.sla,
  });
}

// ---------------- Institutions ----------------

export async function saveInstitution(input: Institution): Promise<Institution> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'config.manage');
  const d = getDb();
  if (!input.legalName.trim() || !input.shortCode.trim()) throw invalid('Legal name and short code are required.');
  if (!/^[A-Z]{2,6}$/.test(input.shortCode)) throw invalid('Short code must be 2–6 capital letters.', { shortCode: '2–6 capital letters' });
  if (!input.locations.length) throw invalid('Add at least one location or campus.');
  if (d.institutions.some((i) => i.shortCode === input.shortCode && i.id !== input.id)) throw conflict('That short code is already used.');
  const existing = d.institutions.find((i) => i.id === input.id);
  if (existing) {
    const ch = diff(existing, input);
    Object.assign(existing, structuredClone(input));
    audit(user, 'config_change', 'institution', existing.id, `Updated institution ${existing.shortCode} (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
    commit();
    return existing;
  }
  const inst: Institution = { ...structuredClone(input), id: `inst-${input.shortCode.toLowerCase()}` };
  d.institutions.push(inst);
  audit(user, 'config_change', 'institution', inst.id, `Added institution ${inst.shortCode}`, undefined, { legalName: inst.legalName });
  commit();
  return inst;
}

// ---------------- Users ----------------

export async function saveUser(input: User): Promise<User> {
  await delay('write');
  const actor = ctx();
  assertCan(actor, 'config.manage');
  const d = getDb();
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw invalid('Enter a valid email.', { email: 'Invalid email' });
  const domain = input.email.split('@')[1]!.toLowerCase();
  if (!d.settings.allowedDomains.some((x) => domain === x || domain.endsWith(`.${x}`))) throw invalid(`${domain} is not an allowed sign-in domain.`, { email: 'Domain not allowed' });
  if (!input.roles.length) throw invalid('Assign at least one role.', { roles: 'Required' });
  if (!input.institutionIds.length) throw invalid('Assign at least one institution.', { institutionIds: 'Required' });
  if (d.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase() && u.id !== input.id)) throw conflict('A user with this email already exists.');
  const existing = d.users.find((u) => u.id === input.id);
  if (existing) {
    if (existing.id === actor.id && !input.roles.includes('admin')) throw conflict('You cannot remove your own Admin role.');
    const ch = diff(existing, input);
    Object.assign(existing, structuredClone(input));
    audit(actor, 'config_change', 'user', existing.id, `Updated user ${existing.name} (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
    commit();
    return existing;
  }
  const u: User = { ...structuredClone(input), id: nextId('user', 'u-') };
  d.users.push(u);
  audit(actor, 'config_change', 'user', u.id, `Added user ${u.name}`, undefined, { roles: u.roles, institutionIds: u.institutionIds });
  commit();
  return u;
}

// ---------------- Routing, SLAs, lists, domains ----------------

export async function listRouting(): Promise<RoutingRule[]> {
  await delay();
  assertCan(ctx(), 'config.view');
  return structuredClone(getDb().routing);
}

export async function saveRouting(rules: RoutingRule[]): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'config.manage');
  const seen = new Set<string>();
  for (const r of rules) {
    if (!r.approverId || !r.escalateToId) throw invalid('Every rule needs an approver and an escalation contact.');
    if (r.approverId === r.escalateToId) throw invalid('Escalation must go to a different person than the approver.');
    const key = `${r.institutionId}:${r.condition}`;
    if (seen.has(key)) throw invalid('Each institution can have only one rule per condition.');
    seen.add(key);
  }
  const d = getDb();
  audit(user, 'config_change', 'routing', 'routing', 'Updated approval routing rules', { rules: d.routing }, { rules });
  d.routing = rules.map((r) => ({ ...r, id: r.id || nextId('route', 'RR-') }));
  commit();
}

export async function getSettings() {
  await delay();
  assertCan(ctx(), 'config.view');
  const d = getDb();
  return structuredClone({ sla: d.settings.sla, allowedDomains: d.settings.allowedDomains, masterLists: d.masterLists, simulateErrors: d.settings.simulateErrors });
}

export async function saveSla(sla: SlaSettings): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'config.manage');
  for (const [k, v] of Object.entries(sla)) if (!Number.isInteger(v) || v < 0 || v > 120) throw invalid(`${k} must be a whole number between 0 and 120.`);
  if (sla.renewalEscalationDays >= sla.renewalLeadDays) throw invalid('Renewal escalation must be fewer days before expiry than the renewal reminder.');
  const d = getDb();
  const ch = diff(d.settings.sla, sla);
  d.settings.sla = { ...sla };
  audit(user, 'config_change', 'sla', 'sla', `Updated SLAs (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
  commit();
}

export async function saveMasterLists(lists: MasterLists): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'config.manage');
  if (!lists.terminationReasons.length || !lists.nonRenewalReasons.length) throw invalid('Reason lists cannot be empty.');
  const d = getDb();
  const ch = diff(d.masterLists, lists);
  d.masterLists = structuredClone(lists);
  audit(user, 'config_change', 'master_lists', 'master_lists', `Updated master lists (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
  commit();
}

export async function saveDomains(domains: string[]): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'config.manage');
  const clean = [...new Set(domains.map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (!clean.length) throw invalid('Keep at least one allowed domain, or nobody can sign in.');
  if (clean.some((x) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x))) throw invalid('Enter domains like apeejay.edu (no @ or spaces).');
  const d = getDb();
  audit(user, 'config_change', 'domains', 'domains', 'Updated allowed sign-in domains', { domains: d.settings.allowedDomains }, { domains: clean });
  d.settings.allowedDomains = clean;
  commit();
}

// ---------------- Rate cards (maker-checker) ----------------

export async function listRateCards(institutionId?: string): Promise<RateCard[]> {
  await delay();
  assertCan(ctx(), 'ratecard.view');
  return structuredClone(getDb().rateCards.filter((r) => !institutionId || r.institutionId === institutionId).sort((a, b) => b.version - a.version));
}

function validateRateCard(rc: Pick<RateCard, 'rows' | 'extras' | 'effectiveFrom'>) {
  if (!rc.effectiveFrom) throw invalid('Set an effective date.');
  if (!rc.rows.length) throw invalid('Add at least one programme group row.');
  for (const r of rc.rows) {
    if (!r.programmeGroup.trim()) throw invalid('Every row needs a programme group.');
    for (const s of SLABS) if (!(r.slabs[s] >= 0)) throw invalid(`${r.programmeGroup}: slab ${s} needs an amount.`);
  }
  for (const e of rc.extras) if (!e.label.trim() || !(e.amountInr >= 0)) throw invalid('Every extra needs a label and amount.');
}

export async function createRateCardDraft(institutionId: string): Promise<RateCard> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'ratecard.manage');
  const d = getDb();
  if (d.rateCards.some((r) => r.institutionId === institutionId && (r.status === 'draft' || r.status === 'pending_approval' || r.status === 'approved')))
    throw conflict('A new version is already in progress for this institution. Finish or publish it first.');
  const latest = d.rateCards.filter((r) => r.institutionId === institutionId).sort((a, b) => b.version - a.version)[0];
  const inst = d.institutions.find((i) => i.id === institutionId);
  if (!inst) throw notFound('Institution');
  const rc: RateCard = {
    id: nextId('rc', `rc-${inst.shortCode.toLowerCase()}-n`),
    institutionId,
    version: (latest?.version ?? 0) + 1,
    effectiveFrom: today(),
    status: 'draft',
    applyMode: 'new_only',
    rows: latest ? structuredClone(latest.rows) : inst.programmeGroups.map((g, i) => ({ id: `r-${i}`, programmeGroup: g, programmes: '', slabs: { '1-10': 0, '11-15': 0, '16-20': 0, '21+': 0 } })),
    extras: latest ? structuredClone(latest.extras) : [],
    createdById: user.id,
    createdAt: now(),
  };
  d.rateCards.push(rc);
  audit(user, 'create', 'rate_card', rc.id, `Created rate card ${inst.shortCode} v${rc.version} (draft)`);
  commit();
  return rc;
}

export async function saveRateCardDraft(input: RateCard): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'ratecard.manage');
  const rc = getDb().rateCards.find((r) => r.id === input.id);
  if (!rc) throw notFound('Rate card');
  if (rc.status !== 'draft') throw conflict('Only draft versions can be edited. Published versions are never changed.');
  validateRateCard(input);
  const ch = diff(rc, { rows: input.rows, extras: input.extras, effectiveFrom: input.effectiveFrom, applyMode: input.applyMode, notes: input.notes });
  Object.assign(rc, { rows: structuredClone(input.rows), extras: structuredClone(input.extras), effectiveFrom: input.effectiveFrom, applyMode: input.applyMode, notes: input.notes });
  audit(user, 'update', 'rate_card', rc.id, `Edited rate card v${rc.version} (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
  commit();
}

export async function submitRateCard(id: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'ratecard.manage');
  const d = getDb();
  const rc = d.rateCards.find((r) => r.id === id);
  if (!rc || rc.status !== 'draft') throw conflict('Only drafts can be sent to Legal.');
  validateRateCard(rc);
  rc.status = 'pending_approval';
  rc.rejectComment = undefined;
  const inst = d.institutions.find((i) => i.id === rc.institutionId)!;
  const legal = firstUserWithRole('legal');
  if (legal) createTask({ type: 'rate_card_approval', title: `Approve rate card: ${inst.shortCode} v${rc.version}`, assigneeId: legal.id, slaDays: d.settings.sla.versionApprovalDays, refId: rc.id, institutionId: rc.institutionId });
  audit(user, 'submit', 'rate_card', rc.id, `Sent rate card ${inst.shortCode} v${rc.version} to Legal`, { status: 'draft' }, { status: rc.status });
  commit();
}

export async function decideRateCard(id: string, decision: 'approve' | 'reject', comment?: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'ratecard.approve', 'Only Legal approves rate card versions.');
  const d = getDb();
  const rc = d.rateCards.find((r) => r.id === id);
  if (!rc || rc.status !== 'pending_approval') throw conflict('This version is not waiting for approval.');
  if (rc.createdById === user.id) throw forbidden('Maker-checker: you cannot approve a version you created.');
  if (decision === 'reject' && (!comment || comment.trim().length < 5)) throw invalid('Add a comment explaining the rejection.');
  const inst = d.institutions.find((i) => i.id === rc.institutionId)!;
  closeTasks({ refId: id, types: ['rate_card_approval'] }, user);
  if (decision === 'approve') {
    Object.assign(rc, { status: 'approved', approvedById: user.id, approvedAt: now() });
    notify([rc.createdById], { title: 'Rate card approved by Legal', body: `${inst.shortCode} v${rc.version} can now be published.`, link: `/admin/rate-cards?id=${rc.id}` });
  } else {
    Object.assign(rc, { status: 'draft', rejectComment: comment!.trim() });
    notify([rc.createdById], { title: 'Rate card returned by Legal', body: `${inst.shortCode} v${rc.version} needs changes.`, link: `/admin/rate-cards?id=${rc.id}` });
  }
  audit(user, decision, 'rate_card', rc.id, `${decision === 'approve' ? 'Approved' : 'Returned'} rate card ${inst.shortCode} v${rc.version}${comment ? `: ${comment}` : ''}`, { status: 'pending_approval' }, { status: rc.status });
  commit();
}

/** PRD §6.3: publish after Legal approval; active agreements with rate deviations are flagged, never changed. */
export async function publishRateCard(id: string): Promise<{ flagged: number; affected: number }> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'ratecard.manage');
  const d = getDb();
  const rc = d.rateCards.find((r) => r.id === id);
  if (!rc) throw notFound('Rate card');
  if (rc.status !== 'approved') throw conflict('Maker-checker: Legal must approve this version before it can be published.');
  const inst = d.institutions.find((i) => i.id === rc.institutionId)!;
  Object.assign(rc, { status: 'published', publishedById: user.id, publishedAt: now() });
  if (rc.effectiveFrom <= today()) retireSupersededRateCards(rc.institutionId);
  const active = d.agreements.filter((a) => a.institutionId === rc.institutionId && (a.status === 'active' || a.status === 'notice_period'));
  rc.affectedAgreementIds = rc.applyMode === 'addendums' ? active.map((a) => a.id) : [];
  let flagged = 0;
  for (const a of active) {
    const hasRateDev = d.deviations.some((x) => x.agreementId === a.id && x.type === 'rate' && x.status === 'approved');
    if (!hasRateDev) continue;
    a.reviewFlag = { reason: `Rate card ${inst.shortCode} v${rc.version} published; this agreement has rate deviations. Review whether they still apply.`, at: now() };
    flagged++;
    createTask({ type: 'rate_review', title: `Review deviation after rate revision: ${d.cps.find((c) => c.id === a.cpId)!.legalName}`, assigneeId: a.ownerId, slaDays: 5, agreementId: a.id, cpId: a.cpId, institutionId: a.institutionId });
  }
  audit(user, 'publish', 'rate_card', rc.id, `Published rate card ${inst.shortCode} v${rc.version} (${rc.applyMode === 'new_only' ? 'new agreements only' : 'addendums to existing CPs'}); ${flagged} agreement(s) flagged for review`, { status: 'approved' }, { status: 'published' });
  commit();
  return { flagged, affected: rc.affectedAgreementIds.length };
}

export function retireSupersededRateCards(institutionId: string) {
  const t = today();
  const live = getDb().rateCards.filter((r) => r.institutionId === institutionId && r.status === 'published' && r.effectiveFrom <= t).sort((a, b) => b.version - a.version);
  for (const old of live.slice(1)) {
    old.status = 'retired';
    audit('system', 'retire', 'rate_card', old.id, `Retired rate card v${old.version} (superseded by v${live[0]!.version})`);
  }
}

// ---------------- Templates (maker-checker) ----------------

export async function listTemplates(): Promise<TemplateVersion[]> {
  await delay();
  assertCan(ctx(), 'template.view');
  return structuredClone(getDb().templates.slice().sort((a, b) => a.cpType.localeCompare(b.cpType) || b.version - a.version));
}

/**
 * Upload an existing agreement as a Word document: its text is imported into a new draft version
 * (clauses, preamble, signatures, annexure and recognised merge fields), which the admin then edits
 * in the template editor and sends to Legal like any other draft. The file is kept for reference.
 */
export async function uploadTemplate(input: { cpType: CpType; institutionId: string | null; effectiveFrom: string; changeNote: string; file: Blob; fileName: string }): Promise<{ template: TemplateVersion; notes: string[] }> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'template.manage');
  if (!/\.docx$/i.test(input.fileName)) throw invalid('Upload the agreement as a Word (.docx) file. Save older .doc files as .docx first.');
  const d = getDb();
  const open = inProgress(input.cpType, input.institutionId);
  if (open && open.status === 'draft') {
    // A draft for this template already exists: put the uploaded text into it instead of refusing.
    const res = await importInto(user, open, input.file, input.fileName);
    if (input.changeNote.trim()) open.changeNote = input.changeNote.trim();
    commit();
    return { template: structuredClone(open), notes: [`Your existing draft v${open.version} was updated with this document.`, ...res.notes] };
  }
  if (open)
    throw conflict(
      `${CP_TYPE_LABELS[input.cpType]} v${open.version} is ${open.status === 'pending_approval' ? 'waiting for Legal' : 'approved and waiting to be published'}. ${open.status === 'pending_approval' ? 'Open it and use “Withdraw & discard”, then upload again.' : 'Publish it first, then upload the new version.'}`,
    );
  const imported = await readDocx(input.file);
  const same = d.templates.filter((t) => t.cpType === input.cpType && t.institutionId === input.institutionId);
  const version = Math.max(0, ...same.map((t) => t.version)) + 1;
  const tpl: TemplateVersion = {
    id: nextId('tpl', 'tpl-n'),
    content: imported.content,
    cpType: input.cpType,
    institutionId: input.institutionId,
    version,
    fileName: input.fileName,
    effectiveFrom: input.effectiveFrom || today(),
    status: 'draft',
    changeNote: input.changeNote.trim(),
    uploadedById: user.id,
    uploadedAt: now(),
  };
  const { document } = await storeDocument(user, 'template', tpl.id, 'template_docx', input.file, input.fileName);
  tpl.blobKey = document.blobKey;
  tpl.sourceDocumentId = document.id;
  d.templates.push(tpl);
  audit(user, 'create', 'template', tpl.id, `Imported ${input.fileName} as template ${CP_TYPE_LABELS[tpl.cpType]} v${version} (draft)`);
  commit();
  return { template: structuredClone(tpl), notes: imported.notes };
}

/** Replace a draft's body with the text of an uploaded Word document. */
export async function importTemplateDocx(id: string, file: Blob, fileName: string): Promise<{ template: TemplateVersion; notes: string[] }> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'template.manage');
  const t = getDb().templates.find((x) => x.id === id);
  if (!t) throw notFound('Template');
  if (t.status !== 'draft') throw conflict('Only draft versions can be replaced. Approved and published versions are never changed.');
  if (!/\.docx$/i.test(fileName)) throw invalid('Upload the agreement as a Word (.docx) file.');
  const res = await importInto(user, t, file, fileName);
  commit();
  return { template: structuredClone(t), notes: res.notes };
}

async function importInto(user: User, t: TemplateVersion, file: Blob, fileName: string) {
  const imported = await readDocx(file);
  const before = { blocks: contentFor(t).blocks.length, fileName: t.fileName };
  const { document } = await storeDocument(user, 'template', t.id, 'template_docx', file, fileName);
  Object.assign(t, { content: imported.content, fileName, blobKey: document.blobKey, sourceDocumentId: document.id });
  audit(user, 'update', 'template', t.id, `Imported ${fileName} into template ${CP_TYPE_LABELS[t.cpType]} v${t.version}`, before, { blocks: imported.content.blocks.length, fileName });
  return imported;
}

async function readDocx(file: Blob) {
  try {
    return await docxToTemplate(file);
  } catch (e) {
    throw invalid((e as Error).message || 'Could not read this Word document.');
  }
}

export async function decideTemplate(id: string, decision: 'approve' | 'reject', comment?: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'template.approve', 'Only Legal approves templates.');
  const d = getDb();
  const t = d.templates.find((x) => x.id === id);
  if (!t || t.status !== 'pending_approval') throw conflict('This template is not waiting for approval.');
  if (t.uploadedById === user.id) throw forbidden('Maker-checker: you cannot approve a template you uploaded.');
  if (decision === 'reject' && (!comment || comment.trim().length < 5)) throw invalid('Add a comment explaining the rejection.');
  closeTasks({ refId: id, types: ['template_approval'] }, user);
  Object.assign(t, decision === 'approve' ? { status: 'approved', approvedById: user.id, approvedAt: now() } : { status: 'draft', rejectComment: comment!.trim() });
  notify([t.uploadedById], { title: decision === 'approve' ? 'Template approved by Legal' : 'Template returned by Legal', body: `${CP_TYPE_LABELS[t.cpType]} v${t.version}`, link: `/admin/templates?id=${t.id}` });
  audit(user, decision, 'template', t.id, `${decision === 'approve' ? 'Legal approved' : 'Legal rejected'} template ${CP_TYPE_LABELS[t.cpType]} v${t.version}${comment ? `: ${comment}` : ''}`, { status: 'pending_approval' }, { status: t.status });
  commit();
}

export async function publishTemplate(id: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'template.manage');
  const d = getDb();
  const t = d.templates.find((x) => x.id === id);
  if (!t) throw notFound('Template');
  if (t.status !== 'approved') throw conflict('Maker-checker: Legal must approve this template before it can be published.');
  Object.assign(t, { status: 'published', publishedById: user.id, publishedAt: now() });
  if (t.effectiveFrom <= today()) {
    for (const old of d.templates.filter((x) => x.id !== t.id && x.cpType === t.cpType && x.institutionId === t.institutionId && x.status === 'published' && x.version < t.version)) {
      old.status = 'retired';
      audit('system', 'retire', 'template', old.id, `Retired template v${old.version} (superseded by v${t.version})`);
    }
  }
  audit(user, 'publish', 'template', t.id, `Published template ${CP_TYPE_LABELS[t.cpType]} v${t.version}; existing agreements keep their template version`, { status: 'approved' }, { status: 'published' });
  commit();
}

/** Latest version for this CP type and scope (falls back to the all-institutions version). */
function baseTemplate(cpType: CpType, institutionId: string | null): Pick<TemplateVersion, 'content' | 'cpType'> {
  const all = getDb().templates.filter((t) => t.cpType === cpType && t.status !== 'retired');
  const pick = (scope: string | null) => all.filter((t) => t.institutionId === scope).sort((a, b) => b.version - a.version)[0];
  return pick(institutionId) ?? pick(null) ?? { cpType };
}

function inProgress(cpType: CpType, institutionId: string | null) {
  return getDb().templates.find((t) => t.cpType === cpType && t.institutionId === institutionId && (t.status === 'draft' || t.status === 'pending_approval' || t.status === 'approved'));
}

export async function getTemplate(id: string): Promise<TemplateVersion> {
  await delay();
  assertCan(ctx(), 'template.view');
  const t = getDb().templates.find((x) => x.id === id);
  if (!t) throw notFound('Template');
  // Older versions have no stored body; hand back the built-in default so it can be viewed or copied.
  return structuredClone({ ...t, content: contentFor(t) });
}

/** Starts a new draft version in the template editor, copying the latest version's body. */
export async function createTemplateDraft(cpType: CpType, institutionId: string | null): Promise<TemplateVersion> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'template.manage');
  const d = getDb();
  const open = inProgress(cpType, institutionId);
  if (open) throw conflict(`${CP_TYPE_LABELS[cpType]} v${open.version} is already in progress. Finish, send or discard it first.`);
  const same = d.templates.filter((t) => t.cpType === cpType && t.institutionId === institutionId);
  const version = Math.max(0, ...same.map((t) => t.version)) + 1;
  const tpl: TemplateVersion = {
    id: nextId('tpl', 'tpl-n'),
    cpType,
    institutionId,
    version,
    fileName: `CP_Agreement_${cpType}_v${version} (editor)`,
    effectiveFrom: today(),
    status: 'draft',
    changeNote: '',
    uploadedById: user.id,
    uploadedAt: now(),
    content: structuredClone(contentFor(baseTemplate(cpType, institutionId))),
  };
  d.templates.push(tpl);
  audit(user, 'create', 'template', tpl.id, `Started template ${CP_TYPE_LABELS[cpType]} v${version} in the editor`);
  commit();
  return structuredClone(tpl);
}

export async function saveTemplateDraft(id: string, input: { content: TemplateContent; changeNote: string; effectiveFrom: string }): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'template.manage');
  const t = getDb().templates.find((x) => x.id === id);
  if (!t) throw notFound('Template');
  if (t.status !== 'draft') throw conflict('Only draft versions can be edited. Approved and published versions are never changed.');
  const issues = validateContent(input.content, t.cpType);
  if (issues.errors.length) throw invalid(issues.errors[0]!);
  if (!input.effectiveFrom) throw invalid('Set an effective date.');
  const before = { blocks: contentFor(t).blocks.length, changeNote: t.changeNote, effectiveFrom: t.effectiveFrom };
  Object.assign(t, { content: structuredClone(input.content), changeNote: input.changeNote.trim(), effectiveFrom: input.effectiveFrom });
  audit(user, 'update', 'template', t.id, `Edited template ${CP_TYPE_LABELS[t.cpType]} v${t.version} in the editor`, before, { blocks: input.content.blocks.length, changeNote: t.changeNote, effectiveFrom: t.effectiveFrom });
  commit();
}

export async function submitTemplate(id: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'template.manage');
  const d = getDb();
  const t = d.templates.find((x) => x.id === id);
  if (!t || t.status !== 'draft') throw conflict('Only drafts can be sent to Legal.');
  const issues = validateContent(contentFor(t), t.cpType);
  if (issues.errors.length) throw invalid(issues.errors[0]!);
  if (!t.changeNote.trim()) throw invalid('Describe what changed in this version before sending it to Legal.');
  t.status = 'pending_approval';
  t.rejectComment = undefined;
  const legal = firstUserWithRole('legal');
  if (legal) createTask({ type: 'template_approval', title: `Approve template: ${CP_TYPE_LABELS[t.cpType]} v${t.version}`, assigneeId: legal.id, slaDays: d.settings.sla.versionApprovalDays, refId: t.id });
  audit(user, 'submit', 'template', t.id, `Sent template ${CP_TYPE_LABELS[t.cpType]} v${t.version} to Legal`, { status: 'draft' }, { status: 'pending_approval' });
  commit();
}

/**
 * Discard a version that was never approved or used: a draft, or one waiting for Legal (which is
 * withdrawn from Legal first). Discarding one that is already gone is a no-op.
 */
export async function discardTemplateDraft(id: string): Promise<void> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'template.manage');
  const d = getDb();
  const t = d.templates.find((x) => x.id === id);
  if (!t) return; // already discarded (e.g. a second click or another tab)
  if (t.status !== 'draft' && t.status !== 'pending_approval')
    throw conflict(t.status === 'approved' ? 'Legal has approved this version, so it can’t be discarded. Publish it, or start a new version.' : 'Published and retired versions are kept for history and can’t be discarded.');
  if (t.approvedById || d.agreements.some((a) => a.templateVersionId === id)) throw conflict('This version has history and cannot be discarded.');
  const withdrawn = t.status === 'pending_approval';
  if (withdrawn) closeTasks({ refId: id, types: ['template_approval'] }, user, 'cancelled');
  d.templates = d.templates.filter((x) => x.id !== id);
  audit(user, 'delete', 'template', id, `${withdrawn ? 'Withdrew from Legal and discarded' : 'Discarded draft'} template ${CP_TYPE_LABELS[t.cpType]} v${t.version}`);
  commit();
}

export function canManage(u: User) {
  return can(u, 'config.manage');
}
