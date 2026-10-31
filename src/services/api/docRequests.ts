/**
 * Mismatched CP details: Legal → BD → Legal.
 *
 * Legal reviews the CP's details against the KYC documents (lib/cpChecks), marks each Verified or
 * Mismatch, and sends the mismatches back with a remark on each. The CP is emailed the issues, with
 * the BD Executive in copy (no upload link: the BD collects the corrected documents). The signed agreement waits with
 * the BD Executive (status signed_copy_uploaded), who fixes every flagged item: by correcting the
 * CP details, or by uploading a corrected copy of the document (got from the CP outside the app).
 * Then the agreement goes back to Legal, who re-checks just those items. The agreement itself is
 * not changed, so it does not need signing again.
 */
import type { Agreement, CpMaster, DocRequest, DocRequestItem } from '@/types';
import type { CpFormValues } from '@/lib/schemas';
import { can } from '@/lib/permissions';
import { kycLabel } from '@/lib/kyc';
import { cpCheck, cpCheckChanged, cpCheckKeys, cpCheckLabel } from '@/lib/cpChecks';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { nextId } from '../db';
import { sendExternalEmail } from '../notificationChannels';
import { assertCan, audit, closeTasks, commit, createTask, ctx, delay, getDb, inScope, notify, now } from './core';
import { storeDocument } from './documents';
import { sendToLegal } from './agreements';
import { upsertCp } from './cps';

function cpOf(a: Agreement) {
  return getDb().cps.find((c) => c.id === a.cpId)!;
}

/** The check's name in this CP's checklist. */
const label = (key: string, a: Agreement) => cpCheckLabel(key, cpOf(a).type);

/** The CP's current copy of a document type: newest first, superseded copies left out. */
function currentDoc(a: Agreement, type: string) {
  return getDb()
    .documents.filter((x) => x.ownerType === 'cp' && x.ownerId === a.cpId && x.type === type && x.verificationStatus !== 'mismatch')
    .sort((x, y) => y.uploadedAt.localeCompare(x.uploadedAt))[0];
}

function loadAgreement(id: string) {
  const user = ctx();
  const a = getDb().agreements.find((x) => x.id === id);
  if (!a || !inScope(user, a.institutionId)) throw notFound('Agreement');
  return { user, a };
}

/** Whether the BD has fixed a flagged item: corrected details or a corrected document. */
export const itemFixed = (it: DocRequestItem) => !!(it.detailsUpdatedAt || it.replacementId);

// ---------------- Legal ----------------

/** Legal sends the agreement back to the BD with a remark on each CP detail that doesn't match. */
export async function requestCpChanges(agreementId: string, items: { key: string; remark: string }[], note?: string): Promise<void> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  assertCan(user, 'gate1.approve', 'Only Legal can send CP details back.');
  if (a.status !== 'pending_approval') throw conflict('This agreement is not waiting for Legal review.');
  if (a.ownerId === user.id) throw forbidden('You cannot review an agreement you created.');
  if (!items.length) throw invalid('Mark at least one CP detail as Mismatch.');
  const cp = cpOf(a);
  const allowed = cpCheckKeys(cp, getDb().documents.filter((x) => x.ownerType === 'cp' && x.ownerId === cp.id).map((x) => x.type));
  const flagged: DocRequestItem[] = items.map((it) => {
    if (!allowed.includes(it.key as never)) throw invalid('That is not one of this CP’s details.');
    if (!it.remark.trim()) throw invalid(`Say what doesn’t match: ${label(it.key, a)}.`);
    const type = cpCheck(it.key)!.doc;
    const doc = type ? currentDoc(a, type) : undefined;
    return { key: it.key, remark: it.remark.trim(), documentId: doc?.id, documentType: type };
  });
  const before = { status: a.status };
  const req: DocRequest = { id: nextId('docreq', 'DR-'), status: 'with_bd', note: note?.trim() || undefined, items: flagged, requestedById: user.id, requestedAt: now() };
  const summary = flagged.map((it) => `${label(it.key, a)}: ${it.remark}`).join('; ');
  a.docRequest = req;
  emailCp(a, req);
  a.status = 'signed_copy_uploaded';
  a.lastRejection = { gate: 1, byId: user.id, at: now(), comment: req.note ? `${req.note} — ${summary}` : `CP details to correct — ${summary}` };
  a.updatedAt = now();
  closeTasks({ agreementId: a.id, types: ['gate1_approval'] }, user);
  createTask({ type: 'cp_doc_request', title: `Correct CP details: ${cp.legalName}`, assigneeId: a.ownerId, slaDays: 3, agreementId: a.id, cpId: a.cpId, institutionId: a.institutionId });
  notify([a.ownerId], { title: 'Legal sent CP details back', body: `${cp.legalName} · ${a.id}: ${summary}. The CP was emailed these issues, with you in copy. Get in touch with them, correct the details or upload corrected documents, then send the agreement back to Legal.`, link: `/agreements/${a.id}` });
  audit(user, 'reject', 'agreement', a.id, `Legal sent CP details back — ${summary}`, before, { status: a.status });
  commit();
}

/**
 * Tells the CP what doesn't match, with their BD Executive in copy. No link: the BD gets in touch
 * about the corrected documents.
 */
