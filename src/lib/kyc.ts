import type { CpType, DocumentType } from '@/types';

/**
 * KYC documents per CP category, from the KYC checklist (Checklist 2026). One place drives the
 * wizard's KYC step, the submission check, Legal's review checklist and document requests.
 *
 * `when`: 'always' = mandatory · 'gst' = only if the CP is GST registered · 'optional' = upload if
 * the CP has one ("if applicable" on the checklist).
 */
export interface KycDoc {
  type: DocumentType;
  label: string;
  hint: string;
  when: 'always' | 'gst' | 'optional';
}

const PDF = 'PDF or photo, max 10 MB';
const AADHAAR_HINT = 'Masked copy: the first 8 digits must be hidden';
const BANK_HINT = 'Cancelled cheque or bank letter; account holder name must be visible';
const GST_HINT = 'Required because the CP is GST registered';

export const KYC_DOCS: Record<CpType, KycDoc[]> = {
  individual: [
    { type: 'aadhaar_masked', label: 'Aadhaar card of the individual', hint: AADHAAR_HINT, when: 'always' },
    { type: 'pan', label: 'PAN card of the individual', hint: PDF, when: 'always' },
    { type: 'cancelled_cheque', label: 'Bank account details of the individual', hint: BANK_HINT, when: 'always' },
  ],
  sole_prop: [
    { type: 'msme_certificate', label: 'MSME (Udyam) registration of the firm', hint: PDF, when: 'always' },
    { type: 'gst_certificate', label: 'GST certificate of the firm', hint: GST_HINT, when: 'gst' },
    { type: 'pan', label: 'PAN card of the sole proprietor', hint: PDF, when: 'always' },
    { type: 'aadhaar_masked', label: 'Aadhaar card of the sole proprietor', hint: AADHAAR_HINT, when: 'always' },
    { type: 'office_address_proof', label: 'Office address proof', hint: 'Rent agreement, utility bill or property document', when: 'always' },
    { type: 'shop_establishment', label: 'Shop & Establishment registration / trade licence', hint: 'If the firm has one', when: 'optional' },
    { type: 'cancelled_cheque', label: 'Bank account details of the firm', hint: BANK_HINT, when: 'always' },
  ],
  proprietorship: [
    { type: 'msme_certificate', label: 'MSME (Udyam) registration of the firm', hint: PDF, when: 'always' },
    { type: 'gst_certificate', label: 'GST certificate of the firm', hint: GST_HINT, when: 'gst' },
    { type: 'pan', label: 'PAN card of the firm', hint: PDF, when: 'always' },
    { type: 'business_registration', label: 'Other business registration of the firm', hint: 'e.g. trade licence or Shop & Establishment certificate', when: 'always' },
    { type: 'aadhaar_masked', label: 'Aadhaar card of the firm owner', hint: AADHAAR_HINT, when: 'always' },
    { type: 'owner_pan', label: 'PAN card of the firm owner', hint: PDF, when: 'always' },
    { type: 'cancelled_cheque', label: 'Bank account details of the firm', hint: BANK_HINT, when: 'always' },
  ],
  partnership: [
    { type: 'pan', label: 'PAN card of the firm', hint: PDF, when: 'always' },
    { type: 'gst_certificate', label: 'GST certificate of the firm', hint: GST_HINT, when: 'gst' },
    { type: 'partnership_deed', label: 'Partnership deed between the partners', hint: 'All pages, signed by every partner', when: 'always' },
    { type: 'owner_pan', label: 'PAN card of the authorised partner', hint: PDF, when: 'always' },
    { type: 'aadhaar_masked', label: 'Aadhaar card of the authorised partner', hint: AADHAAR_HINT, when: 'always' },
    { type: 'cancelled_cheque', label: 'Bank account details of the firm', hint: BANK_HINT, when: 'always' },
  ],
  pvt_ltd: [
    { type: 'pan', label: 'PAN card of the company', hint: PDF, when: 'always' },
    { type: 'incorporation_certificate', label: 'Certificate of incorporation', hint: 'Issued by the Registrar of Companies; CIN must match', when: 'always' },
    { type: 'cancelled_cheque', label: 'Bank account details of the company', hint: BANK_HINT, when: 'always' },
    { type: 'aadhaar_masked', label: 'Aadhaar card of the director', hint: AADHAAR_HINT, when: 'always' },
    { type: 'owner_pan', label: 'PAN card of the director', hint: PDF, when: 'always' },
  ],
};

/** The documents this CP must upload (GST certificate only when GST registered). */
export function requiredKyc(type: CpType, gstRegistered: boolean): KycDoc[] {
  return KYC_DOCS[type].filter((d) => d.when === 'always' || (d.when === 'gst' && gstRegistered));
}

/** Documents shown in the KYC step: required ones plus "if applicable" ones. */
export function kycDocsFor(type: CpType, gstRegistered: boolean): KycDoc[] {
  return KYC_DOCS[type].filter((d) => d.when !== 'gst' || gstRegistered);
}

/** Label of a document for this CP type (falls back to the generic label). */
export function kycLabel(type: CpType | undefined, doc: DocumentType): string {
  return (type && KYC_DOCS[type].find((d) => d.type === doc)?.label) ?? DOC_TYPE_LABELS[doc] ?? doc;
}

/** Generic document labels, for lists that mix CP types. */
export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  pan: 'PAN card',
  aadhaar_masked: 'Aadhaar (masked)',
  cancelled_cheque: 'Bank account details',
  gst_certificate: 'GST certificate',
  owner_pan: 'PAN card of owner / partner / director',
  msme_certificate: 'MSME (Udyam) registration',
  shop_establishment: 'Shop & Establishment / trade licence',
  office_address_proof: 'Office address proof',
  business_registration: 'Other business registration',
  partnership_deed: 'Partnership deed',
  incorporation_certificate: 'Certificate of incorporation',
  draft: 'Draft agreement',
  signed_copy: 'Signed agreement',
  stamp_paper_scan: 'Stamp paper scan',
  termination_notice: 'Termination notice',
  template_docx: 'Template DOCX',
  other: 'Other',
};

/** Who the "person" is for each CP type (Aadhaar holder, signer). */
export const PERSON_ROLE: Record<CpType, string> = {
  individual: 'individual',
  sole_prop: 'sole proprietor',
  proprietorship: 'firm owner',
  partnership: 'authorised partner',
  pvt_ltd: 'director',
};

/** Whose PAN the main PAN field holds. */
export const PAN_OF: Record<CpType, string> = {
  individual: 'PAN of the individual',
  sole_prop: 'PAN of the sole proprietor',
  proprietorship: 'PAN of the firm',
  partnership: 'PAN of the firm',
  pvt_ltd: 'PAN of the company',
};

/** CP types that also record the owner's / partner's / director's own PAN. */
export const HAS_OWNER_PAN: Record<CpType, boolean> = { individual: false, sole_prop: false, proprietorship: true, partnership: true, pvt_ltd: true };
