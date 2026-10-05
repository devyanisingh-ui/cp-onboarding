# CP Onboarding

Front-end prototype of the Apeejay **Channel Partner (CP) Onboarding** app, built from the PRD
("PRD – CP Onboarding App", Sep 2026). Staff create, approve, sign, verify and renew CP
agreements across Apeejay institutions.

It is front-end only: there is no server. An in-browser mock data layer
(`src/services/mockApi.ts`) with seed data and simulated latency stands in for the REST API, shaped
like the PRD's section 4 entities so it can be swapped for a real backend later.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173 and use **Sign in with Google** (simulated). The role switcher in the
header lets you view the app as each persona.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build in `dist/` (installable PWA) |
| `npm run build:mobile` | One self-contained HTML file, `cp-onboarding-mobile.html`, that runs when opened directly on a phone |
| `npm run build:share` | Variant of the mobile file for publishing as a hosted page |
| `npm test` | Workflow tests (Vitest) against the mock API |
| `npm run typecheck` | TypeScript check |

To try it on a phone on the same Wi-Fi: `npm run dev -- --host`, then open the printed Network address.

## Demo personas

| Role | Account | Scope |
| --- | --- | --- |
| BD Executive | Neha Kapoor | ASU |
| Approver | Rajiv Malhotra | ASU |
| Legal | Priya Sharma | All |
| Authorised Signatory | Prof. Alok Verma | ASU |
| Audit / Compliance | Meera Iyer | All |
| Admin | Arjun Mehta | All |

More accounts (Rohan Desai, Sunita Kulkarni, Kiran Sethi) cover the second institution and
escalations. All people, partners and agreements are fictional. Data is stored in your browser;
**Admin → System → Reset demo data** restores the seed.

## What's included

All 16 screens in PRD section 8: sign in, home, my tasks, CP list and detail, the 6-step new
agreement wizard, draft preview, deviation panel, agreement detail, signed copy upload, Gate 2
verification, renewal, termination, reports, admin console and audit log. Also:

- Two-gate lifecycle with mandatory comments on rejection, SLA due dates, reminders, escalations,
  renewal tasks at 60 days and auto-expiry (a scheduler runs in the browser)
- Role permissions and institution scope enforced in the mock API on every call
- Masked PAN, GSTIN and bank account with logged "Reveal"; nothing sensitive in notifications
- Template editor: clauses, merge fields and Annexure-B, versioned with Legal approval (maker-checker)
- Versioned rate cards, per-CP deviations, legacy Excel import, seven reports with Excel export
- Responsive from 360px phones to wide desktops; WCAG AA contrast and keyboard support

## Not represented (prototype limits)

- **Sign-in**: Google / Microsoft SSO is simulated with an account picker; no real OIDC.
- **Documents**: the agreement renders as HTML from the template; "DOCX" is a Word-compatible HTML
  file and the PDF comes from the browser's print dialog. Production would use docxtemplater and
  LibreOffice. Uploaded `.docx` templates are stored but not parsed.
- **Storage and security**: files live in IndexedDB, not encrypted object storage; no field-level
  encryption, signed download links or real 8-year retention purge workflow.
- **Notifications**: email and the 9:00 IST digest go to an in-app outbox (Admin → System);
  WhatsApp is a phase-2 placeholder.
- **KYC checks**: the "unmasked Aadhaar" warning is a file-name heuristic, not OCR.
- **Phase 2 and 3** (bulk addendums, PAN / penny-drop APIs, CP portal, e-sign) are out of scope.

## Project structure

```
src/
  services/      mock backend: api/*, seed-backed store, scheduler, notifications
  lib/           domain helpers: permissions, statuses, schemas, template rendering
  components/    ui/ (design system), layout/ (app shell), shared domain components
  pages/         one file per screen; admin/ for the admin console
  data/seed.ts   seed data (relative to today, so SLAs and expiries always look live)
```
