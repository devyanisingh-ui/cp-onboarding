/**
 * Writes the demo documents in demo-documents/ as SVG: one set per CP type (every KYC document the
 * app can ask for), plus the agreement-stage documents (signed copy, stamp paper, management
 * approval for a deviation, termination notice). They use the same specimens the app shows for
 * seeded records (src/lib/mockDocuments.ts). The PNG and PDF copies next to them are rendered from
 * these SVGs.
 *
 *   node --experimental-strip-types scripts/make-demo-documents.mts
 *
 * Every person, business, bank and number is fictional; ID numbers are masked on the documents.
 * The unmasked values to type into the wizard are listed in demo-documents/README.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { mockDocumentSvg, type MockDocData, type MockDocType } from '../src/lib/mockDocuments.ts';

const BANK = 'Demo Bank Ltd';

/** Sole proprietorship: the CP used throughout the README walkthrough. */
export const DEMO_CP: MockDocData = {
  cpName: 'Sunrise Education Services',
  personName: 'Ravi Kumar',
  fatherName: 'Shri Mahesh Kumar',
  dob: '14 June 1985',
  panMasked: 'ABCPS••••D',
  aadhaarLast4: '1234',
  address: 'House 12, Sector 29, Gurugram, Haryana 122001',
  bank: { holderName: 'Sunrise Education Services', accountMasked: '••••6789', ifsc: 'DEMO0001234', bankName: BANK, branch: 'Sector 29, Gurugram' },
  gstin: '06ABCPS••••D1Z5',
  extra: {
    cpTypeLabel: 'Sole Proprietorship',
    msmeNumber: 'UDYAM-HR-05-0012345',
    shopLicenceNumber: 'GGN/SE/2023/04567',
    businessAddress: 'SCO 12, Sector 29, Gurugram, Haryana 122001',
  },
  agreement: {
    id: 'AGR-ASU-2026-XXXX',
    institutionName: 'Apeejay Stya University',
    institutionAddress: 'Sohna–Palwal Road, Sohna, Gurugram, Haryana',
    signatoryName: 'Prof. Alok Verma',
    signatoryDesignation: 'Registrar',
    cpSignerName: 'Ravi Kumar',
    executionPlace: 'Gurugram',
    startDate: '20 October 2026',
    endDate: '19 October 2027',
    signedOn: '19 October 2026',
    stamp: { number: 'IN-HR00052611', valueInr: 100, purchaseDate: '18 October 2026', state: 'Haryana', vendor: 'Gurugram Stamp Vendor, Tehsil Office' },
  },
  deviation: {
    ref: 'ASU/MGMT/DEV/2026/017',
    date: '15 October 2026',
    reason: 'The partner has an established engineering referral network in Gurugram and a competing offer from another university. A higher rate on the first two slabs secures exclusivity for the coming admission cycle.',
    items: [
      { label: 'Engineering · 1-10 admissions', standard: '₹16,000', approved: '₹18,000' },
      { label: 'Engineering · 11-15 admissions', standard: '₹19,000', approved: '₹21,000' },
    ],
    approverName: 'Sanjay Malhotra',
    approverDesignation: 'Director, Business Development (specimen)',
    requestedBy: 'Kavya Iyer',
  },
  termination: {
    ref: 'ASU/LEGAL/TERM/2026/004',
    date: '28 October 2026',
    reason: 'Breach: fees collected from applicants, contrary to clause 6 of the agreement.',
    effectiveDate: '27 November 2026',
    noticeDays: 30,
    issuedBy: 'Prof. Alok Verma',
    issuedByDesignation: 'Registrar, Apeejay Stya University',
  },
};

const INDIVIDUAL: MockDocData = {
  cpName: 'Meera Joshi',
  personName: 'Meera Joshi',
  fatherName: 'Shri Prakash Joshi',
  dob: '3 March 1990',
  panMasked: 'AJMPJ••••K',
  aadhaarLast4: '5678',
  address: 'Flat 304, Green Avenue, Sector 45, Noida, Uttar Pradesh 201303',
  bank: { holderName: 'Meera Joshi', accountMasked: '••••4321', ifsc: 'DEMO0004567', bankName: BANK, branch: 'Sector 18, Noida' },
  agreement: { ...DEMO_CP.agreement!, cpSignerName: 'Meera Joshi', signedOn: '19 October 2026' },
};

const PROPRIETORSHIP: MockDocData = {
  cpName: 'Bright Path Admissions',
  personName: 'Anil Sharma',
  panHolder: 'Bright Path Admissions',
  dob: '5 January 2019',
  panMasked: 'AAEFB••••L',
  aadhaarLast4: '2468',
  address: 'H. No. 221, Model Town, Ludhiana, Punjab 141002',
  bank: { holderName: 'Bright Path Admissions', accountMasked: '••••8123', ifsc: 'DEMO0007788', bankName: BANK, branch: 'Model Town, Ludhiana' },
  gstin: '03AAEFB••••L1Z2',
  extra: {
    cpTypeLabel: 'Proprietorship Firm',
    ownerPanMasked: 'BXSPS••••Q',
    msmeNumber: 'UDYAM-PB-10-0023456',
    businessRegistration: 'Trade licence TL/LDH/2024/1189',
    businessAddress: 'Shop 7, Model Town Market, Ludhiana, Punjab 141002',
  },
  agreement: { ...DEMO_CP.agreement!, cpSignerName: 'Anil Sharma' },
};

