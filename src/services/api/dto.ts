import type {
  Agreement,
  AuditEvent,
  BankDetails,
  CpMaster,
  CpType,
  Deviation,
  DisplayStatus,
  DocumentRecord,
  Institution,
  RateCard,
  Task,
  TemplateVersion,
  User,
  WarningFlag,
} from '@/types';
import { maskAccount, maskGstin, maskPan } from '@/lib/mask';
import { displayStatus, IN_PROGRESS_STATUSES, LIVE_STATUSES } from '@/lib/status';
import { getDb } from '../db';
import { inScope, userName } from './core';

/** CP as sent to the browser: PAN and account number are masked; "Reveal" is a separate logged call. */
export type CpDTO = Omit<CpMaster, 'pan' | 'bank'> & {
  panMasked: string;
  bank: Omit<BankDetails, 'accountNumber'> & { accountMasked: string };
  status: CpStatus;
};

export type CpStatus = 'new' | 'onboarding' | 'active' | 'inactive';

export const CP_STATUS_META: Record<CpStatus, { label: string; tone: 'grey' | 'amber' | 'green' | 'dark' }> = {
  new: { label: 'New', tone: 'grey' },
  onboarding: { label: 'Onboarding', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  inactive: { label: 'Inactive', tone: 'dark' },
};

/** What users outside a CP's scope may see (PRD §3 scope rules). */
export interface CpLimited {
  id: string;
  legalName: string;
  panMasked: string;
  status: CpStatus;
  warning?: WarningFlag;
}

export interface CpListItem extends CpLimited {
  limited: boolean;
  type?: CpType;
  mobile?: string;
  contactPerson?: string;
  institutions: string[];
  agreementCount: number;
}

export interface AgreementSummary {
  id: string;
  cpId: string;
  cpName: string;
  cpType: CpType;
  institutionId: string;
  institutionCode: string;
  status: Agreement['status'];
  displayStatus: DisplayStatus;
  startDate?: string;
  endDate?: string;
  nonStandard: boolean;
  source: Agreement['source'];
  ownerId: string;
  ownerName: string;
  updatedAt: string;
  rejected: boolean;
  reviewFlag: boolean;
  overridePending: boolean;
}

export interface AgreementActions {
  edit: boolean;
  submit: boolean;
  requestDeviation: boolean;
  decideDeviation: boolean;
  approveGate1: boolean;
  uploadSigned: boolean;
  verifyGate2: boolean;
  renewalDecision: boolean;
  confirmNonRenewal: boolean;
  terminate: boolean;
  confirmTermination: boolean;
  decideOverride: boolean;
  download: boolean;
}

export interface AgreementDetail {
  agreement: Agreement;
  summary: AgreementSummary;
  cp: CpDTO;
  institution: Institution;
  locationName: string;
  template: TemplateVersion;
  rateCard: RateCard;
  deviations: Deviation[];
  documents: DocumentRecord[];
  cpDocuments: DocumentRecord[];
  events: AuditEvent[];
  openTasks: (Task & { assigneeName: string })[];
  predecessor?: AgreementSummary;
  successor?: AgreementSummary;
  actions: AgreementActions;
  names: Record<string, string>;
}

export function cpStatus(cpId: string): CpStatus {
  const ags = getDb().agreements.filter((a) => a.cpId === cpId);
  if (ags.length === 0) return 'new';
  if (ags.some((a) => LIVE_STATUSES.includes(a.status))) return 'active';
  if (ags.some((a) => IN_PROGRESS_STATUSES.includes(a.status))) return 'onboarding';
  return 'inactive';
}

export function toCpDTO(cp: CpMaster): CpDTO {
  const { pan, bank, ...rest } = cp;
  const { accountNumber, ...bankRest } = bank;
  return {
    ...structuredClone(rest),
    gstin: rest.gstin ? maskGstin(rest.gstin) : undefined,
    panMasked: maskPan(pan),
    bank: { ...bankRest, accountMasked: maskAccount(accountNumber) },
    status: cpStatus(cp.id),
  };
}

export function toCpLimited(cp: CpMaster): CpLimited {
  return { id: cp.id, legalName: cp.legalName, panMasked: maskPan(cp.pan), status: cpStatus(cp.id), warning: cp.warning };
}

/** Full CP access if the user can see any of its agreements, or it has none yet. */
export function cpFullAccess(user: User, cpId: string): boolean {
  const ags = getDb().agreements.filter((a) => a.cpId === cpId);
  return ags.length === 0 || ags.some((a) => inScope(user, a.institutionId));
}

export function toSummary(a: Agreement): AgreementSummary {
  const d = getDb();
  const cp = d.cps.find((c) => c.id === a.cpId)!;
  const inst = d.institutions.find((i) => i.id === a.institutionId)!;
  return {
    id: a.id,
    cpId: a.cpId,
    cpName: cp.legalName,
    cpType: cp.type,
    institutionId: a.institutionId,
    institutionCode: inst.shortCode,
    status: a.status,
    displayStatus: displayStatus(a),
    startDate: a.startDate,
    endDate: a.endDate,
    nonStandard: a.nonStandard,
    source: a.source,
    ownerId: a.ownerId,
    ownerName: userName(a.ownerId),
    updatedAt: a.updatedAt,
    rejected: !!a.lastRejection,
    reviewFlag: !!a.reviewFlag,
    overridePending: a.override?.status === 'pending',
  };
}
