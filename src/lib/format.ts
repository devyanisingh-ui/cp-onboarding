import type { CpType, Role } from '@/types';

export const ROLE_LABELS: Record<Role, string> = {
  bd_exec: 'BD Executive',
  legal: 'Legal',
  admin: 'Admin',
};

/** In the order of the KYC checklist. */
export const CP_TYPE_LABELS: Record<CpType, string> = {
  individual: 'Individual',
  sole_prop: 'Sole Proprietorship Firm',
  proprietorship: 'Proprietorship Firm',
  partnership: 'Partnership Firm',
  pvt_ltd: 'Company (Pvt. Ltd / Ltd)',
};

export const CP_TYPES = Object.keys(CP_TYPE_LABELS) as CpType[];

/** First choice in the new-agreement wizard; each groups institutions by state/city (Institution.group). */
export const INSTITUTION_GROUPS: { id: string; label: string }[] = [
  { id: 'delhi', label: 'Delhi' },
  { id: 'punjab', label: 'Punjab' },
  { id: 'asu', label: 'ASU' },
  { id: 'up', label: 'UP' },
  { id: 'mumbai', label: 'Mumbai' },
];

export const INSTITUTION_TYPE_LABELS = { university: 'University', college: 'College', school: 'School' } as const;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export function formatInr(n: number | undefined | null): string {
  return n == null || Number.isNaN(n) ? '—' : inr.format(n);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n} ${n === 1 ? word : plural}`;
}
