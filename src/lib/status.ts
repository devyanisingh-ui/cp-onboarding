import type { Agreement, AgreementStatus, DisplayStatus, DocRequestItem, VersionStatus } from '@/types';
import { daysUntil } from './dates';

/** PRD §8 status colours — used everywhere a status is shown. */
export const STATUS_META: Record<DisplayStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  rejected: { label: 'Rejected', tone: 'red' },
  pending_approval: { label: 'Pending Legal approval', tone: 'amber' },
  docs_requested: { label: 'CP details sent back', tone: 'orange' },
  approved_for_signing: { label: 'Ready for signing', tone: 'blue' },
  out_for_signature: { label: 'Out for e-signature', tone: 'purple' },
  signed_copy_uploaded: { label: 'Signed copy uploaded', tone: 'purple' },
  active: { label: 'Active', tone: 'green' },
  expiring: { label: 'Expiring', tone: 'orange' },
  notice_period: { label: 'Notice period', tone: 'orange' },
  expired: { label: 'Expired', tone: 'dark' },
  not_renewed: { label: 'Expired – Not renewed', tone: 'dark' },
  expired_no_decision: { label: 'Expired without decision', tone: 'dark' },
  terminated: { label: 'Terminated', tone: 'dark' },
};

export type StatusTone = 'grey' | 'amber' | 'blue' | 'purple' | 'green' | 'orange' | 'dark' | 'red' | 'accent';

export const TONE_CLASSES: Record<StatusTone, string> = {
  grey: 'bg-slate-100 text-slate-700 ring-slate-300',
  amber: 'bg-amber-50 text-amber-800 ring-amber-300',
  blue: 'bg-blue-50 text-blue-800 ring-blue-300',
  purple: 'bg-purple-50 text-purple-800 ring-purple-300',
  green: 'bg-green-50 text-green-800 ring-green-300',
  orange: 'bg-orange-50 text-orange-800 ring-orange-300',
  dark: 'bg-slate-700 text-white ring-slate-700',
  red: 'bg-red-50 text-red-800 ring-red-300',
  accent: 'bg-primary-50 text-primary-800 ring-primary-200',
};

export const FINAL_STATUSES: AgreementStatus[] = ['terminated', 'expired', 'not_renewed', 'expired_no_decision'];
export const IN_PROGRESS_STATUSES: AgreementStatus[] = [
  'draft',
  'pending_approval',
  'approved_for_signing',
  'signed_copy_uploaded',
];
/** Statuses that count towards "one active agreement per CP per institution". */
export const LIVE_STATUSES: AgreementStatus[] = ['active', 'notice_period'];

export function displayStatus(a: Pick<Agreement, 'status' | 'endDate' | 'lastRejection' | 'esign' | 'docRequest'>): DisplayStatus {
  if (a.status === 'signed_copy_uploaded' && a.docRequest && a.docRequest.status !== 'closed') return 'docs_requested';
  if (a.status === 'approved_for_signing' && a.esign?.status === 'in_progress') return 'out_for_signature';
  if (a.status === 'active' && a.endDate && daysUntil(a.endDate) <= 60) return 'expiring';
  if (a.status === 'draft' && a.lastRejection) return 'rejected';
  return a.status;
}

/** Main path shown in the Agreement detail stepper. */
export const STEPPER: { status: AgreementStatus; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'approved_for_signing', label: 'Signing' },
  { status: 'pending_approval', label: 'Legal approval' },
  { status: 'active', label: 'Active' },
];

/**
 * The CP details Legal flagged and still has to re-check: set once the BD resubmits them, until
 * Legal decides. Legal's earlier review covered everything else, so only these are checked again.
 */
export function correctedDocsToRecheck(a: Pick<Agreement, 'status' | 'docRequest'>): DocRequestItem[] | null {
  const r = a.docRequest;
  return a.status === 'pending_approval' && r?.status === 'closed' && !r.legalReviewedAt ? r.items : null;
}

/** Title for a "returned" banner, by the step that returned it. */
export function rejectionTitle(gate: 1 | 2): string {
  return gate === 1 ? 'Returned by Legal' : 'Returned at Gate 2';
}

export const VERSION_STATUS_META: Record<VersionStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  pending_approval: { label: 'Awaiting Legal', tone: 'amber' },
  approved: { label: 'Legal approved', tone: 'blue' },
  published: { label: 'Published', tone: 'green' },
  retired: { label: 'Retired', tone: 'dark' },
};
