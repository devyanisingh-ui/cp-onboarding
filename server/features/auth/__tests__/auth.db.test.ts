import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../platform/db';
import { handleRpc } from '../../../platform/rpc';
import '../../index';
import { hashPassword, IDLE_MS, LOCK_AFTER_FAILURES, MAX_SESSION_MS, SESSION_COOKIE } from '../service';
import { addUser } from '../../../test/helpers';

const PASSWORD = 'Apeejay@123';

/** One browser: keeps the session cookie between calls, like the real app. */
function browser() {
  let session: string | undefined;
  const call = async (name: string, ...args: unknown[]) => {
    const res = await handleRpc(
      name,
      new Request(`http://x/api/rpc/${name}`, {
        method: 'POST',
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', ...(session ? { cookie: `${SESSION_COOKIE}=${session}` } : {}) },
        body: JSON.stringify({ args }),
      }),
    );
    for (const c of res.headers.getSetCookie()) {
      const value = c.match(new RegExp(`^${SESSION_COOKIE}=([^;]*)`))?.[1];
      if (value !== undefined) session = value || undefined;
    }
    const body = (await res.json()) as { result?: unknown; error?: string };
    return { status: res.status, result: body.result, error: body.error, cookies: res.headers.getSetCookie() };
  };
  return { call, get token() { return session; } };
}

async function staff(id: string, email: string, roles: ('bd_exec' | 'legal' | 'admin')[] = ['bd_exec'], password: string | null = PASSWORD) {
  const user = await addUser({ id, email, roles, name: id });
  if (password) await prisma.credential.create({ data: { userId: id, passwordHash: await hashPassword(password) } });
  return user;
}

