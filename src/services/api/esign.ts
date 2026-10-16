/**
 * Digital signatures, simulated in the browser (no e-sign provider yet).
 *
 * BD Executive sends an approved agreement for signature → the CP's signer gets an email link →
 * after they sign, the institution's signatory (e.g. the Registrar) gets theirs → when both have
 * signed, the app builds the signed PDF (signatures in the signature block, optionally on every
 * page, plus a signature certificate page), files it as the signed copy and the agreement becomes
 * Active. (Paper copies uploaded by hand still go through Gate 2.)
 *
 * Signers have no app account: the signing link's token is their only credential. Methods:
 *  - `electronic`: drawn or typed signature, with consent, from the email link
 *  - `dsc`: digital signature certificate on a USB token (certificate choice + PIN are simulated)
 */
import type { Agreement, DscCertificate, ESigner, ESignRequest, SignMethod, StampPaper } from '@/types';
import { CP_TYPE_LABELS } from '@/lib/format';
import { formatDateTime, shiftDays, today } from '@/lib/dates';
import { renderAgreementHtml } from '@/lib/agreementTemplate';
import { buildPdfBytes, sha256Hex, toPdfSignatures } from '@/lib/docExport';
import { signaturesToShow } from '@/lib/signatures';
import { stampPaperSchema } from '@/lib/schemas';
import { conflict, invalid, notFound } from '../errors';
import { sendExternalEmail } from '../notificationChannels';
import { nextId } from '../db';
import { assertCan, audit, closeTasks, commit, ctx, delay, device, firstUserWithRole, getDb, inScope, notify, now } from './core';
import { mergeContext } from './agreements';
import { storeDocument } from './documents';

export const SIGN_METHOD_LABELS: Record<SignMethod, string> = {
  electronic: 'Drawn or typed signature (email link)',
  dsc: 'Digital signature certificate (DSC)',
};

const ROLE_LABELS: Record<ESigner['role'], string> = { cp: 'Channel Partner', institution: 'Institution' };

