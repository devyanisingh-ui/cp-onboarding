# Testing the Legal review of CP details

The demo data has three agreements set up for testing Legal's review of CP details and the BD
Executive's corrections, one at each stage of the loop:

| Agreement | CP | Stage | Who tests it |
| --- | --- | --- | --- |
| `AGR-ASU-2026-0009` | Mohammed Irfan (Individual) | Waiting for Legal. Two of the CP's documents don't match: find them | Legal, then BD |
| `AGR-ASU-2026-0018` | Gyan Path Career Point (Proprietorship Firm) | Legal sent three CP details back; the BD has to fix them | BD, then Legal |
| `AGR-ASU-2026-0019` | Lakshya Career Guidance (Sole Proprietorship) | The BD fixed two items and sent it back; Legal re-checks just those | Legal |

`AGR-ASU-2026-0004` (EduBridge Services) is also waiting for Legal, and everything on it matches:
use it to test approving.

Upload files for the BD's corrections are in `demo-documents/8-legal-review-tests/`.

## Before you start

1. Start the app (`npm run dev`) and open <http://localhost:5173>.
2. **Load the demo data.** It loads by itself the first time you open this version of the app (it
   replaces the data saved in your browser). To start again from scratch at any point, sign in as
   Admin (`arjun.mehta`) → **Admin → System → Reset demo data**.
3. Sign in with the password `Apeejay@123`. To switch between people, use the **role switcher** at
   the top of the page:
   - **Legal**: `priya.sharma` (Priya Sharma)
   - **BD Executive**: `kavya.iyer` (Kavya Iyer)

## Case 1: Find the mismatches (`AGR-ASU-2026-0009`)

**As Legal**

1. Home → *Review queue* → **Mohammed Irfan**, or open
   `/agreements/AGR-ASU-2026-0009/legal-review`.
2. The checklist lists only the CP's details: legal name, contact, PAN, Aadhaar, bank. There are no
   signatory, stamp paper or date checks. The agreement is shown on the left, the CP's documents on
   the right; **View** next to an item opens its document.
3. Check each item against its document:
   - **Aadhaar**: the record says last 4 digits **8899**, the Aadhaar card shows **8890**. Mark it
     **Mismatch** and write e.g. *Last 4 digits on the Aadhaar card are 8890*.
   - **PAN**: the PAN card is blurred and can't be read. Mark it **Mismatch**, e.g. *PAN copy is
     blurred*.
   - Everything else matches: mark it **Verified**.
4. **Approve** stays disabled while anything is Mismatch. Click **Send back to BD (2)**, check the
   remarks, add a note if you like, and click **Send to BD Executive**.

**Expected:** you land on My Tasks; the agreement shows **CP details sent back** and moves to
*CP details sent back* on Legal's home page.

**As the BD** (switch to Kavya)

5. Open the agreement (My Tasks → *Correct CP details: Mohammed Irfan*). The card **Legal sent CP
   details back** lists both items with Legal's remarks, *0 of 2 fixed*.
6. **Aadhaar**: the entered value was wrong. Click **Correct CP details**, change *Aadhaar of the individual — last
   4 digits* to `8890` and **Save changes**. Expected: *1 flagged item corrected*; the Aadhaar item
   shows **Details corrected**.
7. **PAN**: PAN can't be edited (it identifies the CP), so upload a corrected copy:
   `demo-documents/8-legal-review-tests/irfan-pan-card-clear.png`. Expected: **Corrected document**.
8. **Send to Legal** is now enabled. Add a note (optional) and send it.

**As Legal again**

9. Open the legal review. Only the **2 flagged items** are listed, each saying what the BD did
   (*details corrected* / *new document uploaded*), with the BD's note. Mark both Verified and
   **Approve**. Expected: the agreement is **Active**.

## Case 2: Fix what Legal flagged (`AGR-ASU-2026-0018`)

**As the BD** (Kavya): open `/agreements/AGR-ASU-2026-0018`. Legal flagged three things:

| Item | Legal's remark | How to fix it |
| --- | --- | --- |
| PAN card of the firm owner | Too blurred to read | Upload `gyan-path-owner-pan-card-clear.png` |
| Udyam (MSME) certificate | Number entered `…0045123` differs from the certificate `…0045132` | **Correct CP details** → *MSME (Udyam) registration number* `UDYAM-UP-28-0045132` |
| Contact person, mobile and email | The mobile number doesn't reach the CP | **Correct CP details** → change *Mobile* to any 10-digit number |

Things to try:

- **Send to Legal** stays disabled until all three are fixed.
- Save the form without changing a flagged field: it saves, but says *None of the flagged details
  changed*, and the items stay unfixed.
- Upload the owner's PAN twice: only the latest copy goes to Legal.
- The Udyam item can be fixed either way: by correcting the number, or by uploading
  `gyan-path-udyam-certificate.png`.

Then send it to Legal and, as Legal, re-check only those three items.

## Case 3: Re-check the corrections (`AGR-ASU-2026-0019`)

**As Legal** (Priya): open `/agreements/AGR-ASU-2026-0019/legal-review`.

- The banner says the BD corrected the 2 items you flagged, with the BD's note.
- **GSTIN**: *BD: details corrected*. The GSTIN now matches the GST certificate.
- **PAN**: *BD: new document uploaded*. The CP documents pane shows the new copy, not the blurred
  one.
- Mark both Verified and **Approve**, or mark one Mismatch and send it back again.

## Also worth checking

- **Reject** is still there for a wrongly signed agreement: it goes back to Draft and must be signed
  again.
- On a phone, Legal's review has three tabs: *Checks*, *Agreement* and *CP documents*.
- If the BD changes the CP's mobile or email, the CP's contact verification no longer shows that
  channel as *Verified*, and sending the agreement to Legal emails the CP a new link.
