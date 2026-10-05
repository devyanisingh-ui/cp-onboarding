import { z } from 'zod';

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const MOBILE_RE = /^[6-9][0-9]{9}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;
export const AADHAAR4_RE = /^[0-9]{4}$/;
export const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PAN_RE, 'PAN must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)');

export const mobileSchema = z.string().trim().regex(MOBILE_RE, 'Enter a 10-digit mobile number');
export const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(IFSC_RE, 'IFSC must be 11 characters: 4 letters, 0, then 6 letters or digits');
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN_RE, 'GSTIN must be 15 characters starting with a 2-digit state code');
export const emailSchema = z.string().trim().email('Enter a valid email address');

export function isValidPan(v: string): boolean {
  return PAN_RE.test(v.trim().toUpperCase());
}

/** PRD §7: expiry after commencement; commencement not before execution. */
export function agreementDateErrors(d: {
  executionDate?: string;
  startDate?: string;
  endDate?: string;
}): Partial<Record<'startDate' | 'endDate', string>> {
  const errs: Partial<Record<'startDate' | 'endDate', string>> = {};
  if (d.executionDate && d.startDate && d.startDate < d.executionDate)
    errs.startDate = 'Commencement cannot be before the execution date';
  if (d.startDate && d.endDate && d.endDate <= d.startDate)
    errs.endDate = 'Expiry must be after the commencement date';
  return errs;
}

export function emailDomainAllowed(email: string, domains: string[]): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return false;
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}
