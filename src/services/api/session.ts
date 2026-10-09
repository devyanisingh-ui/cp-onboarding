import type { Role, User } from '@/types';
import { emailDomainAllowed } from '@/lib/validation';
import { ApiError, invalid } from '../errors';
import { resetDb } from '../db';
import { clearBlobs } from '../blobStore';
import { assertCan, audit, commit, ctx, delay, getDb, getSessionUserId, setSessionUserId } from './core';
import { runScheduledJobs } from './scheduler';

export type SsoProvider = 'google' | 'microsoft';

/**
 * Mock of the OpenID Connect sign-in. The real build redirects to Google/Microsoft and receives
 * a verified email; access requires an Admin-allowed domain AND a user record with roles.
 */
export async function ssoSignIn(provider: SsoProvider, email: string): Promise<User> {
  await delay('write');
  const d = getDb();
  const value = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw invalid('Enter a valid work email.');
  if (!emailDomainAllowed(value, d.settings.allowedDomains))
    throw new ApiError(403, `${value.split('@')[1]} is not an Apeejay domain. Sign in with your Apeejay Google Workspace or Microsoft 365 account.`);
  const user = d.users.find((u) => u.email.toLowerCase() === value);
  if (!user) throw new ApiError(403, 'Your Apeejay account is not set up in CP Onboarding yet. Ask the central Admin team to add you.');
  if (!user.active) throw new ApiError(403, 'Your access has been deactivated. Contact the central Admin team.');
  setSessionUserId(user.id);
  audit(user, 'login', 'session', user.id, `Signed in with ${provider === 'google' ? 'Google' : 'Microsoft'}`);
  commit();
  runScheduledJobs();
  return structuredClone(user);
}

export async function signOut(reason: 'manual' | 'timeout' = 'manual'): Promise<void> {
  const id = getSessionUserId();
  const user = id ? getDb().users.find((u) => u.id === id) : undefined;
  if (user) {
    audit(user, 'logout', 'session', user.id, reason === 'timeout' ? 'Session ended after 30 minutes of inactivity' : 'Signed out');
    commit();
  }
  setSessionUserId(null);
}

export function currentUser(): User | null {
  try {
    return structuredClone(ctx());
  } catch {
    return null;
  }
}

/** Accounts shown in the mock SSO account picker (prototype only). */
export function demoAccounts(): Pick<User, 'id' | 'name' | 'email' | 'designation' | 'roles'>[] {
  return getDb()
    .users.filter((u) => u.active)
    .map(({ id, name, email, designation, roles }) => ({ id, name, email, designation, roles }));
}

/** Primary persona per role for the reviewer role switcher (PRD Appendix A). */
export const PERSONAS: Record<Role, string> = {
  bd_exec: 'u-neha',
  legal: 'u-priya',
  admin: 'u-arjun',
};

export async function switchPersona(userId: string): Promise<User> {
  const user = getDb().users.find((u) => u.id === userId && u.active);
  if (!user) throw invalid('That account is not available.');
  return ssoSignIn('google', user.email);
}

// ---------------- System (Admin → System, prototype controls) ----------------

export async function runJobsNow(forceDigest = false) {
  await delay('write');
  assertCan(ctx(), 'config.manage');
  const r = runScheduledJobs({ forceDigest });
  commit();
  return r;
}

export async function setSimulateErrors(on: boolean) {
  const user = ctx();
  assertCan(user, 'config.manage');
  getDb().settings.simulateErrors = on;
  audit(user, 'config_change', 'system', 'simulate_errors', `${on ? 'Enabled' : 'Disabled'} simulated network errors`);
  commit();
}

export async function resetDemoData() {
  const id = getSessionUserId();
  resetDb();
  await clearBlobs();
  if (id && !getDb().users.some((u) => u.id === id)) setSessionUserId(null);
  runScheduledJobs();
  commit();
}
