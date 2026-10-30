# CP Onboarding

Front-end prototype of the Apeejay **Channel Partner (CP) Onboarding** app, built from the PRD
("PRD – CP Onboarding App", Sep 2026). Staff create, approve, sign, verify and renew CP
agreements across Apeejay institutions.

Built with **Next.js** (App Router) and React. The data still lives in the browser: an in-browser
mock data layer (`src/services/mockApi.ts`) with seed data and simulated latency stands in for the
API, shaped like the PRD's section 4 entities so it can be swapped for a real backend later. The
only server code today is the email relay (`app/api/send-email/route.ts`).

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173 and use **Sign in with Google** (simulated). The role switcher in the
header lets you view the app as each persona.

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js development server on port 5173 |
| `npm run build` | Production build in `.next/` (installable PWA) |
| `npm start` | Serve the production build on port 5173 |
| `npm test` | Workflow tests (Vitest) against the mock API |
| `npm run typecheck` | TypeScript check |

To try it on a phone on the same Wi-Fi: open the Network address `npm run dev` prints.

## Database (MySQL, in progress)

The move from the in-browser mock to MySQL (via Prisma) is being built feature by feature under
`server/`; the app keeps using the mock until every feature is done. To work on it:

```bash
npm run db:up        # MySQL 8.4 in Docker (compose.yaml), with a separate test database
npm run db:migrate   # apply migrations to the local database
npx prisma db seed   # demo institutions, users (password Apeejay@123), rate cards, templates
npm run test:db      # server tests against MySQL
```

Step-by-step testing guide (Docker Desktop on Windows): [docs/testing-with-docker.md](docs/testing-with-docker.md).

`server/platform/` is the shared foundation (connection, transactions, readable IDs, audit trail,
tasks, notifications, email outbox, RPC at `/api/rpc/<feature>.<function>`). Each feature gets its
own folder in `server/features/` with its Prisma models, server functions and tests.

