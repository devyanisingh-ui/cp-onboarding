import type { Role, User } from '@/types';
import { DEMO_PASSWORD } from '@/data/seed';
import { ApiError, invalid } from '../errors';
import { resetDb } from '../db';
import { clearBlobs } from '../blobStore';
import { assertCan, audit, commit, ctx, delay, getDb, getSessionUserId, setSessionUserId } from './core';
import { runScheduledJobs } from './scheduler';

/** Username is the part of the work email before the "@" (e.g. kavya.iyer). */
export function usernameOf(user: Pick<User, 'email'>): string {
  return user.email.split('@')[0].toLowerCase();
}

/**
 * Mock of username + password sign-in. The prototype has no backend, so every active user shares
 * DEMO_PASSWORD; the real build verifies a hashed password on the server.
 */
export async function passwordSignIn(username: string, password: string): Promise<User> {
  await delay('write');
  const value = username.trim().toLowerCase();
  if (!value) throw invalid('Enter your username.');
  if (!password) throw invalid('Enter your password.');
  const user = getDb().users.find((u) => usernameOf(u) === value || u.email.toLowerCase() === value);
  if (!user || password !== DEMO_PASSWORD) throw new ApiError(401, 'Incorrect username or password.');
  if (!user.active) throw new ApiError(403, 'Your access has been deactivated. Contact the central Admin team.');
  return startSession(user, 'Signed in with username and password');
}

function startSession(user: User, detail: string): User {
  setSessionUserId(user.id);
  audit(user, 'login', 'session', user.id, detail);
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

/** Accounts listed on the sign-in screen (prototype only). */
export function demoAccounts(): (Pick<User, 'id' | 'name' | 'email' | 'designation' | 'roles'> & { username: string })[] {
  return getDb()
    .users.filter((u) => u.active)
    .map(({ id, name, email, designation, roles }) => ({ id, name, email, designation, roles, username: usernameOf({ email }) }));
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
  await delay('write');
  return startSession(user, 'Switched persona (prototype)');
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
