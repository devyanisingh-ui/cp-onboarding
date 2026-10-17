/**
 * Writes the demo documents in demo-documents/ as SVG, from the same specimens the app shows for
 * seeded records (src/lib/mockDocuments.ts). The PNG and PDF copies in that folder were rendered
 * from these SVGs.
 *
 *   node --experimental-strip-types scripts/make-demo-documents.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { mockDocumentSvg, type MockDocData, type MockDocType } from '../src/lib/mockDocuments.ts';

/** Matches the demo CP in demo-documents/README.md (fictional person and business). */
export const DEMO_CP: MockDocData = {
  cpName: 'Sunrise Education Services',
  personName: 'Ravi Kumar',
  fatherName: 'Shri Mahesh Kumar',
  dob: '14 June 1985',
  panMasked: 'ABCPS••••D',
  aadhaarLast4: '1234',
  address: 'House 12, Sector 29, Gurugram, Haryana 122001',
  bank: { holderName: 'Sunrise Education Services', accountMasked: '••••6789', ifsc: 'DEMO0001234', bankName: 'Demo Bank Ltd', branch: 'Sector 29, Gurugram' },
  gstin: '06ABCPS••••D1Z5',
  agreement: {
    id: 'AGR-ASU-2026-XXXX',
    institutionName: 'Apeejay Stya University',
    signatoryName: 'Prof. Alok Verma',
    signatoryDesignation: 'Registrar',
    cpSignerName: 'Ravi Kumar',
    executionPlace: 'Gurugram',
    startDate: '20 October 2026',
    endDate: '19 October 2027',
    signedOn: '19 October 2026',
    stamp: { number: 'IN-HR00052611', valueInr: 100, purchaseDate: '18 October 2026', state: 'Haryana', vendor: 'Gurugram Stamp Vendor, Tehsil Office' },
  },
};

const FILES: [MockDocType, string][] = [
  ['pan', 'pan-card'],
  ['aadhaar_masked', 'aadhaar-masked'],
  ['cancelled_cheque', 'cancelled-cheque'],
  ['gst_certificate', 'gst-certificate'],
  ['stamp_paper_scan', 'stamp-paper'],
  ['signed_copy', 'signed-agreement'],
];

const out = new URL('../demo-documents/svg/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const [type, name] of FILES) writeFileSync(new URL(`${name}.svg`, out), mockDocumentSvg(type, DEMO_CP));
console.log(`Wrote ${FILES.length} SVGs to demo-documents/svg/`);
