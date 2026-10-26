import type { User } from '@/types';
import { db, requestInfo } from './context';
import { nextId } from './ids';
import type { Prisma } from '../generated/prisma/client';

export { diff } from '@/lib/records';

/** Appends to the immutable audit trail (same arguments as the browser mock's audit()). */
export async function audit(
  actor: Pick<User, 'id' | 'name'> | 'system',
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Promise<void> {
  const system = actor === 'system';
  const { ip, device } = requestInfo();
  await db().auditEvent.create({
    data: {
      id: await nextId('audit', 'EV-', 5),
      actorId: system ? 'system' : actor.id,
      actorName: system ? 'System' : actor.name,
      action,
      entityType,
      entityId,
      summary,
      before: before as Prisma.InputJsonValue | undefined,
      after: after as Prisma.InputJsonValue | undefined,
      ip: system ? 'scheduler' : ip,
      device: system ? 'Scheduler' : device,
    },
  });
}
