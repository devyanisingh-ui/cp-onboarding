import type { Agreement, CpMaster, CpType, LegacyBatch } from '@/types';
import { today } from '@/lib/dates';
import { PAN_RE, MOBILE_RE, IFSC_RE } from '@/lib/validation';
import { CONSENT_STATEMENT } from '@/data/seed';
import { forbidden } from '../errors';
import { nextId } from '../db';
import { assertCan, audit, commit, createTask, ctx, delay, getDb, inScope, now } from './core';
import { currentRateCard, currentTemplate } from './agreements';

/** Columns of the Excel import template (PRD §6.6), one row per active paper agreement. */
export const LEGACY_COLUMNS = [
  { key: 'institution_code', label: 'Institution code', example: 'ASU' },
  { key: 'cp_type', label: 'CP type', example: 'Sole Proprietorship' },
  { key: 'legal_name', label: 'CP legal name', example: 'Sunrise Education Services' },
  { key: 'pan', label: 'PAN', example: 'ABCPS1234D' },
  { key: 'contact_person', label: 'Contact person', example: 'Ravi Kumar' },
  { key: 'mobile', label: 'Mobile', example: '9812012345' },
  { key: 'email', label: 'Email', example: 'ravi@sunrise.in' },
  { key: 'address', label: 'Address', example: 'SCO 12, Sector 29, Gurugram' },
  { key: 'bank_account', label: 'Bank account number', example: '50100123456789' },
  { key: 'ifsc', label: 'IFSC', example: 'HDFC0001234' },
  { key: 'aadhaar_last4', label: 'Aadhaar last 4', example: '1234' },
  { key: 'execution_date', label: 'Execution date (YYYY-MM-DD)', example: '2025-06-01' },
  { key: 'start_date', label: 'Commencement date (YYYY-MM-DD)', example: '2025-06-02' },
  { key: 'end_date', label: 'Expiry date (YYYY-MM-DD)', example: '2026-06-01' },
  { key: 'stamp_number', label: 'Stamp paper number', example: 'IN-HR12345678' },
  { key: 'stamp_value', label: 'Stamp value (INR)', example: '100' },
] as const;

export type LegacyRow = Partial<Record<(typeof LEGACY_COLUMNS)[number]['key'], string>>;

const TYPE_BY_LABEL: Record<string, CpType> = {
  'sole proprietorship': 'sole_prop',
  'pvt. ltd': 'pvt_ltd',
  'pvt ltd': 'pvt_ltd',
  partnership: 'partnership',
  individual: 'individual',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface RowValidation {
  row: number;
  errors: string[];
  data: LegacyRow;
}

export function validateLegacyRows(rows: LegacyRow[]): RowValidation[] {
  const d = getDb();
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const errors: string[] = [];
    const pan = (r.pan ?? '').trim().toUpperCase();
    const inst = d.institutions.find((x) => x.shortCode === (r.institution_code ?? '').trim().toUpperCase());
    if (!inst) errors.push(`Unknown institution code "${r.institution_code ?? ''}"`);
    const type = TYPE_BY_LABEL[(r.cp_type ?? '').trim().toLowerCase()];
    if (!type) errors.push('CP type must be Sole Proprietorship, Pvt. Ltd, Partnership or Individual');
    if (!(r.legal_name ?? '').trim()) errors.push('CP legal name is required');
    if (!PAN_RE.test(pan)) errors.push('PAN format must be AAAAA9999A');
    if (r.mobile && !MOBILE_RE.test(r.mobile.trim())) errors.push('Mobile must be 10 digits');
    if (r.ifsc && !IFSC_RE.test(r.ifsc.trim().toUpperCase())) errors.push('IFSC format is invalid');
    for (const k of ['execution_date', 'start_date', 'end_date'] as const) if (!DATE_RE.test((r[k] ?? '').trim())) errors.push(`${k.replace('_', ' ')} must be YYYY-MM-DD`);
    if (DATE_RE.test(r.start_date ?? '') && DATE_RE.test(r.end_date ?? '') && r.end_date! <= r.start_date!) errors.push('Expiry must be after commencement');
    if (DATE_RE.test(r.end_date ?? '') && r.end_date! < today()) errors.push('Agreement already expired — expired paper agreements are not imported');
    if (PAN_RE.test(pan) && inst) {
      const key = `${pan}:${inst.id}`;
      if (seen.has(key)) errors.push('Duplicate row for the same PAN and institution in this file');
      seen.add(key);
      const cp = d.cps.find((c) => c.pan === pan);
      if (cp && d.agreements.some((a) => a.cpId === cp.id && a.institutionId === inst.id && ['active', 'notice_period', 'draft', 'pending_approval', 'approved_for_signing', 'signed_copy_uploaded'].includes(a.status)))
        errors.push('This CP already has an active or in-progress agreement with this institution');
      if (cp && type && cp.type !== type) errors.push(`PAN belongs to an existing ${cp.type.replace('_', ' ')} CP`);
    }
    return { row: i + 2, errors, data: r };
  });
}

