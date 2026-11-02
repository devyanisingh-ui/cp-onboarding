import type { LeadStatus } from '@/types';

/**
 * A CRM that CP Onboarding pulls leads from. One implementation per CRM (LeadSquared, Meritto,
 * Salesforce…); the sync (services/api/leads.ts) only sees this interface.
 */
export interface CrmConnector {
  id: string;
  label: string;
  /** Leads created or changed since `since` (all leads when absent). */
  fetchLeads(since?: string): Promise<CrmLead[]>;
}

/** A lead as the CRM reports it. Never personal details: the student's identity stays in the CRM. */
export interface CrmLead {
  crmId: string;
  /** The CRM's code for the referring partner (matched to a CP's crmPartnerCode, or its ID). */
  partnerCode: string;
  /** The institution's short code (ASU, AKS…). */
  institutionCode: string;
  programme: string;
  academicYear: string;
  status: LeadStatus;
  createdOn: string;
  appliedOn?: string;
  admittedOn?: string;
  droppedOn?: string;
  feeInr?: number;
  updatedAt: string;
}
