import type { Role, User } from '@/types';
import { inTransaction } from '../platform/context';
import { prisma } from '../platform/db';

/** Adds a staff member directly (the admin-config feature will own creating users). */
export async function addUser(u: { id: string; name?: string; email?: string; roles: Role[] }): Promise<User> {
  const name = u.name ?? u.id;
  const email = u.email ?? `${u.id}@example.com`;
  await prisma.user.create({ data: { id: u.id, name, email, designation: 'Test', regionId: 'r-north', roles: { create: u.roles.map((role) => ({ role })) } } });
  return { id: u.id, name, email, designation: 'Test', roles: u.roles, regionId: 'r-north', institutionIds: [], active: true };
}

/** Runs server code as `user`, in one transaction, the way an RPC call does. */
export function as<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  return inTransaction({ user, ip: '127.0.0.1', device: 'Test' }, fn);
}
