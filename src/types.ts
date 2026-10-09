// Domain entities, shaped after PRD section 4 so the mock layer can be swapped for a REST API.

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

export type Role = 'bd_exec' | 'legal' | 'admin';
export type CpType = 'sole_prop' | 'pvt_ltd' | 'partnership' | 'individual';

export interface Region {
  id: string;
  name: string;
}

export interface Location {
  id: string;
  name: string;
  city: string;
}

export interface Institution {
  id: string;
  legalName: string;
  shortCode: string;
  type: 'university' | 'school';
  legalStatus: string;
  registeredAddress: string;
  city: string;
  state: string;
  regionId: string;
  jurisdictionCourt: string;
  arbitrationSeat: string;
  locations: Location[];
  signatoryName: string;
  signatoryDesignation: string;
  coordinatorName: string;
  programmeGroups: string[];
  active: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  designation: string;
  roles: Role[];
  regionId: string;
  institutionIds: string[];
  managerId?: string;
  active: boolean;
}

export interface BankDetails {
  holderName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch: string;
}

export interface TypeFields {
  proprietorName?: string;
  cin?: string;
  registeredOffice?: string;
  authorisedSignatory?: string;
  boardResolutionDate?: ISODate;
  partners?: string;
  deedDate?: ISODate;
  authorisedPartner?: string;
  fatherName?: string;
  dob?: ISODate;
}

export interface WarningFlag {
  reason: string;
  setAt: ISODateTime;
  setById: string;
  sourceAgreementId?: string;
}

export interface CpMaster {
  id: string;
  type: CpType;
  legalName: string;
  pan: string;
  contactPerson: string;
  mobile: string;
  email: string;
  residenceAddress: string;
  businessAddress: string;
  gstRegistered: boolean;
  gstin?: string;
  bank: BankDetails;
  aadhaarLast4: string;
  typeFields: TypeFields;
  warning?: WarningFlag;
  reverificationRequired?: boolean;
  consent?: { statement: string; recordedAt: ISODateTime; recordedById: string };
  createdAt: ISODateTime;
  createdById: string;
}

/** Stored lifecycle states. "Expiring" and "Rejected" are derived display states. */
export type AgreementStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved_for_signing'
  | 'signed_copy_uploaded'
  | 'active'
  | 'notice_period'
  | 'terminated'
  | 'expired'
  | 'not_renewed'
  | 'expired_no_decision';

export type DisplayStatus = AgreementStatus | 'expiring' | 'rejected';

export interface StampPaper {
  number: string;
  valueInr: number;
  purchaseDate: ISODate;
  state: string;
  vendor: string;
}

export interface Rejection {
  gate: 1 | 2;
  byId: string;
  at: ISODateTime;
  comment: string;
}

export type FieldCheck = { status: 'verified' | 'mismatch'; remark?: string };

export interface RenewalDecision {
  decision: 'renew' | 'renew_with_changes' | 'do_not_renew';
  reason?: string;
  decidedById: string;
  decidedAt: ISODateTime;
  confirmation?: 'pending' | 'confirmed' | 'rejected';
  confirmedById?: string;
  confirmedAt?: ISODateTime;
  successorId?: string;
}

export interface Termination {
  type: 'convenience' | 'breach';
  reason: string;
  noticeDate: ISODate;
  effectiveDate: ISODate;
  noticeDocumentId: string;
  startedById: string;
  startedAt: ISODateTime;
  confirmation: 'pending' | 'confirmed' | 'rejected';
  confirmedById?: string;
  confirmedAt?: ISODateTime;
  rejectComment?: string;
}

export interface WarningOverride {
  status: 'pending' | 'approved' | 'rejected';
  requestReason: string;
  requestedById: string;
  requestedAt: ISODateTime;
  decidedById?: string;
  decidedAt?: ISODateTime;
  decisionReason?: string;
}

