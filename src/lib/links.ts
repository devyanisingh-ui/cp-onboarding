import type { Task } from '@/types';

/** Where each task type is actioned. Shared by the inbox, notifications and emails. */
export function taskLink(t: Pick<Task, 'type' | 'agreementId' | 'refId'>): string {
  const a = t.agreementId;
  switch (t.type) {
    case 'gate1_approval':
      return `/agreements/${a}/preview`;
    case 'deviation_review':
      return `/agreements/${a}/deviation`;
    case 'fix_rejected':
      return `/agreements/${a}/edit`;
    case 'signing_upload':
    case 'legacy_scan_upload':
      return `/agreements/${a}/upload`;
    case 'gate2_verification':
      return `/agreements/${a}/verify`;
    case 'renewal_decision':
    case 'non_renewal_confirm':
      return `/agreements/${a}/renewal`;
    case 'termination_confirm':
      return `/agreements/${a}/terminate`;
    case 'rate_card_approval':
      return `/admin/rate-cards?id=${t.refId}`;
    case 'template_approval':
      return `/admin/templates?id=${t.refId}`;
    case 'warning_override':
    case 'rate_review':
      return `/agreements/${a}`;
  }
}

export const TASK_TYPE_LABELS: Record<Task['type'], string> = {
  gate1_approval: 'Gate 1 approval',
  deviation_review: 'Deviation review',
  fix_rejected: 'Rework draft',
  signing_upload: 'Signing & upload',
  gate2_verification: 'Gate 2 verification',
  renewal_decision: 'Renewal decision',
  non_renewal_confirm: 'Confirm non-renewal',
  termination_confirm: 'Confirm termination',
  rate_card_approval: 'Rate card approval',
  template_approval: 'Template approval',
  warning_override: 'Warning override',
  legacy_scan_upload: 'Legacy scan upload',
  rate_review: 'Rate review',
};
