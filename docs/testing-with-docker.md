# Testing the MySQL backend with Docker Desktop

A step-by-step guide for Windows (PowerShell). The same commands work on macOS and Linux.

> **What you are testing.** The move from the in-browser mock to MySQL is being built feature by
> feature on the branch `claude/awesome-hawking-3djyrr`. The app's screens still use the mock until
> every feature is done, so for now the database is tested **through the server**: automated
> tests, a quick API check, and by browsing the tables. Clicking around the app does not touch
> MySQL yet.

| Feature | On MySQL | What to try |
| --- | --- | --- |
| Foundation | Yes | IDs, transactions, audit log, tasks, notifications, email outbox |
| Auth & sessions | Yes | Sign in / out, wrong password, lockout, session timeout, password links |
| Admin config | Yes | Institutions, users, routing, SLAs, lists, domains, rate cards, templates |
| Documents, CPs, agreements, … | Not yet | Still in the browser mock |

---

## Where things run

You will use up to four places. Each step below starts with a **Where:** line naming one of them.

| Name in this guide | What it is | How to open it |
| --- | --- | --- |
| **Docker Desktop** | The Docker app (runs MySQL in the background) | Start menu → *Docker Desktop*. Leave it open. |
| **Window 1 — commands** | A PowerShell window **in the project folder** | See *Opening PowerShell in the project folder* below |
| **Window 2 — app** | A second PowerShell window in the project folder, for `npm run dev`. It stays busy while the app runs: don't type other commands in it. | Same as Window 1 (open another one) |
| **Browser** | Chrome / Edge | Opens by itself for Prisma Studio (Step 8) |

**Opening PowerShell in the project folder.** Any of these works:

- **File Explorer:** open the `cp-onboarding` folder, click the address bar, type `powershell` and
  press Enter.
- **VS Code:** *File → Open Folder…* → `cp-onboarding`, then *Terminal → New Terminal*. Use the
  **+** in the terminal panel for a second one.
- **Start menu → PowerShell**, then paste the block from Step 2 to move into the folder.

Check the prompt before every command: it must end in `\cp-onboarding>` (for example
`PS C:\Users\user\Documents\cp-onboarding>`). If it ends in just your user name (for example
`PS C:\Users\user>`), you are in the wrong folder and the commands will fail with *not a git repository* or *Could not read package.json*.

---

## Step 1 — Install the tools (once)