export interface Agreement {
  id: string;
  version: number;
  cpId: string;
  institutionId: string;
  locationId: string;
  templateVersionId: string;
  rateCardVersionId: string;
  executionDate?: ISODate;
  executionPlace?: string;
  startDate?: ISODate;
  endDate?: ISODate;
  signatoryName: string;
  signatoryDesignation: string;
  coordinatorName: string;
  nonStandard: boolean;
  status: AgreementStatus;
  predecessorId?: string;
  successorId?: string;
  source: 'app' | 'legacy';
  legacyBatchId?: string;
  ownerId: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  submittedAt?: ISODateTime;
  activatedAt?: ISODateTime;
  signedById?: string; // Authorised Signatory recorded at upload
  signedOn?: ISODate;
  lastRejection?: Rejection;
  stampPaper?: StampPaper;
  verification?: Record<string, FieldCheck>;
  renewal?: RenewalDecision;
  termination?: Termination;
  override?: WarningOverride;
  reviewFlag?: { reason: string; at: ISODateTime };
  closedAt?: ISODateTime;
}

export interface Deviation {
  id: string;
  agreementId: string;
  type: 'rate' | 'clause';
  /** rate: `${rowId}:${slab}` or `extra:${extraId}`; clause: clause id */
  ref: string;
  label: string;
  standardValue: string;
  proposedValue: string;
  agreedValue?: string;
  reason: string;
  requestedById: string;
  requestedAt: ISODateTime;
  status: 'pending' | 'approved' | 'rejected';
  decidedById?: string;
  decidedAt?: ISODateTime;
  legalComment?: string;
}

export const SLABS = ['1-10', '11-15', '16-20', '21+'] as const;
export type Slab = (typeof SLABS)[number];

export interface RateRow {
  id: string;
  programmeGroup: string;
  programmes: string;
  slabs: Record<Slab, number>;
}

export interface RateExtra {
  id: string;
  label: string;
  amountInr: number;
  unit: string;
}

export type VersionStatus = 'draft' | 'pending_approval' | 'approved' | 'published' | 'retired';

export interface RateCard {
  id: string;
  institutionId: string;
  version: number;
  effectiveFrom: ISODate;
  status: VersionStatus;
  applyMode: 'new_only' | 'addendums';
  rows: RateRow[];
  extras: RateExtra[];
  notes?: string;
  createdById: string;
  createdAt: ISODateTime;
  approvedById?: string;
  approvedAt?: ISODateTime;
  rejectComment?: string;
  publishedById?: string;
  publishedAt?: ISODateTime;
  affectedAgreementIds?: string[];
}

export interface TemplateVersion {
  id: string;
  institutionId: string | null; // null = all institutions
  cpType: CpType;
  version: number;
  fileName: string;
  blobKey?: string;
  effectiveFrom: ISODate;
  status: VersionStatus;
  changeNote: string;
  uploadedById: string;
  uploadedAt: ISODateTime;
  approvedById?: string;
  approvedAt?: ISODateTime;
  rejectComment?: string;
  publishedById?: string;
  publishedAt?: ISODateTime;
  /** Editable template body. Absent on older versions, which render the built-in default. */
  content?: TemplateContent;
}

/**
 * Template body built in the template editor. Text may contain merge-field tokens
 * such as {{cp.legal_name}}; see lib/templateFields.ts for the catalog.
 */
export interface TemplateContent {
  title: string;
  subtitle?: string;
  blocks: TemplateBlock[];
  /** Per-field override of the catalog's "required" default. */
  required?: Record<string, boolean>;
}

export type TemplateBlock =
  | { id: string; kind: 'heading'; text: string }
  | { id: string; kind: 'paragraph'; text: string }
  /** Numbered clause. `schoolText` replaces `text` for school institutions when set. */
  | { id: string; kind: 'clause'; title: string; text: string; schoolText?: string }
  | { id: string; kind: 'signatures' }
  | { id: string; kind: 'annexure'; title: string; note?: string };

