import type { CpType, Role } from '@/types';

export const ROLE_LABELS: Record<Role, string> = {
  bd_exec: 'BD Executive',
  legal: 'Legal',
  admin: 'Admin',
};

export const CP_TYPE_LABELS: Record<CpType, string> = {
  sole_prop: 'Sole Proprietorship',
  pvt_ltd: 'Pvt. Ltd',
  partnership: 'Partnership',
  individual: 'Individual',
};

export const CP_TYPES = Object.keys(CP_TYPE_LABELS) as CpType[];

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
