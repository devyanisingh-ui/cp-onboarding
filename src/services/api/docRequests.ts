/**
 * Corrected CP documents: Legal → BD → CP → BD → Legal.
 *
 * While reviewing an agreement, Legal flags the documents that are wrong and adds a remark to each.
 * The agreement goes back to the BD Executive, who sends the CP a personal upload link. The CP
 * (no app account; the link token is their credential) re-uploads just the flagged documents and
 * sends them back. The BD Executive checks them and resubmits the agreement to Legal.
 */
import type { Agreement, DocRequest, DocumentType } from '@/types';
import { can } from '@/lib/permissions';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { nextId } from '../db';
import { sendExternalEmail } from '../notificationChannels';
import { assertCan, audit, closeTasks, commit, createTask, ctx, delay, firstUserWithRole, getDb, inScope, notify, now } from './core';
import { storeDocument } from './documents';
import { submitForApproval } from './agreements';

const DOC_LABELS: Partial<Record<DocumentType, string>> = {
  pan: 'PAN copy',
  aadhaar_masked: 'Masked Aadhaar',
  cancelled_cheque: 'Cancelled cheque',
  gst_certificate: 'GST certificate',
  other: 'Other document',
};
const label = (t: DocumentType) => DOC_LABELS[t] ?? t.replace(/_/g, ' ');

function token(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

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
    if (!it.remark.trim()) throw invalid(`Add a remark for the ${label(doc.type)}.`);
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
  const summary = docs.map(({ doc, remark }) => `${label(doc.type)}: ${remark}`).join('; ');
  a.docRequest = req;
  a.status = 'draft';
  a.lastRejection = { gate: 1, byId: user.id, at: now(), comment: req.note ? `${req.note} — ${summary}` : `Documents to correct — ${summary}` };
  a.updatedAt = now();
  closeTasks({ agreementId: a.id, types: ['gate1_approval'] }, user);
  createTask({ type: 'cp_doc_request', title: `Get corrected documents from CP: ${cpOf(a).legalName}`, assigneeId: a.ownerId, slaDays: 3, agreementId: a.id, cpId: a.cpId, institutionId: a.institutionId });
  notify([a.ownerId], { title: 'Legal asked for corrected documents', body: `${cpOf(a).legalName} · ${a.id}: ${summary}. Send the CP their upload link.`, link: `/agreements/${a.id}` });
  audit(user, 'reject', 'agreement', a.id, `Legal asked for corrected documents — ${summary}`, before, { status: a.status });
  commit();
}

// ---------------- BD Executive ----------------

/** Sends (or resends) the CP a personal link to re-upload the flagged documents. Returns the link. */
export async function sendDocRequestLink(agreementId: string, email: string): Promise<{ link: string }> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  assertCan(user, 'kyc.upload');
  const req = a.docRequest;
  if (a.status !== 'draft' || !req || req.status === 'closed') throw conflict('There is no open document request on this agreement.');
  const to = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw invalid('Enter a valid email address.', { email: 'Enter a valid email' });
  const cp = cpOf(a);
  // A new link each time; the old one stops working. Resending after the CP submitted asks again.
  req.token = token();
  req.cpEmail = to;
  req.sentAt = now();
  if (req.status === 'cp_submitted') {
    req.items.forEach((it) => (it.replacementId = undefined));
    req.cpSubmittedAt = undefined;
    closeTasks({ agreementId: a.id, types: ['cp_doc_review'] }, user);
    createTask({ type: 'cp_doc_request', title: `Get corrected documents from CP: ${cp.legalName}`, assigneeId: a.ownerId, slaDays: 3, agreementId: a.id, cpId: a.cpId, institutionId: a.institutionId });
  }
  req.status = 'sent_to_cp';
  const link = `/cp-documents/${req.token}`;
  sendExternalEmail(to, {
    title: `Please re-upload documents for your Channel Partner Agreement ${a.id}`,
    body: `Dear ${cp.contactPerson || cp.legalName},\n\nApeejay's Legal team reviewed your documents for agreement ${a.id} and needs the following corrected:\n\n${req.items.map((it) => `• ${label(it.documentType)}: ${it.remark}`).join('\n')}\n\nUse the link to upload the corrected documents. This link is personal to you. Do not forward it.`,
    link,
    kind: 'task',
  });
  audit(user, 'send', 'agreement', a.id, `Sent the CP a document upload link (${to})`);
  commit();
  return { link };
}

