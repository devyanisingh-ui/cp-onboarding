# Demo documents

Mock documents to upload while demoing the app. Every file is marked **SPECIMEN — mock document
for demo only, not a valid document**. The person, business, bank and numbers are fictional, ID
numbers are masked, and no government emblems, bank logos or security features are reproduced.

| File | Upload it at |
| --- | --- |
| `pan-card.png` | Wizard step 5 (KYC) → PAN copy |
| `aadhaar-masked.png` | Wizard step 5 (KYC) → Masked Aadhaar |
| `cancelled-cheque.png` | Wizard step 5 (KYC) → Cancelled cheque |
| `gst-certificate.png` | Wizard step 5 (KYC) → GST certificate (only if you tick "GST registered") |
| `signed-agreement.pdf` / `.png` | Agreement → Upload signed copy → Signed agreement |
| `stamp-paper.pdf` / `.png` | Agreement → Upload signed copy → Stamp paper scan |
| `sample-agreement-template.docx` | Admin → Templates → Upload agreement (Word): imports into an editable draft template |
| `pan-card-blurry.png` | A "bad" PAN copy, to show Legal flagging a mismatch and the CP re-uploading `pan-card.png` from their link |

`svg/` has the same documents as SVG. Regenerate them with
`node --experimental-strip-types scripts/make-demo-documents.mts`.

## Demo CP details

Enter these in the new agreement wizard so the documents match what you type:

| Field | Value |
| --- | --- |
| PAN | `ABCPS1234D` |
| CP type | Sole Proprietorship |
| Legal name | Sunrise Education Services |
| Proprietor / contact person | Ravi Kumar |
| Mobile | 9812012345 |
| Email | ravi@sunrise.example |
| Residence address | House 12, Sector 29, Gurugram, Haryana 122001 |
| Business address | SCO 12, Sector 29, Gurugram, Haryana 122001 |
| Aadhaar last 4 digits | 1234 |
| Bank account holder | Sunrise Education Services |
| Account number | 50100123456789 |
| IFSC | DEMO0001234 |
| Bank / branch | Demo Bank Ltd · Sector 29, Gurugram |
| GST (optional) | 06ABCPS1234D1Z5 |
| Institution | ASU → Main Campus, Sohna |
| Stamp paper (when uploading the signed copy) | IN-HR00052611 · ₹100 · Haryana · Gurugram Stamp Vendor, Tehsil Office |

## In the app without uploading

Seeded agreements and CPs have no real files, so the app now draws a matching specimen from each
record's own data (name, masked PAN, masked Aadhaar, bank, stamp paper, signatories) whenever you
open or download one of their documents.