const lastEmail = async () => prisma.emailMessage.findFirst({ orderBy: { id: 'desc' } });
const linkToken = (link?: string | null) => link?.replace('/set-password/', '') ?? '';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('signing in', () => {
  it('signs in by username or work email, sets a secure session cookie, and identifies later requests', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    const b = browser();
    const signIn = await b.call('auth.signIn', 'Kavya.Iyer', PASSWORD);
    expect(signIn).toMatchObject({ status: 200, result: { id: 'u-kavya', roles: ['bd_exec'] } });
    expect(signIn.cookies[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=[\\w-]{43}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_SESSION_MS / 1000}`));
    expect((await b.call('auth.currentUser')).result).toMatchObject({ id: 'u-kavya' });
    // Only a hash of the cookie is stored.
    expect(await prisma.session.findFirst()).toMatchObject({ userId: 'u-kavya', device: 'Chrome · Windows' });
    expect((await prisma.session.findFirst())!.id).not.toBe(b.token);
    expect(await prisma.auditEvent.findFirst()).toMatchObject({ action: 'login', actorId: 'u-kavya', summary: 'Signed in with username and password' });

    expect((await browser().call('auth.signIn', 'kavya.iyer@apeejay.edu', PASSWORD)).status).toBe(200);
  });

  it('gives the same answer for an unknown username and a wrong password', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    const wrong = await browser().call('auth.signIn', 'kavya.iyer', 'not-the-password');
    const unknown = await browser().call('auth.signIn', 'nobody', PASSWORD);
    expect([wrong.status, wrong.error]).toEqual([401, 'Incorrect username or password.']);
    expect([unknown.status, unknown.error]).toEqual([401, 'Incorrect username or password.']);
    expect(await browser().call('auth.signIn', '  ', PASSWORD)).toMatchObject({ status: 422, error: 'Enter your username.' });
    // A user without a password yet cannot sign in either.
    await staff('u-new', 'new.person@apeejay.edu', ['bd_exec'], null);
    expect((await browser().call('auth.signIn', 'new.person', PASSWORD)).status).toBe(401);
  });

  it('refuses a deactivated user even with the right password', async () => {
    await staff('u-old', 'old.user@apeejay.edu');
    await prisma.user.update({ where: { id: 'u-old' }, data: { active: false } });
    expect(await browser().call('auth.signIn', 'old.user', PASSWORD)).toMatchObject({ status: 403, error: 'Your access has been deactivated. Contact the central Admin team.' });
  });

  it(`locks the account for 15 minutes after ${LOCK_AFTER_FAILURES} wrong passwords, even for the right one`, async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    for (let i = 0; i < LOCK_AFTER_FAILURES; i++) expect((await browser().call('auth.signIn', 'kavya.iyer', `wrong-${i}`)).status).toBe(401);
    const locked = await browser().call('auth.signIn', 'kavya.iyer', PASSWORD);
    expect(locked).toMatchObject({ status: 429, error: 'Too many failed attempts. Try again in 15 minutes, or reset your password.' });
    expect(await prisma.auditEvent.findFirst({ where: { action: 'lockout' } })).toMatchObject({ actorId: 'u-kavya' });
    // After the lock passes, the right password works and the count starts again.
    await prisma.credential.update({ where: { userId: 'u-kavya' }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await browser().call('auth.signIn', 'kavya.iyer', PASSWORD)).status).toBe(200);
    expect(await prisma.credential.findUnique({ where: { userId: 'u-kavya' } })).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });
});

describe('sessions', () => {
  it('signing out ends the session for good', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    const b = browser();
    await b.call('auth.signIn', 'kavya.iyer', PASSWORD);
    const stolen = b.token;
    const out = await b.call('auth.signOut');
    expect(out.cookies[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=; .*Max-Age=0`));
    expect(await prisma.session.findFirst()).toMatchObject({ endReason: 'manual', endedAt: expect.any(Date) });
    // The old cookie no longer works.
    const replay = await handleRpc('auth.currentUser', new Request('http://x', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${stolen}` }, body: '{"args":[]}' }));
    expect(await replay.json()).toEqual({ result: null });
    // Signing out twice, or while signed out, is harmless.
    expect((await b.call('auth.signOut')).status).toBe(200);
  });

  it('ends a session after 30 minutes without a request, and after 12 hours in any case', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    const b = browser();
    await b.call('auth.signIn', 'kavya.iyer', PASSWORD);
    await prisma.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - IDLE_MS - 1000) } });
    expect((await b.call('auth.currentUser')).result).toBeNull();
    expect(await prisma.session.findFirst()).toMatchObject({ endReason: 'timeout' });

    const c = browser();
    await c.call('auth.signIn', 'kavya.iyer', PASSWORD);
    await prisma.session.updateMany({ where: { endedAt: null }, data: { createdAt: new Date(Date.now() - MAX_SESSION_MS - 1000) } });
    expect((await c.call('auth.currentUser')).result).toBeNull();
  });

  it('signs out a user the moment they are deactivated', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    const b = browser();
    await b.call('auth.signIn', 'kavya.iyer', PASSWORD);
    await prisma.user.update({ where: { id: 'u-kavya' }, data: { active: false } });
    expect((await b.call('auth.currentUser')).result).toBeNull();
    expect(await prisma.session.findFirst()).toMatchObject({ endReason: 'deactivated' });
  });
});

describe('setting a password', () => {
  it('Admin invites a user, who sets a password from the emailed link and can then sign in', async () => {
    await staff('u-arjun', 'arjun.mehta@apeejay.edu', ['admin']);
    await staff('u-new', 'neha.kapoor@apeejay.edu', ['bd_exec'], null);
    const admin = browser();
    await admin.call('auth.signIn', 'arjun.mehta', PASSWORD);
    expect((await admin.call('auth.inviteUser', 'u-new')).status).toBe(200);
    const email = await lastEmail();
    expect(email).toMatchObject({ to: 'neha.kapoor@apeejay.edu', subject: 'You have been invited to CP Onboarding', link: expect.stringMatching(/^\/set-password\/[\w-]{43}$/) });

    const neha = browser();
    expect(await neha.call('auth.setPassword', linkToken(email!.link), 'neha')).toMatchObject({ status: 422, error: 'Use at least 10 characters.' });
    expect(await neha.call('auth.setPassword', linkToken(email!.link), 'neha.kapoor-2026')).toMatchObject({ status: 422, error: 'Your password must not contain your username.' });
    expect((await neha.call('auth.setPassword', linkToken(email!.link), 'Rainy-Window-42')).status).toBe(200);
    expect((await neha.call('auth.signIn', 'neha.kapoor', 'Rainy-Window-42')).status).toBe(200);
    // The link works once.
    expect(await browser().call('auth.setPassword', linkToken(email!.link), 'Another-Pass-77')).toMatchObject({ status: 422, error: 'This link has expired or was already used. Ask for a new one.' });
  });

  it('only Admin can send invitations', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    const b = browser();
    await b.call('auth.signIn', 'kavya.iyer', PASSWORD);
    expect((await b.call('auth.inviteUser', 'u-kavya')).status).toBe(403);
    expect((await browser().call('auth.inviteUser', 'u-kavya')).status).toBe(401);
  });

  it('forgot password: emails a one-hour link, reveals nothing about unknown users, and signs out other browsers', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    const laptop = browser();
    await laptop.call('auth.signIn', 'kavya.iyer', PASSWORD);

    expect((await browser().call('auth.requestPasswordReset', 'nobody')).status).toBe(200);
    expect(await prisma.emailMessage.count()).toBe(0);

    expect((await browser().call('auth.requestPasswordReset', 'kavya.iyer')).status).toBe(200);
    expect((await browser().call('auth.requestPasswordReset', 'kavya.iyer')).status).toBe(200);
    expect(await prisma.emailMessage.count()).toBe(1); // one email per 5 minutes
    const email = await lastEmail();
    expect(email).toMatchObject({ subject: 'Reset your CP Onboarding password', body: expect.stringContaining('expires in 60 minutes') });

    expect((await browser().call('auth.setPassword', linkToken(email!.link), 'Sunny-Garden-58')).status).toBe(200);
    expect((await laptop.call('auth.currentUser')).result).toBeNull();
    expect((await browser().call('auth.signIn', 'kavya.iyer', PASSWORD)).status).toBe(401);
    expect((await browser().call('auth.signIn', 'kavya.iyer', 'Sunny-Garden-58')).status).toBe(200);
  });

  it('refuses an expired link', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    await browser().call('auth.requestPasswordReset', 'kavya.iyer');
    await prisma.passwordLink.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await browser().call('auth.setPassword', linkToken((await lastEmail())!.link), 'Sunny-Garden-58')).status).toBe(422);
  });
});

describe('demo helpers', () => {
  it('lists no accounts and refuses persona switching unless DEMO_ACCOUNTS=on', async () => {
    await staff('u-kavya', 'kavya.iyer@apeejay.edu');
    await staff('u-priya', 'priya.sharma@apeejay.edu', ['legal']);
    const b = browser();
    await b.call('auth.signIn', 'kavya.iyer', PASSWORD);
    expect((await b.call('auth.demoAccounts')).result).toEqual([]);
    expect((await b.call('auth.switchPersona', 'u-priya')).status).toBe(403);

    vi.stubEnv('DEMO_ACCOUNTS', 'on');
    expect(((await b.call('auth.demoAccounts')).result as { username: string }[]).map((a) => a.username)).toEqual(['kavya.iyer', 'priya.sharma']);
    expect((await b.call('auth.switchPersona', 'u-priya')).result).toMatchObject({ id: 'u-priya' });
    expect((await b.call('auth.currentUser')).result).toMatchObject({ id: 'u-priya' });
  });
});