Done so far: **auth** (`server/features/auth/`): argon2id passwords, session cookies stored as
hashes in MySQL (signed out after 30 minutes idle or 12 hours), lockout for 15 minutes after 5 wrong
passwords, and one-time emailed links to set a password (Admin invitation, 24 h; "forgot
password", 1 h).

**config** (`server/features/config/`): institutions and campuses, users with their roles and
institutions, approval routing, SLAs, master lists, allowed domains, and the versioned rate cards
and templates (Admin drafts, Legal approves, Admin publishes; status changes are checked in the
database so two people cannot move the same version at once). Importing a Word document as a
template comes with the documents feature.

## Email notifications (Resend)

By default emails only go to the simulated outbox (Admin → System). To send them for real:

1. Create an API key at [resend.com](https://resend.com) and, for real recipients, verify your sending domain.
2. Copy `.env.example` to `.env` and fill it in. Keep `EMAIL_REDIRECT_TO` set while testing: the demo users' addresses are not real.
3. Restart `npm run dev`.

Every email the app writes to its outbox is then sent through Resend: new tasks, reminders,
escalations, notices (approvals, returns, activations…), the Legal/Admin daily digest, and signing links
and contact-verification links to CPs. Each outbox entry shows whether Resend accepted it.

The API key lives only on the server: the app POSTs to `/api/send-email`, the Next.js route handler
[`app/api/send-email/route.ts`](app/api/send-email/route.ts) around
[`server/sendEmail.ts`](server/sendEmail.ts). In production set the same variables on the host, with
`APP_URL` as the deployed address. The relay accepts only the email kinds above, a fixed sender and
links inside the app, but it has no sign-in check yet, so add one before it faces the internet.
`NEXT_PUBLIC_EMAIL_DELIVERY` was called `VITE_EMAIL_DELIVERY` before the move to Next.js; the old
name still works.

Because all data lives in each browser, reminders and escalations fire from whichever browser runs
the scheduler, and a fresh browser sends the reminders for the seeded overdue tasks once.

## CP contact verification

The CP confirms that the email and mobile on their record reach them. It starts by itself when an
agreement goes to Legal and runs **alongside** Legal's review: it never holds the agreement up, and
Legal sees its status on the review screen. A BD Executive can also send or resend it from the
agreement or CP page (*Contact verification* card).

1. The CP gets an email with a personal link (`/verify/<token>`, valid 7 days).
2. On that page they press **This is my email** (email verified), then **Send me a code** and type
   the 6-digit code sent to their mobile (mobile verified). Codes last 10 minutes, a new one can be
   sent every 30 seconds (at most 5 an hour), and 5 wrong tries end a code.
3. The BD Executive (and Legal, if reviewing) are notified; the card shows both as **Verified**.
   Changing the CP's email or mobile later makes that one unverified again.

No SMS provider is connected yet: codes go to the **SMS outbox** in Admin → System (like emails
go to the email outbox when Resend is not set up). Only a hash of each code is stored. To send
real texts, connect an SMS provider (in India this needs DLT registration of the sender ID and
template).

## Leads and revenue per CP

The CP page has a **Leads & revenue** tab: per institution, the leads the CP referred, how many
applied and were admitted, conversion, and **revenue** (fees of admitted students), plus the lead
list. Figures come from the CRM: a sync pulls leads every hour (and on **Sync now** in Admin →
System), matches each to a CP by its CRM partner code (default: the CP ID) and to an institution by
short code, and stores **no personal data** — only the CRM's lead ID, programme, admission cycle,
status, dates and fee. Users see the institutions in their scope.

Only **Admin** changes anything: correct a lead (status, fee, with a reason; kept across syncs
until removed, audit-logged) or set a CP's CRM partner code.

The CRM is not connected yet: a **demo CRM** (`src/services/crm/demoCrm.ts`) supplies sample leads
through the same connector interface (`src/services/crm/connector.ts`). Connecting the real CRM
means writing its connector (its API, credentials and field mapping) — nothing else changes.

## Demo personas

| Role | Account | What they do |
| --- | --- | --- |
| BD Executive | Kavya Iyer | Creates CPs and agreements, requests deviations, gets corrected documents from the CP, sends for signature or uploads signed copies, renewals and terminations |
| Legal | Priya Sharma | Reviews every agreement and its KYC documents (and can send documents back for the CP to correct); decides deviations; approves template and rate card versions |
| Admin | Arjun Mehta | Final approval of signed agreements, plus everything else: Gate 2 for legacy scans, confirming non-renewals and terminations |

Every agreement goes **BD → signing → Legal → Admin**. The BD Executive fills in the agreement and
KYC, then gets it signed: by e-signature, or on paper and uploaded. The signed agreement goes to
Legal for review: Legal checks the CP's details (name, contact, and each KYC detail against its
document) and marks each Verified or Mismatch. Mismatches go back to the BD Executive with a remark on
each; the BD corrects the CP details or uploads a corrected document from the CP, and sends it back
to Legal, who re-checks only what it flagged (no re-signing needed). Legal then
approves it, and Admin's final approval makes it Active. If Legal or Admin rejects it, it goes back
to Draft and must be signed again. All people, partners and agreements are fictional. Data is stored in
your browser; **Admin → System → Reset demo data** restores the seed.

## What's included

All 16 screens in PRD section 8: sign in, home, my tasks, CP list and detail, the 6-step new
agreement wizard, draft preview, deviation panel, agreement detail, signed copy upload, Gate 2
verification, renewal, termination, reports, admin console and audit log. Also:

- Lifecycle with Legal review (Gate 1), Admin final approval and Admin verification of legacy
  scans (Gate 2), a CP-details correction loop (Legal flags mismatches, the BD corrects them), mandatory comments on rejection, SLA due dates, reminders, escalations,
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
app/             Next.js routes: one folder per URL, each page.tsx renders a screen from src/screens
  (app)/         pages behind sign-in, sharing the app shell (layout.tsx)
  api/           server route handlers (the email relay)
src/
  services/      mock backend: api/*, seed-backed store, scheduler, notifications
  lib/           domain helpers: permissions, statuses, schemas, template rendering
  components/    ui/ (design system), layout/ (app shell), navigation and route guards
  screens/       one file per screen; admin/ for the admin console
  data/seed.ts   seed data (relative to today, so SLAs and expiries always look live)
```
