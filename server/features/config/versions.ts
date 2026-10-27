import type { CpType, RateCard, TemplateContent, TemplateVersion, VersionStatus } from '@/types';
import { SLABS } from '@/types';
import { today } from '@/lib/dates';
import { CP_TYPE_LABELS } from '@/lib/format';
import { contentFor, validateContent } from '@/lib/templateContent';
import { conflict, forbidden, invalid, notFound } from '@/services/errors';
import { audit, diff } from '../../platform/audit';
import { ctx, db, now } from '../../platform/context';
import { nextId } from '../../platform/ids';
import { notify } from '../../platform/notify';
import { assertCan } from '../../platform/permissions';
import { closeTasks, createTask } from '../../platform/tasks';
import { isTemplateInUse, runRateCardPublished } from './hooks';
import { json, toRateCard, toTemplate } from './mappers';
import { firstUserWithRole, getInstitution, settings } from './settings';

/**
 * Moves a version from one status to the next only if it is still in the expected status, so two
 * people acting on the same version at once cannot both succeed.
 */
async function transition(table: 'rateCard' | 'templateVersion', id: string, from: VersionStatus[], data: Record<string, unknown>, message: string) {
  const delegate = db()[table] as unknown as { updateMany(a: { where: object; data: object }): Promise<{ count: number }> };
  const { count } = await delegate.updateMany({ where: { id, status: { in: from } }, data });
  if (count === 0) throw conflict(message);
}

// ---------------- Rate cards (maker-checker) ----------------

async function rateCard(id: string): Promise<RateCard | undefined> {
  const row = await db().rateCard.findUnique({ where: { id } });
  return row ? toRateCard(row) : undefined;
}

export async function listRateCards(institutionId?: string): Promise<RateCard[]> {
  assertCan(ctx(), 'ratecard.view');
  const rows = await db().rateCard.findMany({ where: institutionId ? { institutionId } : {}, orderBy: [{ version: 'desc' }, { institutionId: 'asc' }] });
  return rows.map(toRateCard);
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
  const user = ctx();
  assertCan(user, 'ratecard.manage');
  const inst = await getInstitution(institutionId);
  if (!inst) throw notFound('Institution');
  // Lock the institution row so two Admins cannot both start a version at the same moment.
  await db().$queryRaw`SELECT id FROM Institution WHERE id = ${institutionId} FOR UPDATE`;
  const open = await db().rateCard.findFirst({ where: { institutionId, status: { in: ['draft', 'pending_approval', 'approved'] } } });
  if (open) throw conflict('A new version is already in progress for this institution. Finish or publish it first.');
  const latestRow = await db().rateCard.findFirst({ where: { institutionId }, orderBy: { version: 'desc' } });
  const latest = latestRow ? toRateCard(latestRow) : undefined;
  const row = await db().rateCard.create({
    data: {
      id: await nextId('rc', `rc-${inst.shortCode.toLowerCase()}-n`),
      institutionId,
      version: (latest?.version ?? 0) + 1,
      effectiveFrom: today(),
      status: 'draft',
      applyMode: 'new_only',
      rows: json(latest ? latest.rows : inst.programmeGroups.map((g, i) => ({ id: `r-${i}`, programmeGroup: g, programmes: '', slabs: { '1-10': 0, '11-15': 0, '16-20': 0, '21+': 0 } }))),
      extras: json(latest ? latest.extras : []),
      createdById: user.id,
    },
  });
  const rc = toRateCard(row);
  await audit(user, 'create', 'rate_card', rc.id, `Created rate card ${inst.shortCode} v${rc.version} (draft)`);
  return rc;
}

