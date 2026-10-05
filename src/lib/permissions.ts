import type { Role, User } from '@/types';

/**
 * PRD §3 permission matrix, flattened into capabilities.
 * The mock API calls `assertCan` on every mutation so access is enforced at the "server",
 * not only in the UI.
 */
export type Capability =
  | 'cp.create'
  | 'cp.edit'
  | 'agreement.create'
  | 'agreement.edit'
  | 'deviation.request'
  | 'deviation.decide'
  | 'gate1.approve'
  | 'signed.upload'
  | 'gate2.verify'
  | 'kyc.upload'
  | 'template.view'
  | 'template.manage'
  | 'template.approve'
  | 'ratecard.view'
  | 'ratecard.manage'
  | 'ratecard.approve'
  | 'config.view'
  | 'config.manage'
  | 'audit.view'
  | 'reports.view'
  | 'renewal.decide'
  | 'renewal.confirm'
  | 'termination.start'
  | 'termination.confirm'
  | 'override.decide'
  | 'legacy.import'
  | 'scope.all';

const MATRIX: Record<Role, Capability[]> = {
  bd_exec: [
    'cp.create',
    'cp.edit',
    'agreement.create',
    'agreement.edit',
    'deviation.request',
    'signed.upload',
    'kyc.upload',
    'renewal.decide',
    'termination.start',
    'legacy.import',
  ],
  approver: ['gate1.approve', 'ratecard.view', 'reports.view', 'renewal.confirm', 'termination.start', 'termination.confirm'],
  legal: ['deviation.decide', 'gate1.approve', 'template.view', 'template.approve', 'ratecard.view', 'ratecard.approve'],
  signatory: [],
  audit: ['gate2.verify', 'template.view', 'ratecard.view', 'config.view', 'audit.view', 'reports.view', 'scope.all'],
  admin: [
    'cp.edit',
    'template.view',
    'template.manage',
    'ratecard.view',
    'ratecard.manage',
    'config.view',
    'config.manage',
    'audit.view',
    'reports.view',
    'override.decide',
    'legacy.import',
    'scope.all',
  ],
};

export function capabilitiesFor(roles: Role[]): Set<Capability> {
  return new Set(roles.flatMap((r) => MATRIX[r]));
}

export function can(user: Pick<User, 'roles'> | null | undefined, cap: Capability): boolean {
  if (!user) return false;
  return user.roles.some((r) => MATRIX[r].includes(cap));
}

export function hasRole(user: Pick<User, 'roles'> | null | undefined, role: Role): boolean {
  return !!user?.roles.includes(role);
}
