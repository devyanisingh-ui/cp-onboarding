import type { CpMaster, CpType, DocumentRecord, AuditEvent } from '@/types';
import { cpFormSchema, type CpFormValues } from '@/lib/schemas';
import { isMasked, maskPan } from '@/lib/mask';
import { PAN_RE } from '@/lib/validation';
import { can } from '@/lib/permissions';
import { CONSENT_STATEMENT } from '@/data/seed';
import { conflict, invalid, notFound, forbidden } from '../errors';
import { nextId } from '../db';
import { assertCan, audit, commit, ctx, delay, diff, getDb, inScope, now } from './core';
import {
  cpFullAccess,
  cpStatus,
  toCpDTO,
  toCpLimited,
  toSummary,
  type AgreementSummary,
  type CpDTO,
  type CpLimited,
  type CpListItem,
  type CpStatus,
} from './dto';

export interface CpFilters {
  q?: string;
  type?: CpType | '';
  institutionId?: string;
  status?: CpStatus | '';
  warning?: boolean;
}

export async function listCps(f: CpFilters = {}): Promise<CpListItem[]> {
  await delay();
  const user = ctx();
  const d = getDb();
  const q = f.q?.trim().toLowerCase() ?? '';
  const qDigits = q.replace(/\D/g, '');
  return d.cps
    .map((cp): CpListItem & { _pan: string; _mobile: string } => {
      const ags = d.agreements.filter((a) => a.cpId === cp.id);
      const full = cpFullAccess(user, cp.id);
      const institutions = [...new Set(ags.map((a) => d.institutions.find((i) => i.id === a.institutionId)!.shortCode))];
      return {
        ...toCpLimited(cp),
        limited: !full,
        type: full ? cp.type : undefined,
        mobile: full ? cp.mobile : undefined,
        contactPerson: full ? cp.contactPerson : undefined,
        institutions,
        agreementCount: ags.length,
        _pan: cp.pan.toLowerCase(),
        _mobile: cp.mobile,
      };
    })
    .filter((c) => {
      if (q) {
        const nameHit = c.legalName.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
        const panHit = c._pan.includes(q);
        const mobileHit = !c.limited && qDigits.length >= 4 && c._mobile.includes(qDigits);
        if (!nameHit && !panHit && !mobileHit) return false;
      }
      if (f.type && c.type !== f.type) return false;
      if (f.status && c.status !== f.status) return false;
      if (f.warning && !c.warning) return false;
      if (f.institutionId) {
        const code = d.institutions.find((i) => i.id === f.institutionId)?.shortCode;
        if (!code || !c.institutions.includes(code)) return false;
      }
      return true;
    })
    .map(({ _pan: _p, _mobile: _m, ...rest }) => rest)
    .sort((a, b) => a.legalName.localeCompare(b.legalName));
}

export type CpView =
  | { limited: true; cp: CpLimited; institutions: { code: string; status: string }[] }
  | {
      limited: false;
      cp: CpDTO;
      documents: DocumentRecord[];
      agreements: (AgreementSummary & { outOfScope?: boolean })[];
      history: AuditEvent[];
      names: Record<string, string>;
      canEdit: boolean;
    };

