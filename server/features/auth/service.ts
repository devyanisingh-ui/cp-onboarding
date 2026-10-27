import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { Role, User } from '@/types';
import { can } from '@/lib/permissions';
import { usernameOf } from '@/lib/users';
import { ApiError, forbidden, invalid, notFound } from '@/services/errors';
import { audit } from '../../platform/audit';
import { cookie, ctx, db, inTransaction, now, requestInfo, setCookie } from '../../platform/context';
import { prisma } from '../../platform/db';
import { sendEmail } from '../../platform/email';
import { loadUser } from '../../platform/users';

export const SESSION_COOKIE = 'cp_session';
/** Signed out after this long without a request (the sign-in page promises 30 minutes). */
export const IDLE_MS = 30 * 60 * 1000;
/** Signed out after this long whatever happens, so a stolen cookie stops working. */
export const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const minutes = (ms: number) => Math.round(ms / 60_000);

/** argon2id at the OWASP-recommended cost (19 MiB, 2 passes). */
export function hashPassword(password: string): Promise<string> {
  return hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

// Checked when the username is unknown, so a wrong username takes as long as a wrong password.
let decoy: Promise<string> | undefined;

function sessionCookie(token: string, maxAgeMs: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

function clearSessionCookie() {
  setCookie(sessionCookie('', 0));
}

async function findByUsername(username: string) {
  const value = username.trim().toLowerCase();
  // Username = the part of the work email before "@", or the whole email.
  const candidates = await db().user.findMany({
    where: { OR: [{ email: value }, { email: { startsWith: `${value}@` } }] },
    include: { roles: true, credential: true },
  });
  return candidates.find((u) => usernameOf(u) === value || u.email.toLowerCase() === value);
}

/** Username + password sign-in (same name and arguments as the browser mock). Starts a session cookie. */
export async function passwordSignIn(username: string, password: string): Promise<User> {
  if (!username.trim()) throw invalid('Enter your username.');
  if (!password) throw invalid('Enter your password.');
  const row = await findByUsername(username);
  const cred = row?.credential;
  const at = now();
  if (cred?.lockedUntil && cred.lockedUntil > at) {
    throw new ApiError(429, `Too many failed attempts. Try again in ${Math.max(1, minutes(cred.lockedUntil.getTime() - at.getTime()))} minutes, or reset your password.`);
  }
  const ok = cred ? await verify(cred.passwordHash, password) : (await verify(await (decoy ??= hashPassword(newToken())), password), false);
  if (!row || !cred || !ok) {
    if (row && cred) await recordFailure(row.id, row.name, cred.failedAttempts + 1);
    throw new ApiError(401, 'Incorrect username or password.');
  }
  if (!row.active) throw new ApiError(403, 'Your access has been deactivated. Contact the central Admin team.');
  if (cred.failedAttempts || cred.lockedUntil) await db().credential.update({ where: { userId: row.id }, data: { failedAttempts: 0, lockedUntil: null } });
  const user = (await loadUser(row.id))!;
  await startSession(user, 'Signed in with username and password');
  return user;
}

/**
 * A failed attempt must be counted even though the request then fails (and its transaction rolls
 * back), so it is saved in a transaction of its own.
 */
async function recordFailure(userId: string, name: string, attempts: number) {
  const lock = attempts >= LOCK_AFTER_FAILURES;
  await inTransaction({ user: null, ...requestInfo() }, async () => {
    await db().credential.update({ where: { userId }, data: lock ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedAttempts: attempts } });
    if (lock) await audit({ id: userId, name }, 'lockout', 'session', userId, `Locked for ${minutes(LOCK_MS)} minutes after ${LOCK_AFTER_FAILURES} failed sign-in attempts`);
  });
}

async function startSession(user: User, detail: string) {
  const token = newToken();
  const { ip, device } = requestInfo();
  await db().session.create({ data: { id: sha256(token), userId: user.id, ip, device } });
  setCookie(sessionCookie(token, MAX_SESSION_MS));
  await audit(user, 'login', 'session', user.id, detail);
}

/** Ends this browser's session (same arguments as the browser mock). Safe to call when already signed out. */
export async function signOut(reason: 'manual' | 'timeout' = 'manual'): Promise<void> {
  const token = cookie(SESSION_COOKIE);
  clearSessionCookie();
  if (!token) return;
  const session = await db().session.findUnique({ where: { id: sha256(token) } });
  if (!session || session.endedAt) return;
  await db().session.update({ where: { id: session.id }, data: { endedAt: now(), endReason: reason } });
  const user = await loadUser(session.userId);
  if (user) await audit(user, 'logout', 'session', user.id, reason === 'timeout' ? 'Session ended after 30 minutes of inactivity' : 'Signed out');
}

/** The signed-in user, or null (same as the browser mock). */
export async function currentUser(): Promise<User | null> {
  try {
    return ctx();
  } catch {
    return null;
  }
}

/**
 * Who a session cookie belongs to, for every RPC request. Ends sessions that have been idle for
 * 30 minutes or open for 12 hours, and those of deactivated users. Runs outside the request's
 * transaction, so a request that fails still counts as activity.
 */
export async function resolveSession(cookies: Map<string, string>): Promise<User | null> {
  const token = cookies.get(SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: sha256(token) } });
  if (!session || session.endedAt) return null;
  const at = Date.now();
  const expired = at - session.lastSeenAt.getTime() > IDLE_MS ? 'timeout' : at - session.createdAt.getTime() > MAX_SESSION_MS ? 'expired' : null;
  const user = expired ? null : await loadUser(session.userId, prisma);
  if (!user || !user.active) {
    await prisma.session.update({ where: { id: session.id }, data: { endedAt: new Date(at), endReason: expired ?? 'deactivated' } });
    return null;
  }
  // Writing on every request would be wasteful; a minute's precision is plenty for a 30-minute limit.
  if (at - session.lastSeenAt.getTime() > 60_000) await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(at) } });
  return user;
}