**Where:** your web browser to download the installers; then **any** PowerShell window to check them
(the folder doesn't matter yet).


1. **Node.js 22** (LTS) from <https://nodejs.org>. Check in PowerShell:
   ```powershell
   node -v      # v22.x
   ```
2. **Git** from <https://git-scm.com>.
3. **Docker Desktop** from <https://www.docker.com/products/docker-desktop>. During set-up keep
   **"Use WSL 2"** ticked. Start Docker Desktop and wait until it says **Engine running**. Check:
   ```powershell
   docker version     # shows both Client and Server
   ```

## Step 2 — Get the code

**Where:** a PowerShell window opened from the Start menu (you may not know the folder yet). At the
end of this step it **becomes Window 1**: keep it open.

All later commands must run **inside the project folder**. Your PowerShell prompt shows where you
are: it should end in `\cp-onboarding>`, not just your user name (`PS C:\Users\user>`).

Paste this block **as it is** (nothing to edit). It finds the project folder under your user
folder and moves into it; if there is no copy on this PC yet, it downloads one first:

```powershell
$p = Get-ChildItem -Path $HOME -Directory -Recurse -Depth 4 -Filter cp-onboarding -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } | Select-Object -First 1
if ($p) { Set-Location $p.FullName } else { Set-Location $HOME; git clone https://github.com/devyanisingh-ui/cp-onboarding.git; Set-Location cp-onboarding }
Get-Location
```

The last line prints the folder you are now in: it must end in `\cp-onboarding`.

**Then** switch to the branch with the database work and install:

```powershell
git fetch origin
git checkout claude/awesome-hawking-3djyrr
git pull
npm install
```

`npm install` also prepares the database client (you will see `Generated Prisma Client`).

If you see `fatal: not a git repository` or `Could not read package.json`, you are not in the
project folder: paste the block above again.

## Step 3 — Start MySQL

**Where:** **Docker Desktop** must be open and show *Engine running*. Type the command in
**Window 1** (project folder).

```powershell
npm run db:up
```

This starts MySQL 8.4 in Docker (defined in `compose.yaml`) with two databases:
`cp_onboarding` for the app and `cp_onboarding_test` for the automated tests. It waits until the
database is ready and ends with:

```
 Container cp-onboarding-mysql-1 Healthy
```

The first run downloads the MySQL image (a few hundred MB). In Docker Desktop you will now see a
container **cp-onboarding-mysql-1** under *Containers*.

No `.env` settings are needed: the project's default connection is
`mysql://cp:cp_local@127.0.0.1:3306/cp_onboarding`, which matches this container.

## Step 4 — Create the tables

**Where:** **Window 1** (project folder).

```powershell
npm run db:migrate
```

On a new database this creates every table and ends with:

```
The following migration(s) have been applied:
  └─ 20261026124817_foundation/
  └─ 20261027052926_auth/
  └─ 20261027054703_config/
Your database is now in sync with your schema.
✔ Generated Prisma Client
```

Run it again after every `git pull`: new features bring new migrations.

## Step 5 — Load the demo data

**Where:** **Window 1** (project folder).

```powershell
npx prisma db seed
```

Expected:

```
Seeded 10 institutions, 3 users (password Apeejay@123), 12 rate cards, 7 templates.
```

The demo accounts are the same as in the prototype:

| Username | Role | Password |
| --- | --- | --- |
| `kavya.iyer` | BD Executive | `Apeejay@123` |
| `priya.sharma` | Legal | `Apeejay@123` |
| `arjun.mehta` | Admin | `Apeejay@123` |

Seeding is safe to run again; it only adds what is missing.

## Step 6 — Run the automated tests

**Where:** **Window 1** (project folder). The app does not need to be running.

```powershell
npm run test:db
```

These run against the real MySQL in the `cp_onboarding_test` database (wiped before every test, so
your demo data is not touched). Expected:

```
 ✓ |db| server/platform/__tests__/platform.db.test.ts (13 tests)
 ✓ |db| server/features/auth/__tests__/auth.db.test.ts (12 tests)
 ✓ |db| server/features/config/__tests__/config.db.test.ts (13 tests)
      Tests  38 passed (38)
```

They cover, among others: readable IDs under simultaneous requests, a failed request leaving
nothing behind, email only after a successful save, sign-in and lockout, session timeouts,
invitation and reset links, every Admin setting, and the rate card and template approval steps
(including two people deciding at the same moment).

The app's own tests (no database) still run with `npm test` (43 tests).

## Step 7 — Check the running server

**Where:** two windows, both in the project folder.

1. In **Window 2**, start the app and leave it running (it prints `Ready` and then keeps going;
   that is normal):
   ```powershell
   npm run dev
   ```
2. Back in **Window 1**, run the check:
   ```powershell
   npm run smoke:api
   ```

This signs in as each demo user through the real API and checks what each role may see. It only
signs in and out and reads data. Expected (shortened):

```
PASS  Server reaches MySQL
PASS  Signed out: data is refused  (Your session has ended. Please sign in again.)
PASS  Wrong password is refused  (Incorrect username or password.)
PASS  kavya.iyer: signs in  (Kavya Iyer)
PASS  kavya.iyer: cannot open Admin settings  (You do not have permission to do this.)
...
PASS  arjun.mehta: can open Admin settings
PASS  arjun.mehta: signs out

All checks passed.
```

## Step 8 — Look inside the database

**Where:** **Window 1** (project folder). Studio keeps that window busy while it runs; press
**Ctrl + C** there to close it when you are done (or open a third PowerShell window for it).

```powershell
npx prisma studio
```

A page opens in your **browser** with every table. Useful ones:

- **User**, **UserRole**, **UserInstitution** — the demo staff and what they can access.
- **Session** — one row per signed-in browser (re-run Step 7 and refresh: new rows appear, each
  ended with reason `manual`).
- **AuditEvent** — every sign-in, sign-out and change, with who, when, IP and device.
- **Institution**, **Location**, **RateCard**, **TemplateVersion**, **RoutingRule**, **Setting**.

Studio can edit data too; changes are real.

## Step 9 (optional) — Try things by hand

**Where:** **Window 2** must still be running `npm run dev`. Type these lines in **Window 1**
(any folder works for this step, but Window 1 is simplest). Paste the first block once; then run
the `Call` lines one at a time.

```powershell
$api = "http://localhost:5173/api/rpc"
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
function Call($name, $argsJson = "[]") {
  Invoke-RestMethod -Method Post -Uri "$api/$name" -ContentType "application/json" -Body "{`"args`":$argsJson}" -WebSession $s
}