function token(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function cpName(a: Agreement) {
  return getDb().cps.find((c) => c.id === a.cpId)!.legalName;
}

function load(id: string) {
  const user = ctx();
  const a = getDb().agreements.find((x) => x.id === id);
  if (!a || !inScope(user, a.institutionId)) throw notFound('Agreement');
  return { user, a };
}

/** Who signs for the CP, by CP type (proprietor, authorised signatory, authorised partner or the individual). */
export function defaultCpSigner(a: Agreement): { name: string; designation: string; email: string } {
  const cp = getDb().cps.find((c) => c.id === a.cpId)!;
  const t = cp.typeFields;
  switch (cp.type) {
    case 'sole_prop':
      return { name: t.proprietorName || cp.contactPerson, designation: 'Proprietor', email: cp.email };
    case 'pvt_ltd':
      return { name: (t.authorisedSignatory || cp.contactPerson).split(',')[0]!.trim(), designation: 'Authorised Signatory', email: cp.email };
    case 'partnership':
      return { name: t.authorisedPartner || cp.contactPerson, designation: 'Authorised Partner', email: cp.email };
    case 'individual':
      return { name: cp.legalName, designation: CP_TYPE_LABELS.individual, email: cp.email };
  }
}

/**
 * The certificates the signer's simulated USB token offers. Deterministic per name, with one
 * expired certificate so the "choose a valid certificate" step is meaningful.
 */
export function dscCertificatesFor(name: string): DscCertificate[] {
  const seed = Array.from(name).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const serial = (k: number) => ((seed * (k + 3)) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return [
    { id: `cert-${serial(1)}`, subject: name, issuer: 'eMudhra Sub CA for Class 3 Individual 2024', serial: serial(1), className: 'Class 3', validFrom: shiftDays(today(), -200), validTo: shiftDays(today(), 530) },
    { id: `cert-${serial(2)}`, subject: name, issuer: '(n)Code Solutions CA 2022', serial: serial(2), className: 'Class 3', validFrom: shiftDays(today(), -900), validTo: shiftDays(today(), -170) },
  ];
}

function signingEmail(a: Agreement, s: ESigner) {
  const how = s.method === 'dsc' ? 'Sign with your digital signature certificate (DSC) — keep your USB token and PIN ready.' : 'Review the agreement, then draw or type your signature.';
  sendExternalEmail(s.email, {
    title: `Please sign: Channel Partner Agreement ${a.id}`,
    body: `Dear ${s.name},\n\nApeejay Education has sent you the Channel Partner Agreement ${a.id} (${cpName(a)}) to sign as ${s.role === 'cp' ? 'the Channel Partner' : `${s.designation ?? 'signatory'} for the institution`}.\n\n${how}\n\nThis link is personal to you. Do not forward it.`,
    link: `/sign/${s.token}`,
    kind: 'signature',
  });
}

function setTaskTitle(a: Agreement, title: string) {
  const t = getDb().tasks.find((x) => x.agreementId === a.id && x.type === 'signing_upload' && x.status === 'open');
  if (t) t.title = title;
}

// ---------------- BD Executive (signed in) ----------------

export interface SignerInput {
  role: ESigner['role'];
  name: string;
  designation?: string;
  email: string;
  method: SignMethod;
}

export async function sendForSignature(id: string, input: { signers: SignerInput[]; signEveryPage: boolean; stampPaper: StampPaper }): Promise<void> {
  await delay('write');
  const { user, a } = load(id);
  assertCan(user, 'signed.upload', 'Only BD Executives or Admin can send agreements for signature.');
  if (a.status !== 'approved_for_signing' || a.source !== 'app') throw conflict('Only agreements approved for signing can be sent for e-signature.');
  if (a.esign?.status === 'in_progress') throw conflict('This agreement is already out for signature.');
  // Collect every problem at once so the form can show them together.
  const errors: Record<string, string> = {};
  const stamp = stampPaperSchema.safeParse(input.stampPaper);
  if (!stamp.success)
    for (const i of stamp.error.issues) errors[`stamp.${i.path.join('.')}`] = i.path[0] === 'number' ? 'Enter the e-stamp certificate number' : i.message;
  for (const role of ['cp', 'institution'] as const) {
    const s = input.signers.find((x) => x.role === role);
    if (!s) throw invalid(`Add the ${ROLE_LABELS[role]} signer.`);
    if (s.name.trim().length < 2) errors[`${role}.name`] = 'Enter the signer’s name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim())) errors[`${role}.email`] = 'Enter a valid email address';
  }
  const cpEmail = input.signers.find((x) => x.role === 'cp')?.email.trim().toLowerCase();
  const instEmail = input.signers.find((x) => x.role === 'institution')?.email.trim().toLowerCase();
  if (cpEmail && cpEmail === instEmail) errors['institution.email'] = 'Each signer needs their own email address';
  if (Object.keys(errors).length || !stamp.success) throw invalid(Object.keys(errors).some((k) => !k.startsWith('stamp.')) ? 'Check the signer details.' : 'Enter the e-stamp certificate details.', errors);

  // Signing order: the CP signs first, then the institution.
  const signers: ESigner[] = (['cp', 'institution'] as const).map((role, i) => {
    const s = input.signers.find((x) => x.role === role)!;
    return { role, order: i + 1, name: s.name.trim(), designation: s.designation?.trim() || undefined, email: s.email.trim(), method: s.method, token: token(), status: i === 0 ? 'sent' : 'waiting', sentAt: i === 0 ? now() : undefined };
  });
  const req: ESignRequest = { id: nextId('esign', 'ES-'), status: 'in_progress', signEveryPage: input.signEveryPage, signers, sentById: user.id, sentAt: now() };
  a.esign = req;
  a.stampPaper = stamp.data;
  a.lastRejection = undefined;
  a.updatedAt = now();
  signingEmail(a, signers[0]!);
  setTaskTitle(a, `Awaiting e-signatures: ${cpName(a)}`);
  audit(user, 'esign_send', 'agreement', a.id, `Sent for e-signature (${signers.map((s) => `${s.order}. ${s.name}, ${s.method === 'dsc' ? 'DSC' : 'drawn/typed'}`).join('; ')})${req.signEveryPage ? ', signing every page' : ''}`, undefined, { esign: req.id, stampPaper: stamp.data.number });
  commit();
}

export async function resendSignatureEmail(id: string): Promise<void> {
  await delay('write');
  const { user, a } = load(id);
  assertCan(user, 'signed.upload');
  const current = a.esign?.status === 'in_progress' ? a.esign.signers.find((s) => s.status === 'sent') : undefined;
  if (!current) throw conflict('Nobody is waiting to sign.');
  current.sentAt = now();
  signingEmail(a, current);
  audit(user, 'esign_resend', 'agreement', a.id, `Resent the signing email to ${current.name}`);
  commit();
}

export async function cancelSignature(id: string, reason: string): Promise<void> {
  await delay('write');
  const { user, a } = load(id);
  assertCan(user, 'signed.upload');
  if (a.esign?.status !== 'in_progress') throw conflict('No signature request is in progress.');
  if (!reason || reason.trim().length < 5) throw invalid('Add a reason (at least 5 characters).', { comment: 'A reason is required' });
  a.esign.status = 'cancelled';
  a.esign.cancelledAt = now();
  for (const s of a.esign.signers.filter((x) => x.status === 'sent'))
    sendExternalEmail(s.email, { title: `Signing request withdrawn: ${a.id}`, body: `Dear ${s.name},\n\nApeejay Education has withdrawn the signing request for agreement ${a.id}. You don’t need to do anything.`, link: '', kind: 'signature' });
  setTaskTitle(a, `Get signed & upload: ${cpName(a)}`);
  a.updatedAt = now();
  audit(user, 'esign_cancel', 'agreement', a.id, `Withdrew the e-signature request: ${reason.trim()}`);
  commit();
}

// ---------------- Signer (signing link, no app account) ----------------

export interface SigningSession {
  agreementId: string;
  cpName: string;
  institutionName: string;
  html: string;
  requestStatus: ESignRequest['status'];
  signEveryPage: boolean;
  signer: Omit<ESigner, 'token'>;
  /** The other signers, in signing order (status only). */
  parties: { role: ESigner['role']; order: number; name: string; designation?: string; method: SignMethod; status: ESigner['status']; signedAt?: string }[];
  yourTurn: boolean;
  waitingFor?: string;
  certificates: DscCertificate[];
}

function findByToken(t: string): { a: Agreement; req: ESignRequest; signer: ESigner } {
  for (const a of getDb().agreements) {
    const signer = a.esign?.signers.find((s) => s.token === t);
    if (signer) return { a, req: a.esign!, signer };
  }
  throw notFound('Signing link');
}

function signerActor(s: ESigner) {
  return { id: `signer:${s.role}`, name: `${s.name} (${ROLE_LABELS[s.role]} signer)` };
}

export async function getSigningSession(t: string): Promise<SigningSession> {
  await delay();
  const { a, req, signer } = findByToken(t);
  const d = getDb();
  const yourTurn = req.status === 'in_progress' && signer.status === 'sent';
  if (yourTurn && !signer.viewedAt) {
    signer.viewedAt = now();
    audit(signerActor(signer), 'esign_view', 'agreement', a.id, `${signer.name} opened the signing link`);
    commit();
  }
  const { token: _secret, ...publicSigner } = signer;
  const ahead = req.signers.find((s) => s.order < signer.order && s.status !== 'signed');
  return {
    agreementId: a.id,
    cpName: cpName(a),
    institutionName: d.institutions.find((i) => i.id === a.institutionId)!.legalName,
    html: renderAgreementHtml(mergeContext(a)),
    requestStatus: req.status,
    signEveryPage: req.signEveryPage,
    signer: publicSigner,
    parties: req.signers.map((s) => ({ role: s.role, order: s.order, name: s.name, designation: s.designation, method: s.method, status: s.status, signedAt: s.signedAt })),
    yourTurn,
    waitingFor: ahead && req.status === 'in_progress' ? ahead.name : undefined,
    certificates: signer.method === 'dsc' ? dscCertificatesFor(signer.name) : [],
  };
}

export type SignatureInput =
  | { kind: 'drawn' | 'typed'; image: string; typedName?: string; consent: boolean }
  | { kind: 'dsc'; certificateId: string; pin: string };

export async function signWithToken(t: string, input: SignatureInput): Promise<{ completed: boolean }> {
  await delay('write');
  const { a, req, signer } = findByToken(t);
  if (req.status !== 'in_progress') throw conflict('This signing request is no longer active.');
  if (signer.status === 'signed') throw conflict('You have already signed this agreement.');
  if (signer.status !== 'sent') throw conflict('It isn’t your turn to sign yet.');

  if (input.kind === 'dsc') {
    if (signer.method !== 'dsc') throw invalid('This link is for a drawn or typed signature.');
    const cert = dscCertificatesFor(signer.name).find((c) => c.id === input.certificateId);
    if (!cert) throw invalid('Choose a certificate from your token.');
    if (cert.validTo < today()) throw invalid('That certificate has expired. Choose a valid one.');
    if (!/^\d{4,8}$/.test(input.pin)) throw invalid('Enter your token PIN (4–8 digits).', { pin: 'Enter the 4–8 digit PIN' });
    signer.signature = { kind: 'dsc', certificate: cert };
  } else {
    if (signer.method !== 'electronic') throw invalid('This link is for a DSC signature.');
    if (!input.consent) throw invalid('Confirm that you agree to sign electronically.', { consent: 'Required' });
    if (!/^data:image\/png;base64,/.test(input.image)) throw invalid('Add your signature.');
    if (input.kind === 'typed' && (input.typedName ?? '').trim().length < 2) throw invalid('Type your full name.', { typedName: 'Type your name' });
    signer.signature = { kind: input.kind, image: input.image, typedName: input.typedName?.trim() };
  }
  signer.status = 'signed';
  signer.signedAt = now();
  signer.ip = '203.0.113.' + (20 + signer.order * 17);
  signer.device = device();
  audit(signerActor(signer), 'esign_sign', 'agreement', a.id, `${signer.name} signed (${signer.signature.kind === 'dsc' ? `DSC, serial ${signer.signature.certificate!.serial}` : signer.signature.kind})`);
  notify([a.ownerId], { title: 'Agreement signed', body: `${signer.name} signed ${a.id} (${cpName(a)}).`, link: `/agreements/${a.id}` });

  const next = req.signers.find((s) => s.status === 'waiting');
  if (next) {
    next.status = 'sent';
    next.sentAt = now();
    signingEmail(a, next);
    a.updatedAt = now();
    commit();
    return { completed: false };
  }
  await completeSigning(a, req);
  return { completed: true };
}

export async function declineWithToken(t: string, reason: string): Promise<void> {
  await delay('write');
  const { a, req, signer } = findByToken(t);
  if (req.status !== 'in_progress' || signer.status !== 'sent') throw conflict('This signing request is no longer waiting for you.');
  if (!reason || reason.trim().length < 5) throw invalid('Tell us why (at least 5 characters).', { reason: 'A reason is required' });
  signer.status = 'declined';
  signer.declinedAt = now();
  signer.declineReason = reason.trim();
  req.status = 'declined';
  setTaskTitle(a, `Signature declined — follow up: ${cpName(a)}`);
  a.updatedAt = now();
  audit(signerActor(signer), 'esign_decline', 'agreement', a.id, `${signer.name} declined to sign: ${signer.declineReason}`);
  notify([a.ownerId], { title: 'Signature declined', body: `${signer.name} declined to sign ${a.id}. Open the agreement to follow up.`, link: `/agreements/${a.id}` });
  commit();
}


async function completeSigning(a: Agreement, req: ESignRequest) {
  const d = getDb();
  const html = renderAgreementHtml(mergeContext(a));
  const hash = await sha256Hex(await buildPdfBytes(html, a.id));
  // Same signatures the agreement already shows (lib/signatures), placed in the final PDF.
  const signatures = toPdfSignatures(signaturesToShow(a)?.signatures ?? []);
  const sender = d.users.find((u) => u.id === req.sentById);
  const bytes = await buildPdfBytes(html, a.id, {
    signatures,
    everyPage: req.signEveryPage,
    certificate: {
      title: 'Signature certificate',
      intro: [
        `Agreement ${a.id} · ${cpName(a)} · ${d.institutions.find((i) => i.id === a.institutionId)!.legalName}`,
        `Document SHA-256 (before signing): ${hash}`,
        `Sent for signature by ${sender?.name ?? 'Apeejay'} on ${formatDateTime(req.sentAt)} · Signing order: Channel Partner, then Institution${req.signEveryPage ? ' · Signed on every page' : ''}`,
        `E-stamp: ${a.stampPaper?.number ?? '—'} (${a.stampPaper?.state ?? ''})`,
      ],
      sections: req.signers.map((s) => ({
        heading: `${s.order}. ${s.name} — ${ROLE_LABELS[s.role]}${s.designation ? `, ${s.designation}` : ''}`,
        rows: [
          ['Email', s.email],
          ['Method', s.signature!.kind === 'dsc' ? 'Digital signature certificate (DSC)' : s.signature!.kind === 'drawn' ? 'Electronic signature (drawn)' : `Electronic signature (typed: ${s.signature!.typedName ?? s.name})`],
          ...(s.signature!.certificate
            ? ([
                ['Certificate', `${s.signature!.certificate.className} · ${s.signature!.certificate.subject}`],
                ['Issuer', s.signature!.certificate.issuer],
                ['Serial', s.signature!.certificate.serial],
                ['Valid', `${s.signature!.certificate.validFrom} to ${s.signature!.certificate.validTo}`],
              ] as [string, string][])
            : []),
          ['Link sent', formatDateTime(s.sentAt!)],
          ['Opened', s.viewedAt ? formatDateTime(s.viewedAt) : '—'],
          ['Signed', formatDateTime(s.signedAt!)],
          ['IP address · device', `${s.ip ?? '—'} · ${s.device ?? '—'}`],
        ],
      })),
    },
  });
  const owner = d.users.find((u) => u.id === a.ownerId) ?? firstUserWithRole('admin')!;
  const { document } = await storeDocument(owner, 'agreement', a.id, 'signed_copy', new Blob([bytes], { type: 'application/pdf' }), `${a.id}_e-signed.pdf`);
  req.status = 'completed';
  req.completedAt = now();
  req.documentHash = hash;
  req.signedDocumentId = document.id;
  // Signed by both the CP and the institution's signatory: the agreement is Active straight away,
  // with the same side effects as passing Gate 2 (agreements.decideGate2).
  a.signedOn = today();
  a.status = 'active';
  a.activatedAt = now();
  a.verification = undefined;
  a.updatedAt = now();
  document.verificationStatus = 'verified';
  document.verifiedOn = now();
  document.retentionUntil = shiftDays(a.endDate ?? today(), 365 * 8 + 2);
  const cp = d.cps.find((c) => c.id === a.cpId);
  if (cp) cp.reverificationRequired = false;
  if (a.predecessorId) {
    const p = d.agreements.find((x) => x.id === a.predecessorId);
    if (p) p.successorId = a.id;
  }
  closeTasks({ agreementId: a.id, types: ['signing_upload'] }, 'system');
  audit('system', 'esign_complete', 'agreement', a.id, `All parties signed — e-signed PDF filed (${document.fileName}); agreement Active`, { status: 'approved_for_signing' }, { status: a.status });
  notify([a.ownerId], { title: 'Agreement active', body: `${a.id} (${cpName(a)}) is signed by both parties and is now Active.`, link: `/agreements/${a.id}` });
  commit();
}
