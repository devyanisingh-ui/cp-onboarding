import type { DocumentRecord, DocumentType, User } from '@/types';
import { formatDate, shiftDays, today } from '@/lib/dates';
import { maskAccount, maskGstin, maskPan } from '@/lib/mask';
import { CP_TYPE_LABELS } from '@/lib/format';
import { MOCK_DOC_TYPES, mockDocumentSvg, type MockDocData, type MockDocType } from '@/lib/mockDocuments';
import { can } from '@/lib/permissions';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { nextId } from '../db';
import { getBlob, putBlob } from '../blobStore';
import { audit, commit, ctx, delay, getDb, inScope } from './core';
import { cpFullAccess } from './dto';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const RETENTION_YEARS = 8;

function canAccessOwner(user: User, ownerType: DocumentRecord['ownerType'], ownerId: string): boolean {
  const d = getDb();
  if (ownerType === 'cp') return cpFullAccess(user, ownerId);
  if (ownerType === 'agreement') {
    const a = d.agreements.find((x) => x.id === ownerId);
    return !!a && inScope(user, a.institutionId);
  }
  return can(user, 'template.view');
}

/** Retention: 8 years after the (latest) agreement end date (PRD §11, clause 13). */
export function retentionFor(ownerType: DocumentRecord['ownerType'], ownerId: string): string {
  const d = getDb();
  const ends =
    ownerType === 'agreement'
      ? d.agreements.filter((a) => a.id === ownerId).map((a) => a.endDate ?? today())
      : ownerType === 'cp'
        ? d.agreements.filter((a) => a.cpId === ownerId).map((a) => a.endDate ?? today())
        : [today()];
  const latest = ends.sort().at(-1) ?? today();
  return shiftDays(latest > today() ? latest : today(), 365 * RETENTION_YEARS + 2);
}

export interface UploadResult {
  document: DocumentRecord;
  warnings: string[];
}

/** Throws unless the file can be stored (size and type); returns its MIME type. */
export function assertUploadable(file: Blob, fileName: string): string {
  if (file.size > MAX_FILE_BYTES) throw invalid(`${fileName} is larger than 10 MB.`);
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.includes(mime)) throw invalid(`${fileName}: only PDF, JPG, PNG, WEBP or DOCX files are accepted.`);
  return mime;
}

/** Internal upload used by several workflows; caller commits. */
export async function storeDocument(
  user: User,
  ownerType: DocumentRecord['ownerType'],
  ownerId: string,
  type: DocumentType,
  file: Blob,
  fileName: string,
): Promise<UploadResult> {
  const mime = assertUploadable(file, fileName);
  const id = nextId('doc', 'DOC-');
  const blobKey = `blob-${id}`;
  await putBlob(blobKey, file);
  const warnings: string[] = [];
  if (type === 'aadhaar_masked' && !/mask/i.test(fileName)) {
    // A real build would run OCR to detect 12 visible digits; the prototype flags by file name.
    warnings.push('This Aadhaar copy may not be masked. Make sure the first 8 digits are hidden before submitting.');
  }
  const doc: DocumentRecord = {
    id,
    ownerType,
    ownerId,
    type,
    fileName,
    mimeType: mime,
    size: file.size,
    blobKey,
    uploadedById: user.id,
    uploadedAt: new Date().toISOString(),
    verificationStatus: 'pending',
    retentionUntil: retentionFor(ownerType, ownerId),
  };
  getDb().documents.push(doc);
  audit(user, 'upload', 'document', id, `Uploaded ${type.replace(/_/g, ' ')} for ${ownerType} ${ownerId}`, undefined, { fileName, size: file.size });
  return { document: doc, warnings };
}

export async function uploadDocument(input: {
  ownerType: 'cp' | 'agreement';
  ownerId: string;
  type: DocumentType;
  file: Blob;
  fileName: string;
}): Promise<UploadResult> {
  await delay('write');
  const user = ctx();
  if (!can(user, 'kyc.upload') && !can(user, 'signed.upload') && !can(user, 'termination.start')) throw forbidden('Your role cannot upload documents.');
  if (!canAccessOwner(user, input.ownerType, input.ownerId)) throw notFound('Record');
  const res = await storeDocument(user, input.ownerType, input.ownerId, input.type, input.file, input.fileName);
  commit();
  return res;
}

export interface FileAccess {
  url: string | null;
  expiresAt: string;
  document: DocumentRecord;
  /** Type of the file behind `url` (a specimen is an SVG image whatever the record says). */
  mimeType?: string;
  /** True when `url` is a generated demo specimen, not an uploaded file. */
  specimen?: boolean;
}