export async function saveRateCardDraft(input: RateCard): Promise<void> {
  const user = ctx();
  assertCan(user, 'ratecard.manage');
  const rc = await rateCard(input.id);
  if (!rc) throw notFound('Rate card');
  if (rc.status !== 'draft') throw conflict('Only draft versions can be edited. Published versions are never changed.');
  validateRateCard(input);
  const next = { rows: input.rows, extras: input.extras, effectiveFrom: input.effectiveFrom, applyMode: input.applyMode, notes: input.notes };
  const ch = diff(rc, next);
  await transition('rateCard', rc.id, ['draft'], { rows: json(input.rows), extras: json(input.extras), effectiveFrom: input.effectiveFrom, applyMode: input.applyMode, notes: input.notes ?? null }, 'Only draft versions can be edited. Published versions are never changed.');
  await audit(user, 'update', 'rate_card', rc.id, `Edited rate card v${rc.version} (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
}

export async function submitRateCard(id: string): Promise<void> {
  const user = ctx();
  assertCan(user, 'ratecard.manage');
  const rc = await rateCard(id);
  if (!rc || rc.status !== 'draft') throw conflict('Only drafts can be sent to Legal.');
  validateRateCard(rc);
  await transition('rateCard', id, ['draft'], { status: 'pending_approval', rejectComment: null }, 'Only drafts can be sent to Legal.');
  const inst = (await getInstitution(rc.institutionId))!;
  const legal = await firstUserWithRole('legal');
  if (legal) await createTask({ type: 'rate_card_approval', title: `Approve rate card: ${inst.shortCode} v${rc.version}`, assigneeId: legal.id, slaDays: (await settings()).sla.versionApprovalDays, refId: rc.id, institutionId: rc.institutionId });
  await audit(user, 'submit', 'rate_card', rc.id, `Sent rate card ${inst.shortCode} v${rc.version} to Legal`, { status: 'draft' }, { status: 'pending_approval' });
}

export async function decideRateCard(id: string, decision: 'approve' | 'reject', comment?: string): Promise<void> {
  const user = ctx();
  assertCan(user, 'ratecard.approve', 'Only Legal approves rate card versions.');
  const rc = await rateCard(id);
  if (!rc || rc.status !== 'pending_approval') throw conflict('This version is not waiting for approval.');
  if (rc.createdById === user.id) throw forbidden('Maker-checker: you cannot approve a version you created.');
  if (decision === 'reject' && (!comment || comment.trim().length < 5)) throw invalid('Add a comment explaining the rejection.');
  const inst = (await getInstitution(rc.institutionId))!;
  const status = decision === 'approve' ? 'approved' : 'draft';
  await transition('rateCard', id, ['pending_approval'], decision === 'approve' ? { status, approvedById: user.id, approvedAt: now() } : { status, rejectComment: comment!.trim() }, 'This version is not waiting for approval.');
  await closeTasks({ refId: id, types: ['rate_card_approval'] }, user);
  await notify([rc.createdById], {
    title: decision === 'approve' ? 'Rate card approved by Legal' : 'Rate card returned by Legal',
    body: decision === 'approve' ? `${inst.shortCode} v${rc.version} can now be published.` : `${inst.shortCode} v${rc.version} needs changes.`,
    link: `/admin/rate-cards?id=${rc.id}`,
  });
  await audit(user, decision, 'rate_card', rc.id, `${decision === 'approve' ? 'Approved' : 'Returned'} rate card ${inst.shortCode} v${rc.version}${comment ? `: ${comment}` : ''}`, { status: 'pending_approval' }, { status });
}

/** PRD §6.3: publish after Legal approval; active agreements with rate deviations are flagged, never changed. */
export async function publishRateCard(id: string): Promise<{ flagged: number; affected: number }> {
  const user = ctx();
  assertCan(user, 'ratecard.manage');
  const rc = await rateCard(id);
  if (!rc) throw notFound('Rate card');
  if (rc.status !== 'approved') throw conflict('Maker-checker: Legal must approve this version before it can be published.');
  const inst = (await getInstitution(rc.institutionId))!;
  await transition('rateCard', id, ['approved'], { status: 'published', publishedById: user.id, publishedAt: now() }, 'Maker-checker: Legal must approve this version before it can be published.');
  if (rc.effectiveFrom <= today()) await retireSupersededRateCards(rc.institutionId);
  const published = (await rateCard(id))!;
  const { flagged, activeAgreementIds } = await runRateCardPublished(published, inst);
  const affected = rc.applyMode === 'addendums' ? activeAgreementIds : [];
  await db().rateCard.update({ where: { id }, data: { affectedAgreementIds: json(affected) } });
  await audit(user, 'publish', 'rate_card', rc.id, `Published rate card ${inst.shortCode} v${rc.version} (${rc.applyMode === 'new_only' ? 'new agreements only' : 'addendums to existing CPs'}); ${flagged} agreement(s) flagged for review`, { status: 'approved' }, { status: 'published' });
  return { flagged, affected: affected.length };
}

/** Published versions already in force are retired when a newer one takes effect (also run by the scheduler). */
export async function retireSupersededRateCards(institutionId: string): Promise<void> {
  const live = await db().rateCard.findMany({ where: { institutionId, status: 'published', effectiveFrom: { lte: today() } }, orderBy: { version: 'desc' } });
  for (const old of live.slice(1)) {
    await db().rateCard.update({ where: { id: old.id }, data: { status: 'retired' } });
    await audit('system', 'retire', 'rate_card', old.id, `Retired rate card v${old.version} (superseded by v${live[0]!.version})`);
  }
}

// ---------------- Templates (maker-checker) ----------------

async function template(id: string): Promise<TemplateVersion | undefined> {
  const row = await db().templateVersion.findUnique({ where: { id } });
  return row ? toTemplate(row) : undefined;
}

export async function listTemplates(): Promise<TemplateVersion[]> {
  assertCan(ctx(), 'template.view');
  const rows = await db().templateVersion.findMany({ orderBy: [{ cpType: 'asc' }, { version: 'desc' }] });
  // Same order as the mock: by CP type label key, newest version first.
  return rows.map(toTemplate).sort((a, b) => a.cpType.localeCompare(b.cpType) || b.version - a.version);
}

export async function getTemplate(id: string): Promise<TemplateVersion> {
  assertCan(ctx(), 'template.view');
  const t = await template(id);
  if (!t) throw notFound('Template');
  // Older versions have no stored body; hand back the built-in default so it can be viewed or copied.
  return { ...t, content: contentFor(t) };
}

/** Latest version for this CP type and scope (falls back to the all-institutions version). */
async function baseTemplate(cpType: CpType, institutionId: string | null): Promise<Pick<TemplateVersion, 'content' | 'cpType'>> {
  const all = (await db().templateVersion.findMany({ where: { cpType, status: { not: 'retired' } } })).map(toTemplate);
  const pick = (scope: string | null) => all.filter((t) => t.institutionId === scope).sort((a, b) => b.version - a.version)[0];
  return pick(institutionId) ?? pick(null) ?? { cpType };
}

async function inProgress(cpType: CpType, institutionId: string | null) {
  const row = await db().templateVersion.findFirst({ where: { cpType, institutionId, status: { in: ['draft', 'pending_approval', 'approved'] } } });
  return row ? toTemplate(row) : undefined;
}

async function nextTemplateVersion(cpType: CpType, institutionId: string | null) {
  const latest = await db().templateVersion.findFirst({ where: { cpType, institutionId }, orderBy: { version: 'desc' } });
  return (latest?.version ?? 0) + 1;
}

/** Starts a new draft version in the template editor, copying the latest version's body. */
export async function createTemplateDraft(cpType: CpType, institutionId: string | null): Promise<TemplateVersion> {
  const user = ctx();
  assertCan(user, 'template.manage');
  // One draft at a time per template: serialise on a per-template counter row.
  await nextId(`tpl-lock:${cpType}:${institutionId ?? 'all'}`, '');
  const open = await inProgress(cpType, institutionId);
  if (open) throw conflict(`${CP_TYPE_LABELS[cpType]} v${open.version} is already in progress. Finish, send or discard it first.`);
  const version = await nextTemplateVersion(cpType, institutionId);
  const row = await db().templateVersion.create({
    data: {
      id: await nextId('tpl', 'tpl-n'),
      cpType,
      institutionId,
      version,
      fileName: `CP_Agreement_${cpType}_v${version} (editor)`,
      effectiveFrom: today(),
      status: 'draft',
      changeNote: '',
      uploadedById: user.id,
      content: json(contentFor(await baseTemplate(cpType, institutionId))),
    },
  });
  const tpl = toTemplate(row);
  await audit(user, 'create', 'template', tpl.id, `Started template ${CP_TYPE_LABELS[cpType]} v${version} in the editor`);
  return tpl;
}

export async function saveTemplateDraft(id: string, input: { content: TemplateContent; changeNote: string; effectiveFrom: string }): Promise<void> {
  const user = ctx();
  assertCan(user, 'template.manage');
  const t = await template(id);
  if (!t) throw notFound('Template');
  if (t.status !== 'draft') throw conflict('Only draft versions can be edited. Approved and published versions are never changed.');
  const issues = validateContent(input.content, t.cpType);
  if (issues.errors.length) throw invalid(issues.errors[0]!);
  if (!input.effectiveFrom) throw invalid('Set an effective date.');
  const before = { blocks: contentFor(t).blocks.length, changeNote: t.changeNote, effectiveFrom: t.effectiveFrom };
  await transition('templateVersion', id, ['draft'], { content: json(input.content), changeNote: input.changeNote.trim(), effectiveFrom: input.effectiveFrom }, 'Only draft versions can be edited. Approved and published versions are never changed.');
  await audit(user, 'update', 'template', t.id, `Edited template ${CP_TYPE_LABELS[t.cpType]} v${t.version} in the editor`, before, { blocks: input.content.blocks.length, changeNote: input.changeNote.trim(), effectiveFrom: input.effectiveFrom });
}

export async function submitTemplate(id: string): Promise<void> {
  const user = ctx();
  assertCan(user, 'template.manage');
  const t = await template(id);
  if (!t || t.status !== 'draft') throw conflict('Only drafts can be sent to Legal.');
  const issues = validateContent(contentFor(t), t.cpType);
  if (issues.errors.length) throw invalid(issues.errors[0]!);
  if (!t.changeNote.trim()) throw invalid('Describe what changed in this version before sending it to Legal.');
  await transition('templateVersion', id, ['draft'], { status: 'pending_approval', rejectComment: null }, 'Only drafts can be sent to Legal.');
  const legal = await firstUserWithRole('legal');
  if (legal) await createTask({ type: 'template_approval', title: `Approve template: ${CP_TYPE_LABELS[t.cpType]} v${t.version}`, assigneeId: legal.id, slaDays: (await settings()).sla.versionApprovalDays, refId: t.id });
  await audit(user, 'submit', 'template', t.id, `Sent template ${CP_TYPE_LABELS[t.cpType]} v${t.version} to Legal`, { status: 'draft' }, { status: 'pending_approval' });
}

/**
 * Discard a version that was never approved or used: a draft, or one waiting for Legal (which is
 * withdrawn from Legal first). Discarding one that is already gone is a no-op.
 */
export async function discardTemplateDraft(id: string): Promise<void> {
  const user = ctx();
  assertCan(user, 'template.manage');
  const t = await template(id);
  if (!t) return; // already discarded (e.g. a second click or another tab)
  if (t.status !== 'draft' && t.status !== 'pending_approval')
    throw conflict(t.status === 'approved' ? 'Legal has approved this version, so it can’t be discarded. Publish it, or start a new version.' : 'Published and retired versions are kept for history and can’t be discarded.');
  if (t.approvedById || (await isTemplateInUse(id))) throw conflict('This version has history and cannot be discarded.');
  const withdrawn = t.status === 'pending_approval';
  if (withdrawn) await closeTasks({ refId: id, types: ['template_approval'] }, user, 'cancelled');
  const { count } = await db().templateVersion.deleteMany({ where: { id, status: { in: ['draft', 'pending_approval'] } } });
  if (count === 0) throw conflict('This version changed while you were discarding it. Reload and try again.');
  await audit(user, 'delete', 'template', id, `${withdrawn ? 'Withdrew from Legal and discarded' : 'Discarded draft'} template ${CP_TYPE_LABELS[t.cpType]} v${t.version}`);
}

export async function decideTemplate(id: string, decision: 'approve' | 'reject', comment?: string): Promise<void> {
  const user = ctx();
  assertCan(user, 'template.approve', 'Only Legal approves templates.');
  const t = await template(id);
  if (!t || t.status !== 'pending_approval') throw conflict('This template is not waiting for approval.');
  if (t.uploadedById === user.id) throw forbidden('Maker-checker: you cannot approve a template you uploaded.');
  if (decision === 'reject' && (!comment || comment.trim().length < 5)) throw invalid('Add a comment explaining the rejection.');
  const status = decision === 'approve' ? 'approved' : 'draft';
  await transition('templateVersion', id, ['pending_approval'], decision === 'approve' ? { status, approvedById: user.id, approvedAt: now() } : { status, rejectComment: comment!.trim() }, 'This template is not waiting for approval.');
  await closeTasks({ refId: id, types: ['template_approval'] }, user);
  await notify([t.uploadedById], { title: decision === 'approve' ? 'Template approved by Legal' : 'Template returned by Legal', body: `${CP_TYPE_LABELS[t.cpType]} v${t.version}`, link: `/admin/templates?id=${t.id}` });
  await audit(user, decision, 'template', t.id, `${decision === 'approve' ? 'Legal approved' : 'Legal rejected'} template ${CP_TYPE_LABELS[t.cpType]} v${t.version}${comment ? `: ${comment}` : ''}`, { status: 'pending_approval' }, { status });
}

export async function publishTemplate(id: string): Promise<void> {
  const user = ctx();
  assertCan(user, 'template.manage');
  const t = await template(id);
  if (!t) throw notFound('Template');
  if (t.status !== 'approved') throw conflict('Maker-checker: Legal must approve this template before it can be published.');
  await transition('templateVersion', id, ['approved'], { status: 'published', publishedById: user.id, publishedAt: now() }, 'Maker-checker: Legal must approve this template before it can be published.');
  if (t.effectiveFrom <= today()) {
    const older = await db().templateVersion.findMany({ where: { id: { not: t.id }, cpType: t.cpType, institutionId: t.institutionId, status: 'published', version: { lt: t.version } } });
    for (const old of older) {
      await db().templateVersion.update({ where: { id: old.id }, data: { status: 'retired' } });
      await audit('system', 'retire', 'template', old.id, `Retired template v${old.version} (superseded by v${t.version})`);
    }
  }
  await audit(user, 'publish', 'template', t.id, `Published template ${CP_TYPE_LABELS[t.cpType]} v${t.version}; existing agreements keep their template version`, { status: 'approved' }, { status: 'published' });
}
