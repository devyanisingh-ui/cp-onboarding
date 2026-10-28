# Demo documents

Mock documents to upload while demoing or testing the app: every KYC document the app can ask
for, for each of the five CP types, plus the documents uploaded later in an agreement's life
(management approval for a deviation, signed agreement, stamp paper, termination notice).

Every file is marked **SPECIMEN — mock document for demo only, not a valid document**. The people,
businesses, bank ("Demo Bank Ltd") and numbers are fictional; PAN and account numbers are masked
on the documents; no government emblems, bank logos or security features are reproduced.

| Folder | What's in it |
| --- | --- |
| `1-individual/` | Meera Joshi (Individual) |
| `2-sole-proprietorship/` | Sunrise Education Services, proprietor Ravi Kumar |
| `3-proprietorship-firm/` | Bright Path Admissions, owner Anil Sharma |
| `4-partnership-firm/` | Gupta & Mehta Education Consultants, authorised partner Rohit Gupta |
| `5-private-limited/` | EduReach Advisors Private Limited, director Kavita Rao |
| `6-agreement-stage/` | Management approval for a deviation, signed agreement, stamp paper, termination notice (for Sunrise Education Services) |
| `7-template/` | A Word agreement to import as a template |
| `svg/` | The same documents as SVG (the PNG and PDF files were rendered from these) |

**Bank account details.** Every CP folder has two choices for the *Bank account details* upload:
`bank-cancelled-cheque.png` or `bank-account-letter.pdf` / `.png` (a bank's account confirmation
letter). Either is accepted.

---

## 1. Individual — `1-individual/`

Wizard details:

| Field | Value |
| --- | --- |
| CP type | Individual |
| PAN | `AJMPJ5678K` |
| Legal name | Meera Joshi |
| Contact person | Meera Joshi |
| Mobile / email | 9811123456 · meera@joshi.example |
| Residence address | Flat 304, Green Avenue, Sector 45, Noida, Uttar Pradesh 201303 |
| Aadhaar last 4 digits | 5678 |
| Bank | Meera Joshi · account `30200987654321` · IFSC `DEMO0004567` · Demo Bank Ltd, Sector 18, Noida |

Uploads (wizard step *KYC*):

| Document asked for | File |
| --- | --- |
| Aadhaar card of the individual | `aadhaar-masked.png` |
| PAN card of the individual | `pan-card.png` |
| Bank account details of the individual | `bank-cancelled-cheque.png` or `bank-account-letter.pdf` |

## 2. Sole Proprietorship — `2-sole-proprietorship/`

| Field | Value |
| --- | --- |
| CP type | Sole Proprietorship |
| PAN | `ABCPS1234D` |
| Legal name | Sunrise Education Services |
| Proprietor / contact person | Ravi Kumar |
| Mobile / email | 9812012345 · ravi@sunrise.example |
| Residence address | House 12, Sector 29, Gurugram, Haryana 122001 |
| Business address | SCO 12, Sector 29, Gurugram, Haryana 122001 |
| Aadhaar last 4 digits | 1234 |
| MSME (Udyam) registration number | UDYAM-HR-05-0012345 |
| Shop & Establishment / trade licence no. | GGN/SE/2023/04567 |
| GST (tick "GST registered") | `06ABCPS1234D1Z5` |
| Bank | Sunrise Education Services · account `50100123456789` · IFSC `DEMO0001234` · Demo Bank Ltd, Sector 29, Gurugram |

| Document asked for | File |
| --- | --- |
| MSME (Udyam) registration of the firm | `msme-udyam-certificate.png` |
| GST certificate of the firm (only if GST registered) | `gst-certificate.png` |
| PAN card of the sole proprietor | `pan-card.png` |
| Aadhaar card of the sole proprietor | `aadhaar-masked.png` |
| Office address proof | `office-address-proof.png` |
| Shop & Establishment registration (if applicable) | `shop-establishment-licence.png` |
| Bank account details of the firm | `bank-cancelled-cheque.png` or `bank-account-letter.pdf` |

`pan-card-blurry.png` is a deliberately poor PAN copy: upload it to show Legal flagging the
document and asking the CP for a corrected one, then upload `pan-card.png` from the CP's link.

## 3. Proprietorship Firm — `3-proprietorship-firm/`

| Field | Value |
| --- | --- |
| CP type | Proprietorship Firm |
| PAN of the firm | `AAEFB2345L` |
| Legal name | Bright Path Admissions |
| Owner / contact person | Anil Sharma |
| PAN of the firm owner | `BXSPS6789Q` |
| Mobile / email | 9876501234 · anil@brightpath.example |
| Residence address | H. No. 221, Model Town, Ludhiana, Punjab 141002 |
| Business address | Shop 7, Model Town Market, Ludhiana, Punjab 141002 |
| Aadhaar last 4 digits (owner) | 2468 |
| MSME (Udyam) registration number | UDYAM-PB-10-0023456 |
| Other business registration | Trade licence TL/LDH/2024/1189 |
| GST (optional) | `03AAEFB2345L1Z2` |
| Bank | Bright Path Admissions · account `912020045678123` · IFSC `DEMO0007788` · Demo Bank Ltd, Model Town, Ludhiana |

| Document asked for | File |
| --- | --- |
| MSME (Udyam) registration of the firm | `msme-udyam-certificate.png` |
| GST certificate of the firm (only if GST registered) | `gst-certificate.png` |
| PAN card of the firm | `pan-card-of-firm.png` |
| Other business registration of the firm | `business-registration.png` |
| Aadhaar card of the firm owner | `aadhaar-masked-owner.png` |
| PAN card of the firm owner | `pan-card-of-owner.png` |
| Bank account details of the firm | `bank-cancelled-cheque.png` or `bank-account-letter.pdf` |