/** Data for a seeded record's demo specimen, from the CP (and agreement) it belongs to. Numbers stay masked. */
function specimenData(doc: DocumentRecord): MockDocData | null {
  const d = getDb();
  const a = doc.ownerType === 'agreement' ? d.agreements.find((x) => x.id === doc.ownerId) : undefined;
  const cp = d.cps.find((c) => c.id === (a ? a.cpId : doc.ownerId));
  if (!cp) return null;
  const t = cp.typeFields;
  const person = (t.proprietorName || t.ownerName || t.authorisedSignatory?.split(',')[0] || t.authorisedPartner || (cp.type === 'individual' ? cp.legalName : '') || cp.contactPerson).trim();
  const inst = a ? d.institutions.find((i) => i.id === a.institutionId) : undefined;
  return {
    cpName: cp.legalName,
    personName: person,
    panHolder: cp.type === 'pvt_ltd' || cp.type === 'partnership' || cp.type === 'proprietorship' ? cp.legalName : undefined,
    fatherName: t.fatherName || undefined,
    dob: t.dob ? formatDate(t.dob) : undefined,
    panMasked: maskPan(cp.pan),
    aadhaarLast4: cp.aadhaarLast4,
    address: cp.residenceAddress || cp.businessAddress,
    bank: { holderName: cp.bank.holderName, accountMasked: maskAccount(cp.bank.accountNumber), ifsc: cp.bank.ifsc, bankName: cp.bank.bankName, branch: cp.bank.branch },
    gstin: cp.gstin ? maskGstin(cp.gstin) : undefined,
    extra: {
      cpTypeLabel: CP_TYPE_LABELS[cp.type],
      ownerPanMasked: t.ownerPan ? maskPan(t.ownerPan) : undefined,
      msmeNumber: t.msmeNumber,
      shopLicenceNumber: t.shopLicenceNumber,
      businessRegistration: t.businessRegistration,
      partners: t.partners,
      deedDate: t.deedDate ? formatDate(t.deedDate) : undefined,
      cin: t.cin,
      incorporationDate: t.incorporationDate ? formatDate(t.incorporationDate) : undefined,
      registeredOffice: t.registeredOffice,
      businessAddress: cp.businessAddress || undefined,
    },
    agreement:
      a && inst
        ? {
            id: a.id,
            institutionName: inst.legalName,
            signatoryName: a.signatoryName,
            signatoryDesignation: a.signatoryDesignation,
            cpSignerName: person,
            executionPlace: a.executionPlace,
            startDate: a.startDate ? formatDate(a.startDate) : undefined,
            endDate: a.endDate ? formatDate(a.endDate) : undefined,
            signedOn: a.signedOn ? formatDate(a.signedOn) : undefined,
            electronic: a.esign?.status === 'completed',
            stamp: a.stampPaper ? { ...a.stampPaper, purchaseDate: formatDate(a.stampPaper.purchaseDate) } : undefined,
          }
        : undefined,
  };
}

function specimenUrl(doc: DocumentRecord): string | null {
  if (!(MOCK_DOC_TYPES as string[]).includes(doc.type) || typeof URL.createObjectURL !== 'function') return null;
  const data = specimenData(doc);
  if (!data) return null;
  return URL.createObjectURL(new Blob([mockDocumentSvg(doc.type as MockDocType, data)], { type: 'image/svg+xml' }));
}

/**
 * Short-lived access link (PRD §11: 5 minutes). Every view and download is logged.
 * Seeded records have metadata but no file: they get a generated, clearly marked demo specimen
 * (url=null if there is none for that document type).
 */
export async function openDocument(id: string, mode: 'view' | 'download'): Promise<FileAccess> {
  await delay();
  const user = ctx();
  const doc = getDb().documents.find((x) => x.id === id);
  if (!doc || !canAccessOwner(user, doc.ownerType, doc.ownerId)) throw notFound('Document');
  const blob = doc.blobKey ? await getBlob(doc.blobKey) : undefined;
  const specimen = !blob ? specimenUrl(doc) : null;
  const url = blob ? URL.createObjectURL(blob) : specimen;
  if (url) setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  audit(user, mode, 'document', id, `${mode === 'view' ? 'Viewed' : 'Downloaded'} ${doc.fileName}`);
  commit();
  return {
    url,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    document: doc,
    mimeType: specimen ? 'image/svg+xml' : blob?.type || doc.mimeType,
    specimen: !!specimen,
  };
}

/** Hard delete is blocked until the retention date (PRD §4, §11). */
export async function deleteDocument(id: string): Promise<never> {
  await delay('write');
  const user = ctx();
  const doc = getDb().documents.find((x) => x.id === id);
  if (!doc || !canAccessOwner(user, doc.ownerType, doc.ownerId)) throw notFound('Document');
  audit(user, 'delete_blocked', 'document', id, `Delete attempt blocked by retention lock (until ${doc.retentionUntil})`);
  commit();
  if (doc.retentionUntil && doc.retentionUntil > today())
    throw conflict(`Retention lock: this document must be kept until ${formatDate(doc.retentionUntil)}. It cannot be deleted before then.`);
  throw conflict('Purging after the retention date needs Admin and Audit approval.');
}

/** Audit's manual KYC verification of CP documents (verified by / on / method / remarks). */
export async function verifyDocument(id: string, status: 'verified' | 'mismatch', remarks?: string): Promise<void> {
  await delay('write');
  const user = ctx();
  if (!can(user, 'gate2.verify')) throw forbidden('Only Audit can verify KYC documents.');
  const doc = getDb().documents.find((x) => x.id === id);
  if (!doc) throw notFound('Document');
  if (status === 'mismatch' && !remarks?.trim()) throw invalid('Add a remark explaining the mismatch.');
  const before = { verificationStatus: doc.verificationStatus };
  Object.assign(doc, { verificationStatus: status, verifiedById: user.id, verifiedOn: new Date().toISOString(), verificationMethod: 'manual', remarks: remarks?.trim() || undefined });
  if (doc.ownerType === 'cp') {
    const cp = getDb().cps.find((c) => c.id === doc.ownerId);
    const pending = getDb().documents.some((x) => x.ownerType === 'cp' && x.ownerId === doc.ownerId && x.verificationStatus !== 'verified');
    if (cp && !pending) cp.reverificationRequired = false;
  }
  audit(user, status === 'verified' ? 'verify' : 'mismatch', 'document', id, `Marked ${doc.fileName} as ${status}`, before, { verificationStatus: status, remarks });
  commit();
}
