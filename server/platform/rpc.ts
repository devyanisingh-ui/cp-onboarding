import type { User } from '@/types';
import { ApiError } from '@/services/errors';
import { deviceFrom } from '@/lib/records';
import { inTransaction } from './context';

/**
 * Typed RPC: each feature registers its server functions under its name, and the browser calls
 * POST /api/rpc/<feature>.<function> with { args: [...] } — the same arguments the function takes.
 * Every call runs in one transaction with the caller's identity (see context.ts).
 */
export interface Procedure {
  // Arguments arrive as JSON; each function checks its own inputs, as the mock already does.
  handler: (...args: any[]) => Promise<unknown>;
  /** Callable without signing in (sign-in itself, CP signing / document links). */
  public?: boolean;
}

const registry = new Map<string, Procedure>();

export function defineFeature(feature: string, procedures: Record<string, Procedure | ((...args: any[]) => Promise<unknown>)>) {
  for (const [name, p] of Object.entries(procedures)) {
    const key = `${feature}.${name}`;
    if (registry.has(key)) throw new Error(`RPC ${key} is registered twice.`);
    registry.set(key, typeof p === 'function' ? { handler: p } : p);
  }
}

export function procedureNames(): string[] {
  return [...registry.keys()].sort();
}

/** Who sent the request. Set by the auth feature (session cookie); until then nobody is signed in. */
type UserResolver = (request: Request) => Promise<User | null>;
let resolveUser: UserResolver = async () => null;
export function setUserResolver(fn: UserResolver) {
  resolveUser = fn;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function handleRpc(name: string, request: Request): Promise<Response> {
  const proc = registry.get(name);
  if (!proc) return json(404, { error: `Unknown operation: ${name}.` });
  let args: unknown[];
  try {
    const body = (await request.json()) as { args?: unknown };
    args = Array.isArray(body?.args) ? body.args : [];
  } catch {
    return json(400, { error: 'Body must be JSON: { "args": [...] }.' });
  }
  try {
    const user = await resolveUser(request);
    if (!proc.public && !user) throw new ApiError(401, 'Your session has ended. Please sign in again.');
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const device = deviceFrom(request.headers.get('user-agent') ?? '');
    const result = await inTransaction({ user, ip, device }, () => proc.handler(...args));
    return json(200, { result: result ?? null });
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: e.message, fieldErrors: e.fieldErrors });
    console.error(`[rpc] ${name} failed`, e);
    return json(500, { error: 'Something went wrong on the server. Please try again.' });
  }
}