export type DocumentType =
  | 'pan'
  | 'aadhaar_masked'
  | 'cancelled_cheque'
  | 'gst_certificate'
  | 'draft'
  | 'signed_copy'
  | 'stamp_paper_scan'
  | 'termination_notice'
  | 'template_docx'
  | 'other';

export interface DocumentRecord {
  id: string;
  ownerType: 'cp' | 'agreement' | 'template';
  ownerId: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  size: number;
  blobKey?: string;
  uploadedById: string;
  uploadedAt: ISODateTime;
  verificationStatus: 'pending' | 'verified' | 'mismatch';
  verifiedById?: string;
  verifiedOn?: ISODateTime;
  verificationMethod?: 'manual' | 'api';
  remarks?: string;
  retentionUntil?: ISODate;
}

export type TaskType =
  | 'gate1_approval'
  | 'deviation_review'
  | 'fix_rejected'
  | 'signing_upload'
  | 'gate2_verification'
  | 'renewal_decision'
  | 'non_renewal_confirm'
  | 'termination_confirm'
  | 'rate_card_approval'
  | 'template_approval'
  | 'warning_override'
  | 'legacy_scan_upload'
  | 'rate_review';

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  agreementId?: string;
  cpId?: string;
  refId?: string;
  institutionId?: string;
  assigneeId: string;
  dueDate: ISODate;
  createdAt: ISODateTime;
  status: 'open' | 'done' | 'cancelled';
  completedAt?: ISODateTime;
  completedById?: string;
  remindedAt?: ISODateTime;
  escalatedToId?: string;
  escalatedAt?: ISODateTime;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  link: string;
  createdAt: ISODateTime;
  read: boolean;
}

export interface EmailMessage {
  id: string;
  to: string;
  subject: string;
  body: string;
  link?: string;
  kind: 'task' | 'reminder' | 'escalation' | 'digest' | 'event';
  sentAt: ISODateTime;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  at: ISODateTime;
  ip: string;
  device: string;
}

export interface RoutingRule {
  id: string;
  institutionId: string;
  condition: 'standard' | 'non_standard';
  approverId: string;
  escalateToId: string;
}

export interface SlaSettings {
  gate1Days: number;
  deviationDays: number;
  signingDays: number;
  gate2Days: number;
  versionApprovalDays: number;
  renewalLeadDays: number;
  renewalEscalationDays: number;
  graceDays: number;
  digestHourIst: number;
}

export interface MasterLists {
  terminationReasons: string[];
  nonRenewalReasons: string[];
  documentTypes: { id: DocumentType; label: string }[];
  stampStates: string[];
}

export interface LegacyBatch {
  id: string;
  fileName: string;
  uploadedById: string;
  uploadedAt: ISODateTime;
  totalRows: number;
  importedIds: string[];
  errors: { row: number; messages: string[] }[];
}

export interface WizardDraft {
  id: string;
  userId: string;
  step: number;
  data: Record<string, unknown>;
  label: string;
  updatedAt: ISODateTime;
}

export interface Settings {
  sla: SlaSettings;
  allowedDomains: string[];
  lastDigestDate?: ISODate;
  simulateErrors: boolean;
}

export interface Database {
  schemaVersion: number;
  regions: Region[];
  institutions: Institution[];
  users: User[];
  cps: CpMaster[];
  agreements: Agreement[];
  deviations: Deviation[];
  rateCards: RateCard[];
  templates: TemplateVersion[];
  documents: DocumentRecord[];
  tasks: Task[];
  notifications: AppNotification[];
  emails: EmailMessage[];
  audit: AuditEvent[];
  routing: RoutingRule[];
  masterLists: MasterLists;
  legacyBatches: LegacyBatch[];
  wizardDrafts: WizardDraft[];
  settings: Settings;
  counters: Record<string, number>;
}
