import type { Database } from '@/types';
import type { Tx } from '../../platform/context';
import { hashPassword } from './service';

/** Gives every seeded user the prototype's demo password (demo and staging data only). */
export async function seedAuth(tx: Tx, seed: Database, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await tx.credential.createMany({ data: seed.users.map((u) => ({ userId: u.id, passwordHash })), skipDuplicates: true });
}
