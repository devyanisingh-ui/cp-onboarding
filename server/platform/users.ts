import { db } from './context';

/** Display name for an ID in the audit trail and lists (same as the browser mock's userName()). */
export async function userName(id?: string): Promise<string> {
  if (!id) return '—';
  if (id === 'system') return 'System';
  return (await db().user.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'Unknown user';
}