/** BD checked the CP's corrected documents: closes the request and resubmits to Legal. */
export async function acceptCpDocs(agreementId: string): Promise<void> {
  await delay('write');
  const { user, a } = loadAgreement(agreementId);
  if (!can(user, 'agreement.edit')) throw forbidden();
  const req = a.docRequest;
  if (a.status !== 'draft' || req?.status !== 'cp_submitted') throw conflict('The CP has not sent corrected documents yet.');
  req.status = 'closed';
  req.closedAt = now();
  req.closedById = user.id;
  closeTasks({ agreementId: a.id, types: ['cp_doc_review', 'cp_doc_request'] }, user);
  audit(user, 'approve', 'agreement', a.id, 'Checked the CP’s corrected documents');
  commit();
  await submitForApproval(a.id);
}

// ---------------- CP (public link) ----------------

function findByToken(t: string) {
  const a = getDb().agreements.find((x) => x.docRequest?.token && x.docRequest.token === t);
  if (!a || !a.docRequest) throw notFound('Upload link');
  return { a, req: a.docRequest };
}

function cpActor(a: Agreement) {
  return { id: 'cp:upload', name: `${cpOf(a).legalName} (CP, upload link)` };
}

export interface CpDocSession {
  agreementId: string;
  cpName: string;
  institutionName: string;
  status: DocRequest['status'];
  note?: string;
  items: { documentType: DocumentType; label: string; remark: string; previousFileName: string; uploadedFileName?: string }[];
  /** True while the CP can still upload and send. */
  open: boolean;
}

export async function getCpDocSession(t: string): Promise<CpDocSession> {
  await delay();
  const { a, req } = findByToken(t);
  const d = getDb();
  return {
    agreementId: a.id,
    cpName: cpOf(a).legalName,
    institutionName: d.institutions.find((i) => i.id === a.institutionId)!.legalName,
    status: req.status,
    note: req.note,
    items: req.items.map((it) => ({
      documentType: it.documentType,
      label: label(it.documentType),
      remark: it.remark,
      previousFileName: d.documents.find((x) => x.id === it.documentId)?.fileName ?? '',
      uploadedFileName: it.replacementId ? d.documents.find((x) => x.id === it.replacementId)?.fileName : undefined,
    })),
    open: req.status === 'sent_to_cp',
  };
}

export async function uploadCpDoc(t: string, documentType: DocumentType, file: Blob, fileName: string): Promise<void> {
  await delay('write');
  const { a, req } = findByToken(t);
  if (req.status !== 'sent_to_cp') throw conflict('This upload link is no longer active.');
  const item = req.items.find((it) => it.documentType === documentType);
  if (!item) throw invalid('This document was not requested.');
  const owner = getDb().users.find((u) => u.id === a.ownerId) ?? firstUserWithRole('admin')!;
  const { document } = await storeDocument(owner, 'cp', a.cpId, documentType, file, fileName);
  item.replacementId = document.id;
  audit(cpActor(a), 'upload', 'document', document.id, `CP re-uploaded ${label(documentType)} (${fileName}) from their link`);
  commit();
}

export async function submitCpDocs(t: string, note?: string): Promise<void> {
  await delay('write');
  const { a, req } = findByToken(t);
  if (req.status !== 'sent_to_cp') throw conflict('This upload link is no longer active.');
  const missing = req.items.filter((it) => !it.replacementId);
  if (missing.length) throw invalid(`Upload every requested document first: ${missing.map((it) => label(it.documentType)).join(', ')}.`);
  req.status = 'cp_submitted';
  req.cpSubmittedAt = now();
  req.cpNote = note?.trim() || undefined;
  closeTasks({ agreementId: a.id, types: ['cp_doc_request'] }, 'system');
  createTask({ type: 'cp_doc_review', title: `Check CP’s corrected documents: ${cpOf(a).legalName}`, assigneeId: a.ownerId, slaDays: 2, agreementId: a.id, cpId: a.cpId, institutionId: a.institutionId });
  notify([a.ownerId], { title: 'CP sent corrected documents', body: `${cpOf(a).legalName} uploaded the documents for ${a.id}. Check them and send the agreement to Legal.`, link: `/agreements/${a.id}` });
  audit(cpActor(a), 'submit', 'agreement', a.id, `CP sent corrected documents${req.cpNote ? `: ${req.cpNote}` : ''}`);
  commit();
}