// ---------------- Setting a password (invitation and "forgot password") ----------------

function checkPassword(password: string, user: Pick<User, 'email'>): void {
  if (password.length < MIN_PASSWORD) throw invalid(`Use at least ${MIN_PASSWORD} characters.`, { password: `At least ${MIN_PASSWORD} characters` });
  if (password.length > MAX_PASSWORD) throw invalid(`Use at most ${MAX_PASSWORD} characters.`, { password: `At most ${MAX_PASSWORD} characters` });
  const lower = password.toLowerCase();
  if (lower.includes(usernameOf(user)) || lower.includes(user.email.toLowerCase())) throw invalid('Your password must not contain your username.', { password: 'Must not contain your username' });
}

async function sendPasswordLink(user: Pick<User, 'id' | 'email'>, purpose: 'invite' | 'reset') {
  const token = newToken();
  const ttl = purpose === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS;
  await db().passwordLink.create({ data: { id: sha256(token), userId: user.id, purpose, expiresAt: new Date(Date.now() + ttl) } });
  await sendEmail(user.email, {
    title: purpose === 'invite' ? 'You have been invited to CP Onboarding' : 'Reset your CP Onboarding password',
    body:
      purpose === 'invite'
        ? `The central Admin team has set up your CP Onboarding account. Open the link to choose your password. It works once and expires in ${ttl / 3_600_000} hours.`
        : `Someone asked to reset your password. Open the link to choose a new one. It works once and expires in ${minutes(ttl)} minutes. If it was not you, ignore this email.`,
    link: `/set-password/${token}`,
    kind: 'event',
  });
}

/** Admin: email a staff member a link to choose their password (also re-sends an expired one). */
export async function inviteUser(userId: string): Promise<void> {
  const admin = ctx();
  if (!can(admin, 'config.manage')) throw forbidden();
  const user = await loadUser(userId);
  if (!user) throw notFound('User');
  if (!user.active) throw invalid('This user is deactivated. Reactivate them before sending an invitation.');
  await sendPasswordLink(user, 'invite');
  await audit(admin, 'invite', 'user', user.id, `Sent ${user.name} a link to set their password`);
}

/**
 * "Forgot password". Always answers the same way, so it cannot be used to find out which
 * usernames exist; at most one email per user every 5 minutes.
 */
export async function requestPasswordReset(usernameOrEmail: string): Promise<void> {
  if (!usernameOrEmail.trim()) throw invalid('Enter your username or work email.');
  const row = await findByUsername(usernameOrEmail);
  if (!row || !row.active) return;
  const recent = await db().passwordLink.findFirst({ where: { userId: row.id, purpose: 'reset', createdAt: { gt: new Date(Date.now() - 5 * 60_000) } } });
  if (recent) return;
  await sendPasswordLink(row, 'reset');
  await audit({ id: row.id, name: row.name }, 'request', 'session', row.id, 'Asked for a password reset link');
}

/** Sets the password from an emailed link. Ends every other session the user had. */
export async function setPassword(token: string, password: string): Promise<void> {
  const link = token ? await db().passwordLink.findUnique({ where: { id: sha256(token) } }) : null;
  if (!link || link.usedAt || link.expiresAt < now()) throw invalid('This link has expired or was already used. Ask for a new one.');
  const user = await loadUser(link.userId);
  if (!user || !user.active) throw invalid('This link has expired or was already used. Ask for a new one.');
  checkPassword(password, user);
  const passwordHash = await hashPassword(password);
  await db().credential.upsert({ where: { userId: user.id }, create: { userId: user.id, passwordHash }, update: { passwordHash, passwordSetAt: now(), failedAttempts: 0, lockedUntil: null } });
  // Every open link for this user stops working; so does every signed-in browser.
  await db().passwordLink.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now() } });
  await db().session.updateMany({ where: { userId: user.id, endedAt: null }, data: { endedAt: now(), endReason: 'password' } });
  await audit(user, 'update', 'user', user.id, link.purpose === 'invite' ? 'Set their password from the invitation' : 'Reset their password');
}

// ---------------- Prototype helpers (off unless DEMO_ACCOUNTS=on) ----------------

const demoOn = () => process.env.DEMO_ACCOUNTS === 'on';

/** Accounts listed on the sign-in screen. Only for demo and staging data: it lists every username. */
export async function demoAccounts(): Promise<(Pick<User, 'id' | 'name' | 'email' | 'designation' | 'roles'> & { username: string })[]> {
  if (!demoOn()) return [];
  const rows = await db().user.findMany({ where: { active: true }, include: { roles: true }, orderBy: { name: 'asc' } });
  return rows.map(({ id, name, email, designation, roles }) => ({ id, name, email, designation, roles: roles.map((r) => r.role as Role), username: usernameOf({ email }) }));
}

/** Reviewer role switcher: sign in as another demo account. Refused unless DEMO_ACCOUNTS=on. */
export async function switchPersona(userId: string): Promise<User> {
  if (!demoOn()) throw forbidden('Switching accounts is only available with demo data.');
  ctx();
  const user = await loadUser(userId);
  if (!user || !user.active) throw invalid('That account is not available.');
  await signOut();
  await startSession(user, 'Switched persona (prototype)');
  return user;
}