export async function previewLegacyImport(rows: LegacyRow[]): Promise<RowValidation[]> {
  await delay();
  assertCan(ctx(), 'legacy.import');
  return validateLegacyRows(rows);
}

/** Imports valid rows; each enters at "Signed copy uploaded" and needs its scan, then Gate 2 only. */
export async function importLegacy(fileName: string, rows: LegacyRow[]): Promise<LegacyBatch> {
  await delay('write');
  const user = ctx();
  assertCan(user, 'legacy.import');
  const d = getDb();
  const results = validateLegacyRows(rows);
  const batch: LegacyBatch = { id: nextId('batch', 'LB-'), fileName, uploadedById: user.id, uploadedAt: now(), totalRows: rows.length, importedIds: [], errors: [] };
  for (const res of results) {
    const r = res.data;
    const inst = d.institutions.find((x) => x.shortCode === (r.institution_code ?? '').trim().toUpperCase());
    if (!res.errors.length && inst && !inScope(user, inst.id)) res.errors.push('You are not assigned to this institution');
    if (res.errors.length || !inst) {
      batch.errors.push({ row: res.row, messages: res.errors });
      continue;
    }
    const type = TYPE_BY_LABEL[r.cp_type!.trim().toLowerCase()]!;
    const pan = r.pan!.trim().toUpperCase();
    let cp = d.cps.find((c) => c.pan === pan);
    if (!cp) {
      const created: CpMaster = {
        id: nextId('cp', 'CP-'),
        type,
        legalName: r.legal_name!.trim(),
        pan,
        contactPerson: r.contact_person?.trim() ?? '',
        mobile: r.mobile?.trim() ?? '',
        email: r.email?.trim() ?? '',
        residenceAddress: type === 'pvt_ltd' ? '' : (r.address?.trim() ?? ''),
        businessAddress: type === 'individual' ? '' : (r.address?.trim() ?? ''),
        gstRegistered: false,
        bank: { holderName: r.legal_name!.trim(), accountNumber: r.bank_account?.trim() ?? '', ifsc: r.ifsc?.trim().toUpperCase() ?? '', bankName: '', branch: '' },
        aadhaarLast4: r.aadhaar_last4?.trim() ?? '',
        typeFields: {},
        consent: { statement: CONSENT_STATEMENT, recordedAt: now(), recordedById: user.id },
        createdAt: now(),
        createdById: user.id,
      };
      d.cps.push(created);
      audit(user, 'create', 'cp', created.id, `Created CP master from legacy import ${batch.id}`);
      cp = created;
    }
    const template = currentTemplate(type, inst.id);
    const rateCard = currentRateCard(inst.id);
    const id = `AGR-${inst.shortCode}-${r.execution_date!.slice(0, 4)}-${nextId('agreement', '').padStart(4, '0')}`;
    const a: Agreement = {
      id,
      version: 1,
      cpId: cp.id,
      institutionId: inst.id,
      locationId: inst.locations[0]!.id,
      templateVersionId: template?.id ?? d.templates.find((t) => t.cpType === type)!.id,
      rateCardVersionId: rateCard?.id ?? d.rateCards.find((x) => x.institutionId === inst.id)!.id,
      executionDate: r.execution_date,
      executionPlace: inst.city,
      startDate: r.start_date,
      endDate: r.end_date,
      signatoryName: inst.signatoryName,
      signatoryDesignation: inst.signatoryDesignation,
      coordinatorName: inst.coordinatorName,
      nonStandard: false,
      status: 'signed_copy_uploaded',
      source: 'legacy',
      legacyBatchId: batch.id,
      ownerId: user.roles.includes('bd_exec') ? user.id : (d.users.find((u) => u.roles.includes('bd_exec') && u.institutionIds.includes(inst.id))?.id ?? user.id),
      createdAt: now(),
      updatedAt: now(),
      stampPaper: r.stamp_number ? { number: r.stamp_number.trim(), valueInr: Number(r.stamp_value) || 0, purchaseDate: r.execution_date!, state: inst.state, vendor: 'Not recorded (legacy)' } : undefined,
    };
    d.agreements.push(a);
    batch.importedIds.push(id);
    audit(user, 'create', 'agreement', id, `Imported legacy agreement (batch ${batch.id}, row ${res.row})`, undefined, { status: a.status, source: 'legacy' });
    createTask({ type: 'legacy_scan_upload', title: `Upload legacy scan: ${cp.legalName}`, assigneeId: a.ownerId, slaDays: d.settings.sla.signingDays, agreementId: id, cpId: cp.id, institutionId: inst.id });
  }
  d.legacyBatches.push(batch);
  audit(user, 'import', 'legacy_batch', batch.id, `Legacy import ${fileName}: ${batch.importedIds.length} imported, ${batch.errors.length} rejected`);
  commit();
  return batch;
}

export async function listLegacyBatches(): Promise<LegacyBatch[]> {
  await delay();
  const user = ctx();
  if (!user.roles.includes('admin') && !user.roles.includes('bd_exec') && !user.roles.includes('audit')) throw forbidden();
  return getDb().legacyBatches.slice().reverse();
}
