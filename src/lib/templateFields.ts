import type { Agreement, CpMaster, CpType, Institution, RateCard } from '@/types';
import { formatDate } from './dates';

/**
 * Catalog of merge fields a template can use (PRD §7). The template editor's palette lists
 * these; the renderer resolves them. Keys follow the PRD's `entity.field` naming.
 */
export interface FieldContext {
  agreement: Agreement;
  cp: CpMaster;
  institution: Institution;
  rateCard: RateCard;
}

export type FieldGroup = 'Agreement' | 'Channel Partner' | 'Institution' | 'Rate card';

export interface FieldDef {
  key: string;
  label: string;
  group: FieldGroup;
  /** Where the value comes from, shown in the preview's field panel. */
  source: string;
  /** Required by default when the template uses it; the template can override. */
  required: boolean;
  /** Only meaningful for these CP types (omit = all types). */
  cpTypes?: CpType[];
  value: (c: FieldContext) => string | undefined;
}

const date = (v?: string) => (v ? formatDate(v) : undefined);
const loc = (c: FieldContext) => c.institution.locations.find((l) => l.id === c.agreement.locationId);

export const FIELDS: FieldDef[] = [
  // Agreement form
  { key: 'agreement.execution_date', label: 'Execution date', group: 'Agreement', source: 'Agreement form', required: true, value: (c) => date(c.agreement.executionDate) },
  { key: 'agreement.execution_place', label: 'Place of execution', group: 'Agreement', source: 'Agreement form', required: true, value: (c) => c.agreement.executionPlace },
  { key: 'agreement.start_date', label: 'Date of commencement', group: 'Agreement', source: 'Agreement form', required: true, value: (c) => date(c.agreement.startDate) },
  { key: 'agreement.end_date', label: 'Date of expiry', group: 'Agreement', source: 'Agreement form', required: true, value: (c) => date(c.agreement.endDate) },
  { key: 'agreement.id', label: 'Agreement ID', group: 'Agreement', source: 'System', required: false, value: (c) => c.agreement.id },
  { key: 'agreement.location', label: 'Location / campus', group: 'Agreement', source: 'Agreement form', required: false, value: (c) => (loc(c) ? `${loc(c)!.name}, ${loc(c)!.city}` : undefined) },

  // Channel Partner master
  { key: 'cp.legal_name', label: 'CP legal name', group: 'Channel Partner', source: 'CP master', required: true, value: (c) => c.cp.legalName },
  { key: 'cp.pan', label: 'PAN', group: 'Channel Partner', source: 'CP master', required: true, value: (c) => c.cp.pan },
  { key: 'cp.residence_address', label: 'Residence address', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['sole_prop', 'partnership', 'individual'], value: (c) => c.cp.residenceAddress || undefined },
  { key: 'cp.business_address', label: 'Place of business', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['sole_prop', 'pvt_ltd', 'partnership'], value: (c) => c.cp.businessAddress || undefined },
  { key: 'cp.contact_person', label: 'Contact person', group: 'Channel Partner', source: 'CP master', required: false, value: (c) => c.cp.contactPerson },
  { key: 'cp.mobile', label: 'Mobile', group: 'Channel Partner', source: 'CP master', required: false, value: (c) => c.cp.mobile },
  { key: 'cp.email', label: 'Email', group: 'Channel Partner', source: 'CP master', required: false, value: (c) => c.cp.email },
  { key: 'cp.gstin', label: 'GSTIN', group: 'Channel Partner', source: 'CP master', required: false, value: (c) => c.cp.gstin },
  { key: 'cp.proprietor_name', label: 'Name of the proprietor', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['sole_prop'], value: (c) => c.cp.typeFields.proprietorName },
  { key: 'cp.cin', label: 'CIN', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['pvt_ltd'], value: (c) => c.cp.typeFields.cin },
  { key: 'cp.registered_office', label: 'Registered office', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['pvt_ltd'], value: (c) => c.cp.typeFields.registeredOffice },
  { key: 'cp.authorised_signatory', label: 'Director / authorised signatory', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['pvt_ltd'], value: (c) => c.cp.typeFields.authorisedSignatory },
  { key: 'cp.board_resolution_date', label: 'Board resolution date', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['pvt_ltd'], value: (c) => date(c.cp.typeFields.boardResolutionDate) },
  { key: 'cp.partners', label: 'Partners', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['partnership'], value: (c) => c.cp.typeFields.partners },
  { key: 'cp.deed_date', label: 'Partnership deed date', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['partnership'], value: (c) => date(c.cp.typeFields.deedDate) },
  { key: 'cp.authorised_partner', label: 'Authorised partner', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['partnership'], value: (c) => c.cp.typeFields.authorisedPartner },
  { key: 'cp.father_name', label: 'Father’s name', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['individual'], value: (c) => c.cp.typeFields.fatherName },
  { key: 'cp.dob', label: 'Date of birth', group: 'Channel Partner', source: 'CP master', required: true, cpTypes: ['individual'], value: (c) => date(c.cp.typeFields.dob) },

  // Institution master (signatory / coordinator are editable per agreement)
  { key: 'institution.legal_name', label: 'Institution name', group: 'Institution', source: 'Institution master', required: true, value: (c) => c.institution.legalName },
  { key: 'institution.short_code', label: 'Short code', group: 'Institution', source: 'Institution master', required: false, value: (c) => c.institution.shortCode },
  { key: 'institution.legal_status', label: 'Legal status', group: 'Institution', source: 'Institution master', required: true, value: (c) => c.institution.legalStatus },
  { key: 'institution.address', label: 'Registered address', group: 'Institution', source: 'Institution master', required: true, value: (c) => c.institution.registeredAddress },
  { key: 'institution.city', label: 'City', group: 'Institution', source: 'Institution master', required: false, value: (c) => c.institution.city },
  { key: 'institution.state', label: 'State', group: 'Institution', source: 'Institution master', required: false, value: (c) => c.institution.state },
  { key: 'institution.jurisdiction_court', label: 'Jurisdiction court', group: 'Institution', source: 'Institution master', required: true, value: (c) => c.institution.jurisdictionCourt },
  { key: 'institution.arbitration_seat', label: 'Arbitration seat', group: 'Institution', source: 'Institution master', required: true, value: (c) => c.institution.arbitrationSeat },
  { key: 'institution.signatory_name', label: 'Signing authority', group: 'Institution', source: 'Institution master (editable per agreement)', required: true, value: (c) => c.agreement.signatoryName },
  { key: 'institution.signatory_designation', label: 'Designation of signing authority', group: 'Institution', source: 'Institution master (editable per agreement)', required: true, value: (c) => c.agreement.signatoryDesignation },
  { key: 'institution.coordinator_name', label: 'Coordinator', group: 'Institution', source: 'Institution master (editable per agreement)', required: true, value: (c) => c.agreement.coordinatorName },

  // Rate card
  { key: 'rate_card.version', label: 'Rate card version', group: 'Rate card', source: 'Rate card version', required: false, value: (c) => `v${c.rateCard.version}` },
  { key: 'rate_card.effective_from', label: 'Rate card effective date', group: 'Rate card', source: 'Rate card version', required: false, value: (c) => date(c.rateCard.effectiveFrom) },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
export const FIELD_GROUPS: FieldGroup[] = ['Agreement', 'Channel Partner', 'Institution', 'Rate card'];

export const TOKEN_RE = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g;

export function token(key: string): string {
  return `{{${key}}}`;
}

export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN_RE)].map((m) => m[1]!);
}

export function fieldApplies(f: FieldDef, type: CpType): boolean {
  return !f.cpTypes || f.cpTypes.includes(type);
}
