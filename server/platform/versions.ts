import { conflict } from '@/services/errors';

/**
 * Optimistic locking. Records that two people may edit at once carry a `version` column; a write
 * names the version it was based on, and is refused if someone saved in between.
 *
 *   await saveVersioned(db().agreement, id, expectedVersion, { status: 'draft' }, 'agreement');
 */
export async function saveVersioned<D extends Record<string, unknown>>(
  delegate: { updateMany(args: { where: { id: string; version: number }; data: D & { version: { increment: number } } }): Promise<{ count: number }> },
  id: string,
  expectedVersion: number,
  data: D,
  what = 'record',
): Promise<void> {
  const { count } = await delegate.updateMany({ where: { id, version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
  if (count === 0) throw conflict(`This ${what} was changed by someone else. Reload to see the latest version, then try again.`);
}
