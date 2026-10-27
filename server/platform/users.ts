import type { Role, User } from '@/types';
import { db, type Tx } from './context';

/** Display name for an ID in the audit trail and lists (same as the browser mock's userName()). */
export async function userName(id?: string): Promise<string> {
  if (!id) return '—';
  if (id === 'system') return 'System';
  return (await db().user.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'Unknown user';
}

const withRoles = { roles: { orderBy: { role: 'asc' } } } as const;

/** A staff member in the app's User shape. Institution membership is added by the admin-config feature. */
export async function loadUser(id: string, client: Pick<Tx, 'user'> = db()): Promise<User | null> {
  const row = await client.user.findUnique({ where: { id }, include: withRoles });
  return row ? toUser(row) : null;
}

export function toUser(row: { id: string; name: string; email: string; designation: string; regionId: string; managerId: string | null; active: boolean; roles: { role: string }[] }): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    designation: row.designation,
    roles: row.roles.map((r) => r.role as Role),
    regionId: row.regionId,
    institutionIds: [],
    ...(row.managerId ? { managerId: row.managerId } : {}),
    active: row.active,
  };
}