## 4. Partnership Firm — `4-partnership-firm/`

| Field | Value |
| --- | --- |
| CP type | Partnership Firm |
| PAN of the firm | `AAKFG3456H` |
| Legal name | Gupta & Mehta Education Consultants |
| Authorised partner / contact person | Rohit Gupta |
| PAN of the authorised partner | `CQGPG4321R` |
| Partners | Rohit Gupta and Neha Mehta |
| Partnership deed date | 1 April 2022 |
| Mobile / email | 9922334455 · rohit@guptamehta.example |
| Residence address | 45, Indira Nagar, Lucknow, Uttar Pradesh 226016 |
| Business address | 2nd Floor, 14 Hazratganj, Lucknow, Uttar Pradesh 226001 |
| Aadhaar last 4 digits (authorised partner) | 1357 |
| GST (optional) | `09AAKFG3456H1Z8` |
| Bank | Gupta & Mehta Education Consultants · account `50200011223344` · IFSC `DEMO0003344` · Demo Bank Ltd, Hazratganj, Lucknow |

| Document asked for | File |
| --- | --- |
| PAN card of the firm | `pan-card-of-firm.png` |
| GST certificate of the firm (only if GST registered) | `gst-certificate.png` |
| Partnership deed between the partners | `partnership-deed.pdf` or `.png` |
| PAN card of the authorised partner | `pan-card-of-authorised-partner.png` |
| Aadhaar card of the authorised partner | `aadhaar-masked-authorised-partner.png` |
| Bank account details of the firm | `bank-cancelled-cheque.png` or `bank-account-letter.pdf` |

## 5. Private Limited Company — `5-private-limited/`

| Field | Value |
| --- | --- |
| CP type | Private Limited Company |
| PAN of the company | `AADCE7890N` |
| Legal name | EduReach Advisors Private Limited |
| Director / authorised signatory, contact person | Kavita Rao |
| PAN of the director | `DKRPR2468S` |
| CIN (from the certificate of incorporation) | `U85499HR2021PTC098765` |
| Date of incorporation | 12 August 2021 |
| Board resolution date | 1 October 2026 (any recent date) |
| Mobile / email | 9988776655 · kavita@edureach.example |
| Residence address (director) | Villa 9, Palm Grove, Sector 57, Gurugram, Haryana 122011 |
| Registered office / business address | Unit 501, Tower B, Demo Business Park, Sector 44, Gurugram, Haryana 122003 |
| Aadhaar last 4 digits (director) | 9753 |
| Bank | EduReach Advisors Private Limited · account `50300055667788` · IFSC `DEMO0005566` · Demo Bank Ltd, Sector 44, Gurugram |

| Document asked for | File |
| --- | --- |
| PAN card of the company | `pan-card-of-company.png` |
| Certificate of incorporation | `certificate-of-incorporation.pdf` or `.png` |
| Bank account details of the company | `bank-cancelled-cheque.png` or `bank-account-letter.pdf` |
| Aadhaar card of the director | `aadhaar-masked-director.png` |
| PAN card of the director | `pan-card-of-director.png` |

---

## 6. Agreement stage — `6-agreement-stage/`

These belong to **Sunrise Education Services** at **Apeejay Stya University (ASU)**. Use them on an
agreement created with the sole-proprietorship details above.

| File | Upload it at |
| --- | --- |
| `deviation-management-approval.pdf` / `.png` | Agreement → **Deviations** → change the rates below → *Supporting documents* → **Send to Legal** |
| `signed-agreement.pdf` / `.png` | Agreement → **Upload signed copy** → Signed agreement |
| `stamp-paper.pdf` / `.png` | Agreement → **Upload signed copy** → Stamp paper scan |
| `termination-notice.pdf` / `.png` | Active agreement → **Terminate** → Termination notice letter |

**The management approval letter** approves these rate changes, matching ASU's current rate card
(v2), so enter exactly these in the Deviation panel:

| Rate cell | Standard | Approved (enter this) |
| --- | --- | --- |
| Engineering · 1-10 admissions | ₹16,000 | **18000** |
| Engineering · 11-15 admissions | ₹19,000 | **21000** |

Reason to type: *Established engineering referral network in Gurugram and a competing offer from
another university; approved by management (letter attached).*

**Stamp paper details** (asked when uploading the signed copy): `IN-HR00052611` · ₹100 · Haryana ·
Gurugram Stamp Vendor, Tehsil Office.

**Termination:** reason *Breach: fees collected from applicants*; the letter gives 30 days' notice.

The documents show the agreement number as `AGR-ASU-2026-XXXX`, since the real number is only
known once you create the agreement.

## 7. Template — `7-template/`

| File | Upload it at |
| --- | --- |
| `sample-agreement-template.docx` | Admin → **Templates** → Upload agreement (Word): imports into an editable draft template |

---

## Regenerating

The documents come from `scripts/make-demo-documents.mts` (the data above) and
`src/lib/mockDocuments.ts` (the layouts, the same ones the app uses to show specimens for seeded
records). To change them, edit those and run:

```bash
node --experimental-strip-types scripts/make-demo-documents.mts
```

That rewrites the SVGs in `svg/`; render them to PNG/PDF with any browser (open, then print to
PDF or screenshot).
