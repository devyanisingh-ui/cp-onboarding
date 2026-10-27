import type { User } from '@/types';
import { can, type Capability } from '@/lib/permissions';
import { forbidden } from '@/services/errors';

/** Same check as the browser mock: the PRD §3 permission matrix (src/lib/permissions.ts). */
export function assertCan(user: User, cap: Capability, msg?: string): void {
  if (!can(user, cap)) throw forbidden(msg);
}

/** True when the user may see records of this institution. */
export function inScope(user: User, institutionId: string): boolean {
  return can(user, 'scope.all') || user.institutionIds.includes(institutionId);
}