Call "auth.signIn" '["arjun.mehta","Apeejay@123"]'                       # sign in (cookie kept in $s)
(Call "config.lookups").result.institutions | Select-Object shortCode, legalName
(Call "config.rateCards" '["inst-asu"]').result | Select-Object id, version, status
Call "auth.signOut"
```

A refused call shows as a red error in PowerShell; the server's message is in the error text.

Things worth trying (these **do** change the demo data; see *Start again* below):

- **Approval flow.** As `arjun.mehta`: `Call "config.publishRateCard" '["rc-asu-3"]'` is refused
  ("Legal must approve…"). Sign in as `priya.sharma` and run
  `Call "config.decideRateCard" '["rc-asu-3","approve"]'`; then as Arjun the publish works. Watch
  the new **Task**, **Notification** and **AuditEvent** rows in Prisma Studio.
- **Lockout.** Sign in as `kavya.iyer` with a wrong password 5 times; the 6th attempt, even with
  the right password, says "Too many failed attempts. Try again in 15 minutes…". To unlock early,
  clear `lockedUntil` on her row in the **Credential** table in Prisma Studio.

## Start again

**Where:** **Window 1** (project folder). To stop the app, press **Ctrl + C** in **Window 2**.

- **Stop MySQL** (data is kept): `docker compose stop`
- **Start it again:** `npm run db:up`
- **Wipe everything and rebuild:**
  ```powershell
  docker compose down -v      # deletes the database volume
  npm run db:up
  npm run db:migrate
  npx prisma db seed
  ```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm run db:up`: *error during connect* / *cannot find the file specified* | Docker Desktop is not running. Start it and wait for **Engine running**. |
| `npm run db:up`: *port is already allocated* / *3306* in use | A MySQL installed on Windows is using port 3306. Stop it (Start → *Services* → MySQL → Stop), then retry. |
| `db:migrate` or tests: *Can't reach database server at 127.0.0.1:3306* | MySQL is not running: `npm run db:up`. |
| `npm run test:db`: *Could not prepare the test database* | Same as above. The `cp_onboarding_test` database is created the first time the container starts; if you created the container before pulling this branch, run `docker compose down -v` and `npm run db:up`. |
| `smoke:api`: *Cannot reach http://localhost:5173* | Start the app with `npm run dev` in **Window 2** and wait for `Ready`. |
| *not a git repository* / *Could not read package.json* / *Missing script* | The window is not in the project folder. Check the prompt ends in `\cp-onboarding>` (see *Where things run*). |
| Typing in Window 2 does nothing | It is busy running the app. Use Window 1, or press Ctrl + C in Window 2 to stop the app first. |
| `smoke:api`: a sign-in fails | Load the demo data (Step 5). If Kavya was locked by Step 9, wait 15 minutes or clear `lockedUntil` in Prisma Studio. |
| Errors mentioning an unknown field or table after `git pull` | Run `npm run db:migrate` (new migrations), then retry. |