const PARTNERSHIP: MockDocData = {
  cpName: 'Gupta & Mehta Education Consultants',
  personName: 'Rohit Gupta',
  panHolder: 'Gupta & Mehta Education Consultants',
  dob: '1 April 2022',
  panMasked: 'AAKFG••••H',
  aadhaarLast4: '1357',
  address: '45, Indira Nagar, Lucknow, Uttar Pradesh 226016',
  bank: { holderName: 'Gupta & Mehta Education Consultants', accountMasked: '••••3344', ifsc: 'DEMO0003344', bankName: BANK, branch: 'Hazratganj, Lucknow' },
  gstin: '09AAKFG••••H1Z8',
  extra: {
    cpTypeLabel: 'Partnership Firm',
    ownerPanMasked: 'CQGPG••••R',
    partners: 'Rohit Gupta and Neha Mehta',
    deedDate: '1 April 2022',
    businessAddress: '2nd Floor, 14 Hazratganj, Lucknow, Uttar Pradesh 226001',
  },
  agreement: { ...DEMO_CP.agreement!, cpSignerName: 'Rohit Gupta' },
};

const COMPANY: MockDocData = {
  cpName: 'EduReach Advisors Private Limited',
  personName: 'Kavita Rao',
  panHolder: 'EduReach Advisors Private Limited',
  dob: '12 August 2021',
  panMasked: 'AADCE••••N',
  aadhaarLast4: '9753',
  address: 'Villa 9, Palm Grove, Sector 57, Gurugram, Haryana 122011',
  bank: { holderName: 'EduReach Advisors Private Limited', accountMasked: '••••7788', ifsc: 'DEMO0005566', bankName: BANK, branch: 'Sector 44, Gurugram' },
  extra: {
    cpTypeLabel: 'Private Limited Company',
    ownerPanMasked: 'DKRPR••••S',
    cin: 'U85499HR2021PTC098765',
    incorporationDate: '12 August 2021',
    registeredOffice: 'Unit 501, Tower B, Demo Business Park, Sector 44, Gurugram, Haryana 122003',
    businessAddress: 'Unit 501, Tower B, Demo Business Park, Sector 44, Gurugram, Haryana 122003',
  },
  agreement: { ...DEMO_CP.agreement!, cpSignerName: 'Kavita Rao' },
};

/** [folder, data, [document type, file name]…], in the order the wizard's KYC step lists them. */
const SETS: [string, MockDocData, [MockDocType, string][]][] = [
  ['1-individual', INDIVIDUAL, [
    ['aadhaar_masked', 'aadhaar-masked'],
    ['pan', 'pan-card'],
    ['cancelled_cheque', 'bank-cancelled-cheque'],
    ['bank_letter', 'bank-account-letter'],
  ]],
  ['2-sole-proprietorship', DEMO_CP, [
    ['msme_certificate', 'msme-udyam-certificate'],
    ['gst_certificate', 'gst-certificate'],
    ['pan', 'pan-card'],
    ['aadhaar_masked', 'aadhaar-masked'],
    ['office_address_proof', 'office-address-proof'],
    ['shop_establishment', 'shop-establishment-licence'],
    ['cancelled_cheque', 'bank-cancelled-cheque'],
    ['bank_letter', 'bank-account-letter'],
  ]],
  ['3-proprietorship-firm', PROPRIETORSHIP, [
    ['msme_certificate', 'msme-udyam-certificate'],
    ['gst_certificate', 'gst-certificate'],
    ['pan', 'pan-card-of-firm'],
    ['business_registration', 'business-registration'],
    ['aadhaar_masked', 'aadhaar-masked-owner'],
    ['owner_pan', 'pan-card-of-owner'],
    ['cancelled_cheque', 'bank-cancelled-cheque'],
    ['bank_letter', 'bank-account-letter'],
  ]],
  ['4-partnership-firm', PARTNERSHIP, [
    ['pan', 'pan-card-of-firm'],
    ['gst_certificate', 'gst-certificate'],
    ['partnership_deed', 'partnership-deed'],
    ['owner_pan', 'pan-card-of-authorised-partner'],
    ['aadhaar_masked', 'aadhaar-masked-authorised-partner'],
    ['cancelled_cheque', 'bank-cancelled-cheque'],
    ['bank_letter', 'bank-account-letter'],
  ]],
  ['5-private-limited', COMPANY, [
    ['pan', 'pan-card-of-company'],
    ['incorporation_certificate', 'certificate-of-incorporation'],
    ['cancelled_cheque', 'bank-cancelled-cheque'],
    ['bank_letter', 'bank-account-letter'],
    ['aadhaar_masked', 'aadhaar-masked-director'],
    ['owner_pan', 'pan-card-of-director'],
  ]],
  ['6-agreement-stage', DEMO_CP, [
    ['deviation_approval', 'deviation-management-approval'],
    ['signed_copy', 'signed-agreement'],
    ['stamp_paper_scan', 'stamp-paper'],
    ['termination_notice', 'termination-notice'],
  ]],
];

const root = new URL('../demo-documents/svg/', import.meta.url);
let n = 0;
for (const [folder, data, files] of SETS) {
  const out = new URL(`${folder}/`, root);
  mkdirSync(out, { recursive: true });
  for (const [type, name] of files) {
    writeFileSync(new URL(`${name}.svg`, out), mockDocumentSvg(type, data));
    n++;
  }
}
console.log(`Wrote ${n} SVGs to demo-documents/svg/`);
