import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '@/types';
import { unauthorized } from '@/services/errors';
import { prisma } from './db';
import type { Prisma } from '../generated/prisma/client';

export type Tx = Prisma.TransactionClient;

/** Who is asking, from where, and the transaction their request runs in. */
export interface RequestContext {
  user: User | null;
  ip: string;
  device: string;
  tx: Tx;
  /** Work that must only happen once the transaction has committed (sending email). */
  afterCommit: (() => Promise<void>)[];
}

const storage = new AsyncLocalStorage<RequestContext>();

function current(): RequestContext {
  const c = storage.getStore();
  if (!c) throw new Error('No request context: server functions run inside inTransaction().');
  return c;
}

/**
 * Runs `fn` as one database transaction: every write inside it lands together or not at all.
 * Work queued with afterCommit() runs once the commit succeeds, and never if it fails.
 */
export async function inTransaction<T>(who: { user: User | null; ip?: string; device?: string }, fn: () => Promise<T>): Promise<T> {
  const afterCommit: RequestContext['afterCommit'] = [];
  const result = await prisma.$transaction((tx) => storage.run({ user: who.user, ip: who.ip ?? 'unknown', device: who.device ?? 'Unknown', tx, afterCommit }, fn), {
    // A request that waits longer than this on a locked row fails instead of piling up.
    maxWait: 5_000,
    timeout: 20_000,
  });
  for (const job of afterCommit) {
    try {
      await job();
    } catch (e) {
      console.error('[after-commit]', e);
    }
  }
  return result;
}

/** The current request's transaction. */
export function db(): Tx {
  return current().tx;
}

/** The signed-in user; 401 when there is none. The server equivalent of the mock's ctx(). */
export function ctx(): User {
  const user = current().user;
  if (!user) throw unauthorized();
  return user;
}

export function requestInfo(): { ip: string; device: string } {
  const { ip, device } = current();
  return { ip, device };
}

export function afterCommit(job: () => Promise<void>) {
  current().afterCommit.push(job);
}

export function now(): Date {
  return new Date();
}