export async function getCp(id: string): Promise<CpView> {
  await delay();
  const user = ctx();
  const d = getDb();
  const cp = d.cps.find((c) => c.id === id);
  if (!cp) throw notFound('Channel Partner');
  const ags = d.agreements.filter((a) => a.cpId === id);
  if (!cpFullAccess(user, id)) {
    return {
      limited: true,
      cp: toCpLimited(cp),
      institutions: ags.map((a) => ({ code: d.institutions.find((i) => i.id === a.institutionId)!.shortCode, status: a.status })),
    };
  }
  const visibleIds = new Set(ags.filter((a) => inScope(user, a.institutionId)).map((a) => a.id));
  const history = d.audit
    .filter((e) => (e.entityType === 'cp' && e.entityId === id) || visibleIds.has(e.entityId))
    .slice()
    .reverse();
  const names = Object.fromEntries(d.users.map((u) => [u.id, u.name]));
  return {
    limited: false,
    cp: toCpDTO(cp),
    documents: d.documents.filter((doc) => doc.ownerType === 'cp' && doc.ownerId === id).slice().reverse(),
    agreements: ags
      .map((a) => {
        const s = toSummary(a);
        return visibleIds.has(a.id) ? s : { ...s, outOfScope: true, ownerName: '—', cpName: s.cpName };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    history,
    names,
    canEdit: can(user, 'cp.edit'),
  };
}

export interface PanCheckResult {
  exists: boolean;
  cp?: CpLimited & { type?: CpType; limited: boolean };
  liveInstitutionIds: string[];
  inProgressInstitutionIds: string[];
}

/** Wizard step 1 duplicate check. PAN is sent in the request body, never in a URL. */
export async function checkPan(pan: string): Promise<PanCheckResult> {
  await delay();
  const user = ctx();
  const value = pan.trim().toUpperCase();
  if (!PAN_RE.test(value)) throw invalid('Enter a valid PAN', { pan: 'PAN must look like AAAAA9999A' });
  const d = getDb();
  const cp = d.cps.find((c) => c.pan === value);
  audit(user, 'pan_check', 'cp', cp?.id ?? '—', `PAN duplicate check (${maskPan(value)}): ${cp ? 'match found' : 'no match'}`);
  commit();
  if (!cp) return { exists: false, liveInstitutionIds: [], inProgressInstitutionIds: [] };
  const ags = d.agreements.filter((a) => a.cpId === cp.id);
  const full = cpFullAccess(user, cp.id);
  return {
    exists: true,
    cp: { ...toCpLimited(cp), type: cp.type, limited: !full },
    liveInstitutionIds: ags.filter((a) => a.status === 'active' || a.status === 'notice_period').map((a) => a.institutionId),
    inProgressInstitutionIds: ags
      .filter((a) => ['draft', 'pending_approval', 'approved_for_signing', 'signed_copy_uploaded'].includes(a.status))
      .map((a) => a.institutionId),
  };
}

/** Existing CP values for the wizard (masked bank account). */
export async function getCpForEdit(id: string): Promise<CpDTO> {
  await delay();
  const user = ctx();
  const cp = getDb().cps.find((c) => c.id === id);
  if (!cp) throw notFound('Channel Partner');
  // The PAN check already told the user this CP exists; they are starting a new agreement for it.
  if (!cpFullAccess(user, id) && !user.roles.includes('bd_exec')) throw forbidden();
  return toCpDTO(cp);
}

function validateCp(values: CpFormValues, isNew: boolean) {
  const parsed = cpFormSchema({ requireAccount: isNew }).safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
    throw invalid('Some CP details need attention.', fieldErrors);
  }
  return parsed.data;
}

/** Internal: create or update a CP master. Used by the wizard. */
export function upsertCp(values: CpFormValues, existingId?: string): CpMaster {
  const user = ctx();
  const d = getDb();
  if (!existingId) {
    assertCan(user, 'cp.create');
    const v = validateCp(values, true);
    if (d.cps.some((c) => c.pan === v.pan)) throw conflict('A CP with this PAN already exists. Go back to step 1 to use it.');
    const cp: CpMaster = {
      id: nextId('cp', 'CP-'),
      type: v.type,
      legalName: v.legalName,
      pan: v.pan,
      contactPerson: v.contactPerson,
      mobile: v.mobile,
      email: v.email,
      residenceAddress: v.residenceAddress,
      businessAddress: v.businessAddress,
      gstRegistered: v.gstRegistered,
      gstin: v.gstRegistered ? v.gstin?.toUpperCase() : undefined,
      bank: { ...v.bank, ifsc: v.bank.ifsc.toUpperCase() },
      aadhaarLast4: v.aadhaarLast4,
      typeFields: clean(v.typeFields),
      consent: { statement: CONSENT_STATEMENT, recordedAt: now(), recordedById: user.id },
      createdAt: now(),
      createdById: user.id,
    };
    d.cps.push(cp);
    audit(user, 'create', 'cp', cp.id, `Created CP master ${cp.legalName}`, undefined, { type: cp.type, legalName: cp.legalName, pan: '[redacted]' });
    audit(user, 'consent', 'cp', cp.id, 'Recorded DPDP consent and purpose statement');
    return cp;
  }
  assertCan(user, 'cp.edit');
  const cp = d.cps.find((c) => c.id === existingId);
  if (!cp) throw notFound('Channel Partner');
  // Masked values coming back from the form mean 'unchanged'.
  const gstin = isMasked(values.gstin) ? cp.gstin : values.gstin;
  const v = validateCp({ ...values, gstin, pan: cp.pan, type: cp.type }, false);
  const next: Partial<CpMaster> = {
    legalName: v.legalName,
    contactPerson: v.contactPerson,
    mobile: v.mobile,
    email: v.email,
    residenceAddress: v.residenceAddress,
    businessAddress: v.businessAddress,
    gstRegistered: v.gstRegistered,
    gstin: v.gstRegistered ? v.gstin?.toUpperCase() : undefined,
    bank: { ...v.bank, ifsc: v.bank.ifsc.toUpperCase(), accountNumber: v.bank.accountNumber || cp.bank.accountNumber },
    aadhaarLast4: v.aadhaarLast4,
    typeFields: clean(v.typeFields),
  };
  const ch = diff(cp, next, ['bank']);
  if (ch.changed.length === 0) return cp;
  const bankChanged = JSON.stringify(cp.bank) !== JSON.stringify(next.bank);
  const nameChanged = cp.legalName !== next.legalName;
  Object.assign(cp, next);
  if (bankChanged || nameChanged) {
    // PRD §4: bank or name changes require re-verification.
    cp.reverificationRequired = true;
    for (const doc of d.documents) {
      if (doc.ownerType === 'cp' && doc.ownerId === cp.id && (doc.type === 'pan' || doc.type === 'cancelled_cheque')) {
        doc.verificationStatus = 'pending';
        doc.remarks = `Re-verification required: ${[nameChanged && 'name', bankChanged && 'bank details'].filter(Boolean).join(' and ')} changed`;
      }
    }
  }
  if (!cp.consent && v.consentGiven) cp.consent = { statement: CONSENT_STATEMENT, recordedAt: now(), recordedById: user.id };
  audit(user, 'update', 'cp', cp.id, `Updated CP master (${ch.changed.join(', ')})`, ch.before, ch.after);
  return cp;
}

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null)) as T;
}

/** "Reveal" a masked value. Every call is logged (PRD §8, §11). */
export async function revealCpField(id: string, field: 'pan' | 'account' | 'gstin'): Promise<string> {
  await delay();
  const user = ctx();
  const cp = getDb().cps.find((c) => c.id === id);
  if (!cp || !cpFullAccess(user, id)) throw notFound('Channel Partner');
  audit(user, 'reveal', 'cp', id, `Revealed ${field === 'pan' ? 'PAN' : field === 'gstin' ? 'GSTIN' : 'bank account number'}`);
  commit();
  return field === 'pan' ? cp.pan : field === 'gstin' ? (cp.gstin ?? '') : cp.bank.accountNumber;
}

export { cpStatus };

export async function updateCp(id: string, values: CpFormValues): Promise<void> {
  await delay('write');
  const user = ctx();
  if (!cpFullAccess(user, id)) throw notFound('Channel Partner');
  upsertCp(values, id);
  commit();
}
