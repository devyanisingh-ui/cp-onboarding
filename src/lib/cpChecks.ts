/**
 * What Legal checks in its review: the CP's details, each against the KYC document that proves it.
 * Shared by Legal's checklist, the request Legal sends back to the BD Executive, and the BD's fixes:
 * a flagged item is fixed by editing the CP details it covers (`fields`) or by uploading a corrected
 * copy of its document (`doc`).
 */
import type { CpMaster, CpType, DocumentType } from '@/types';
import { kycDocsFor, PAN_OF, PERSON_ROLE } from './kyc';

export type CpCheckKey = 'cp_name' | 'contact' | DocumentType;

interface CpCheckDef {
  label: (t: CpType) => string;
  /** The document it is checked against; the BD can upload a corrected copy. */
  doc?: DocumentType;
  /** CP master fields it covers; the BD can correct them. Empty: only a corrected document fixes it. */
  fields: string[];
}

const DOC_CHECKS: Partial<Record<DocumentType, CpCheckDef>> = {
  // PAN identifies the CP and cannot be edited: a wrong PAN card is fixed by a corrected copy.
  pan: { label: (t) => `${PAN_OF[t]} matches the PAN card`, doc: 'pan', fields: [] },
  owner_pan: { label: (t) => `PAN of the ${PERSON_ROLE[t]} matches the PAN card`, doc: 'owner_pan', fields: ['typeFields.ownerPan'] },
  aadhaar_masked: { label: (t) => `Aadhaar of the ${PERSON_ROLE[t]} is masked; last 4 match`, doc: 'aadhaar_masked', fields: ['aadhaarLast4'] },
  cancelled_cheque: { label: () => 'Bank details match the cheque / bank letter', doc: 'cancelled_cheque', fields: ['bank'] },
  gst_certificate: { label: () => 'GSTIN matches the GST certificate', doc: 'gst_certificate', fields: ['gstRegistered', 'gstin'] },
  msme_certificate: { label: () => 'MSME (Udyam) certificate matches the firm', doc: 'msme_certificate', fields: ['typeFields.msmeNumber'] },
  office_address_proof: { label: () => 'Office address proof matches the office address', doc: 'office_address_proof', fields: ['businessAddress'] },
  shop_establishment: { label: () => 'Shop & Establishment / trade licence matches', doc: 'shop_establishment', fields: ['typeFields.shopLicenceNumber'] },
  business_registration: { label: () => 'Business registration of the firm matches', doc: 'business_registration', fields: ['typeFields.businessRegistration'] },
  partnership_deed: { label: () => 'Partnership deed: partners and deed date match', doc: 'partnership_deed', fields: ['typeFields.partners', 'typeFields.deedDate'] },
  incorporation_certificate: { label: () => 'Certificate of incorporation: CIN and date match', doc: 'incorporation_certificate', fields: ['typeFields.cin', 'typeFields.incorporationDate'] },
};

const CHECKS: Record<string, CpCheckDef> = {
  cp_name: { label: () => 'Legal name of the CP matches the documents', fields: ['legalName'] },
  contact: { label: () => 'Contact person, mobile and email', fields: ['contactPerson', 'mobile', 'email'] },
  ...DOC_CHECKS,
};

export function cpCheck(key: string): CpCheckDef | undefined {
  return CHECKS[key];
}

export function cpCheckLabel(key: string, t: CpType): string {
  return CHECKS[key]?.label(t) ?? key;
}

/** The checks for this CP: name, contact, then one per KYC document it needs (optional ones only if uploaded). */
export function cpCheckKeys(cp: Pick<CpMaster, 'type' | 'gstRegistered'>, uploaded: DocumentType[]): CpCheckKey[] {
  const docs = kycDocsFor(cp.type, cp.gstRegistered)
    .filter((k) => k.when !== 'optional' || uploaded.includes(k.type))
    .map((k) => k.type)
    .filter((t) => DOC_CHECKS[t]);
  return ['cp_name', 'contact', ...docs];
}

const at = (o: object, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], o);

/** Whether any field a check covers differs between two versions of the CP. */
export function cpCheckChanged(key: string, before: CpMaster, after: CpMaster): boolean {
  return (CHECKS[key]?.fields ?? []).some((f) => JSON.stringify(at(before, f)) !== JSON.stringify(at(after, f)));
}
