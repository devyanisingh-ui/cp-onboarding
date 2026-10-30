/**
 * Corrected CP documents: Legal → BD → Legal.
 *
 * While reviewing an agreement, Legal flags the documents that are wrong and adds a remark to each.
 * The signed agreement waits with the BD Executive (status signed_copy_uploaded), who gets the
 * corrected documents from the CP outside the app, uploads them and sends the agreement back to
 * Legal. The agreement itself is not changed, so it does not need signing again.
 */
import type { Agreement, DocRequest, DocumentType } from '@/types';
import { can } from '@/lib/permissions';
import { kycLabel } from '@/lib/kyc';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { nextId } from '../db';
import { assertCan, audit, closeTasks, commit, createTask, ctx, delay, getDb, inScope, notify, now } from './core';
import { storeDocument } from './documents';
import { sendToLegal } from './agreements';

/** The document's name in the KYC checklist for this CP's category. */
const label = (t: DocumentType, a: Agreement) => kycLabel(cpOf(a).type, t);

function cpOf(a: Agreement) {
  return getDb().cps.find((c) => c.id === a.cpId)!;
}

function loadAgreement(id: string) {
  const user = ctx();
  const a = getDb().agreements.find((x) => x.id === id);
  if (!a || !inScope(user, a.institutionId)) throw notFound('Agreement');
  return { user, a };
}

// ---------------- Legal ----------------

/** Legal sends the agreement back with a remark on each document the CP must correct. */
export async function requestDocChanges(agreementId: string, items: { documentId: string; remark: string }[], note?: string): Promise<void> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  assertCan(user, 'gate1.approve', 'Only Legal can ask for corrected documents.');
  if (a.status !== 'pending_approval') throw conflict('This agreement is not waiting for Legal review.');
  if (a.ownerId === user.id) throw forbidden('You cannot review an agreement you created.');
  if (!items.length) throw invalid('Choose at least one document to correct.');
  const d = getDb();
  const docs = items.map((it) => {
    const doc = d.documents.find((x) => x.id === it.documentId && x.ownerType === 'cp' && x.ownerId === a.cpId);
    if (!doc) throw notFound('Document');
    if (!it.remark.trim()) throw invalid(`Add a remark for the ${label(doc.type, a)}.`);
    return { doc, remark: it.remark.trim() };
  });
  const before = { status: a.status };
  docs.forEach(({ doc, remark }) => Object.assign(doc, { verificationStatus: 'mismatch', verifiedById: user.id, verifiedOn: now(), verificationMethod: 'manual', remarks: remark }));
  const req: DocRequest = {
    id: nextId('docreq', 'DR-'),
    status: 'with_bd',
    note: note?.trim() || undefined,
    items: docs.map(({ doc, remark }) => ({ documentId: doc.id, documentType: doc.type, remark })),
    requestedById: user.id,
    requestedAt: now(),
  };
  const summary = docs.map(({ doc, remark }) => `${label(doc.type, a)}: ${remark}`).join('; ');
  a.docRequest = req;
  a.status = 'signed_copy_uploaded';
  a.lastRejection = { gate: 1, byId: user.id, at: now(), comment: req.note ? `${req.note} — ${summary}` : `Documents to correct — ${summary}` };
  a.updatedAt = now();
  closeTasks({ agreementId: a.id, types: ['gate1_approval'] }, user);
  createTask({ type: 'cp_doc_request', title: `Upload corrected documents: ${cpOf(a).legalName}`, assigneeId: a.ownerId, slaDays: 3, agreementId: a.id, cpId: a.cpId, institutionId: a.institutionId });
  notify([a.ownerId], { title: 'Legal asked for corrected documents', body: `${cpOf(a).legalName} · ${a.id}: ${summary}. Get them from the CP, upload them and send the agreement back to Legal.`, link: `/agreements/${a.id}` });
  audit(user, 'reject', 'agreement', a.id, `Legal asked for corrected documents — ${summary}`, before, { status: a.status });
  commit();
}

// ---------------- BD Executive ----------------

function openRequest(a: Agreement) {
  const req = a.docRequest;
  if (a.status !== 'signed_copy_uploaded' || !req || req.status === 'closed') throw conflict('There is no open document request on this agreement.');
  return req;
}

/** BD uploads the corrected copy of one flagged document, got from the CP. Uploading again replaces it. */
export async function uploadCorrectedDoc(agreementId: string, documentType: DocumentType, file: Blob, fileName: string): Promise<void> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  assertCan(user, 'kyc.upload');
  if (!can(user, 'agreement.edit')) throw forbidden();
  const req = openRequest(a);
  const item = req.items.find((it) => it.documentType === documentType);
  if (!item) throw invalid('Legal did not ask for this document.');
  // An earlier upload that never reached Legal is superseded, so Legal sees only the latest copy.
  const earlier = getDb().documents.find((x) => x.id === item.replacementId);
  if (earlier) Object.assign(earlier, { verificationStatus: 'mismatch', verifiedById: user.id, verifiedOn: now(), verificationMethod: 'manual', remarks: 'Superseded by a newer upload' });
  const { document } = await storeDocument(user, 'cp', a.cpId, documentType, file, fileName);
  item.replacementId = document.id;
  audit(user, 'upload', 'document', document.id, `Uploaded the corrected ${label(documentType, a)} (${fileName}) for ${a.id}`);
  commit();
}

/** BD sends the agreement back to Legal once every flagged document has a corrected copy. */
export async function resubmitCorrectedDocs(agreementId: string, note?: string): Promise<void> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  if (!can(user, 'agreement.edit')) throw forbidden();
  const req = openRequest(a);
  const missing = req.items.filter((it) => !it.replacementId);
  if (missing.length) throw invalid(`Upload every document Legal asked for first: ${missing.map((it) => label(it.documentType, a)).join(', ')}.`);
  const before = { status: a.status };
  req.status = 'closed';
  req.closedAt = now();
  req.closedById = user.id;
  req.bdNote = note?.trim() || undefined;
  sendToLegal(a, user);
  audit(user, 'submit', 'agreement', a.id, `Uploaded the corrected documents; sent back to Legal${req.bdNote ? `: ${req.bdNote}` : ''}`, before, { status: a.status });
  commit();
}