function emailCp(a: Agreement, req: DocRequest) {
  const d = getDb();
  const cp = cpOf(a);
  const bd = d.users.find((u) => u.id === a.ownerId);
  const inst = d.institutions.find((i) => i.id === a.institutionId);
  // Named as the CP knows them: the document, or the detail they gave.
  const name = (it: DocRequestItem) => (it.documentType ? kycLabel(cp.type, it.documentType) : it.key === 'cp_name' ? 'Legal name' : 'Contact person, mobile and email');
  const issues = req.items.map((it) => `• ${name(it)}: ${it.remark}`).join('\n');
  const contact = bd ? `${bd.name} (${bd.email})` : 'your Apeejay contact';
  sendExternalEmail(
    cp.email,
    {
      title: `Your details for Channel Partner Agreement ${a.id} need correcting`,
      body: [
        `Dear ${cp.contactPerson || cp.legalName},`,
        `${inst?.legalName ?? 'Apeejay'}'s Legal team reviewed the details and documents you gave for Channel Partner Agreement ${a.id}. The following don't match and need correcting:`,
        issues,
        ...(req.note ? [`Note from the Legal team: ${req.note}`] : []),
        `${contact} will get in touch with you about the corrected details and documents. Please wait to hear from them; you don't need to do anything in the meantime. Your signed agreement stays valid and doesn't need signing again.`,
        `Regards,\nLegal team, ${inst?.legalName ?? 'Apeejay Education'}`,
      ].join('\n\n'),
      kind: 'event',
    },
    bd ? [bd.email] : undefined,
  );
  req.emailedTo = { cp: cp.email, bd: bd?.email };
}

// ---------------- BD Executive ----------------

function openRequest(a: Agreement) {
  const req = a.docRequest;
  if (a.status !== 'signed_copy_uploaded' || !req || req.status === 'closed') throw conflict('There is no open request from Legal on this agreement.');
  return req;
}

function assertBd(user: ReturnType<typeof ctx>) {
  assertCan(user, 'kyc.upload');
  if (!can(user, 'agreement.edit') || !can(user, 'cp.edit')) throw forbidden();
}

/**
 * BD corrects the CP's details. Saved like any CP edit; each flagged item whose details changed is
 * marked fixed. Returns how many flagged items this fixed.
 */
export async function correctFlaggedDetails(agreementId: string, values: CpFormValues): Promise<{ fixed: number }> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  assertBd(user);
  const req = openRequest(a);
  const before: CpMaster = structuredClone(cpOf(a));
  const after = upsertCp(values, a.cpId);
  let fixed = 0;
  for (const it of req.items) {
    if (!cpCheckChanged(it.key, before, after)) continue;
    it.detailsUpdatedAt = now();
    fixed++;
    audit(user, 'update', 'agreement', a.id, `Corrected ${label(it.key, a)} after Legal’s remark`);
  }
  commit();
  return { fixed };
}

/** BD uploads the corrected copy of a flagged item's document. Uploading again replaces it. */
export async function uploadCorrectedDoc(agreementId: string, key: string, file: Blob, fileName: string): Promise<void> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  assertBd(user);
  const req = openRequest(a);
  const item = req.items.find((it) => it.key === key);
  if (!item) throw invalid('Legal did not flag this detail.');
  if (!item.documentType) throw invalid(`${label(key, a)} has no document; correct the details instead.`);
  // An earlier upload that never reached Legal is superseded, so Legal sees only the latest copy.
  const earlier = getDb().documents.find((x) => x.id === item.replacementId);
  if (earlier) Object.assign(earlier, { verificationStatus: 'mismatch', verifiedById: user.id, verifiedOn: now(), verificationMethod: 'manual', remarks: 'Superseded by a newer upload' });
  const { document } = await storeDocument(user, 'cp', a.cpId, item.documentType, file, fileName);
  item.replacementId = document.id;
  audit(user, 'upload', 'document', document.id, `Uploaded the corrected ${label(key, a)} (${fileName}) for ${a.id}`);
  commit();
}

/** BD sends the agreement back to Legal once every flagged item is fixed. */
export async function resubmitCorrectedDocs(agreementId: string, note?: string): Promise<void> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  if (!can(user, 'agreement.edit')) throw forbidden();
  const req = openRequest(a);
  const missing = req.items.filter((it) => !itemFixed(it));
  if (missing.length) throw invalid(`Fix everything Legal flagged first: ${missing.map((it) => label(it.key, a)).join(', ')}.`);
  const d = getDb();
  const before = { status: a.status };
  // The flagged copy of each replaced document is superseded by the corrected one.
  for (const it of req.items) {
    const old = it.replacementId && d.documents.find((x) => x.id === it.documentId);
    if (old) Object.assign(old, { verificationStatus: 'mismatch', verifiedById: req.requestedById, verifiedOn: req.requestedAt, verificationMethod: 'manual', remarks: it.remark });
  }
  req.status = 'closed';
  req.closedAt = now();
  req.closedById = user.id;
  req.bdNote = note?.trim() || undefined;
  sendToLegal(a, user);
  audit(user, 'submit', 'agreement', a.id, `Corrected the CP details Legal flagged; sent back to Legal${req.bdNote ? `: ${req.bdNote}` : ''}`, before, { status: a.status });
  commit();
}
