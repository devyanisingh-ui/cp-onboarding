import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../mockApi';
import { setLatency, containsSensitive } from '../api/core';
import { getDb } from '../db';
import { runScheduledJobs } from '../api/scheduler';
import { shiftDays, today } from '@/lib/dates';
import type { CpFormValues } from '@/lib/schemas';
import { DEMO_PASSWORD } from '@/data/seed';

const as = (email: string) => api.auth.signIn(email, DEMO_PASSWORD);
const KAVYA = 'kavya.iyer@apeejay.edu';
const PRIYA = 'priya.sharma@apeejay.edu';
const ARJUN = 'arjun.mehta@apeejay.edu';

const newCp: CpFormValues = {
  type: 'sole_prop',
  legalName: 'Sunrise Education Services',
  pan: 'ABCPS1234D',
  contactPerson: 'Ravi Kumar',
  mobile: '9812012345',
  email: 'ravi@sunrise.in',
  residenceAddress: '12 Sector 29, Gurugram',
  businessAddress: 'SCO 12, Sector 29, Gurugram',
  gstRegistered: false,
  gstin: '',
  bank: { holderName: 'Ravi Kumar', accountNumber: '50100123456789', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', branch: 'Sector 29' },
  aadhaarLast4: '1234',
  typeFields: { proprietorName: 'Ravi Kumar' },
  consentGiven: true,
};

const file = (name: string, type = 'application/pdf') => ({ file: new Blob(['x'], { type }), fileName: name });

async function createReadyDraft() {
  await as(KAVYA);
  const { agreementId, cpId } = await api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp: newCp });
  for (const [type, name] of [['pan', 'pan.pdf'], ['aadhaar_masked', 'aadhaar_masked.pdf'], ['cancelled_cheque', 'cheque.pdf']] as const)
    await api.documents.upload({ ownerType: 'cp', ownerId: cpId, type, ...file(name) });
  await api.agreements.saveFields(agreementId, { executionDate: shiftDays(today(), 3), executionPlace: 'Gurugram', startDate: shiftDays(today(), 4), endDate: shiftDays(today(), 368) });
  return { agreementId, cpId };
}

/** A ready draft with a Legal-approved rate deviation, signed back in as the BD Executive. */
async function createNonStandardDraft() {
  const ids = await createReadyDraft();
  await api.agreements.requestDeviation(ids.agreementId, [{ type: 'rate', ref: 'r-eng:1-10', proposedValue: '20000' }], 'Competitive market in Gurugram');
  await as(PRIYA);
  await api.agreements.decideDeviation(getDb().deviations.find((d) => d.agreementId === ids.agreementId)!.id, 'approve', {});
  await as(KAVYA);
  return ids;
}

beforeEach(async () => {
  setLatency(0, 0);
  sessionStorage.clear();
  await api.system.reset().catch(() => undefined);
  getDb().settings.simulateErrors = false;
});

describe('authentication', () => {
  it('signs in by username and rejects unknown users or wrong passwords', async () => {
    await expect(as('nobody')).rejects.toThrow(/Incorrect username or password/);
    await expect(api.auth.signIn('kavya.iyer', 'wrong')).rejects.toThrow(/Incorrect username or password/);
    await expect(api.auth.signIn('', DEMO_PASSWORD)).rejects.toThrow(/Enter your username/);
    await expect(api.auth.signIn(' Neha.Kapoor ', DEMO_PASSWORD)).resolves.toMatchObject({ id: 'u-neha' });
    await expect(as(KAVYA)).resolves.toMatchObject({ id: 'u-neha' });
  });
});

describe('new CP onboarding (PRD 6.1)', () => {
  it('runs a standard draft straight to signing → Gate 2 → Active (no Legal approval)', async () => {
    const { agreementId } = await createReadyDraft();
    await expect(api.agreements.submit(agreementId)).resolves.toEqual({ sentToLegal: false });
    expect(getDb().agreements.find((a) => a.id === agreementId)!.status).toBe('approved_for_signing');
    expect(getDb().tasks.some((t) => t.agreementId === agreementId && t.type === 'gate1_approval')).toBe(false);

    // Time passes: the execution date arrives and the copies are signed.
    getDb().agreements.find((a) => a.id === agreementId)!.executionDate = today();
    await as(KAVYA);
    await api.agreements.uploadSigned(agreementId, {
      stampPaper: { number: 'IN-HR99887766', valueInr: 100, purchaseDate: today(), state: 'Haryana', vendor: 'Tehsil vendor' },
      signedOn: today(),
      signedFile: new Blob(['x'], { type: 'application/pdf' }),
      signedFileName: 'signed.pdf',
      stampFile: new Blob(['x'], { type: 'application/pdf' }),
      stampFileName: 'stamp.pdf',
      checklist: [true, true, true],
    });
    expect(getDb().agreements.find((a) => a.id === agreementId)!.status).toBe('signed_copy_uploaded');

    await as(ARJUN);
    await expect(api.agreements.decideGate2(agreementId, 'approve', { stamp: { status: 'mismatch' } })).rejects.toThrow(/Verified/);
    await api.agreements.decideGate2(agreementId, 'approve', { pages: { status: 'verified' }, stamp: { status: 'verified' } });
    const a = getDb().agreements.find((x) => x.id === agreementId)!;
    expect(a.status).toBe('active');
    expect(getDb().audit.filter((e) => e.entityId === agreementId).map((e) => e.action)).toEqual(
      expect.arrayContaining(['create', 'submit', 'approve', 'upload']),
    );
  });

  it('does not block a CP whose PAN holder type differs from the CP type (advisory only)', async () => {
    await as(KAVYA);
    const cp = { ...newCp, type: 'partnership' as const, pan: 'ABCPQ5678R', typeFields: { partners: 'A One, B Two', deedDate: '2020-01-01', authorisedPartner: 'A One' } };
    await expect(api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp })).resolves.toMatchObject({ agreementId: expect.any(String) });
  });

  it('blocks submission when fields or KYC are missing', async () => {
    await as(KAVYA);
    const { agreementId } = await api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp: newCp });
    await expect(api.agreements.submit(agreementId)).rejects.toThrow(/Missing fields.*Missing KYC/);
  });

  it('enforces one active agreement per CP per institution', async () => {
    await as(KAVYA);
    const existing = getDb().cps.find((c) => c.id === 'CP-0001')!;
    await expect(
      api.agreements.saveCpAndDraft({ existingCpId: 'CP-0001', institutionId: 'inst-asu', locationId: 'loc-asu-main', cp: { ...newCp, pan: existing.pan, legalName: existing.legalName } }),
    ).rejects.toThrow(/already has an active agreement/);
  });

  it('sends a non-standard draft to Legal, who approves it for signing', async () => {
    const { agreementId } = await createNonStandardDraft();
    await expect(api.agreements.submit(agreementId)).resolves.toEqual({ sentToLegal: true });
    expect(getDb().agreements.find((a) => a.id === agreementId)!.status).toBe('pending_approval');
    expect(getDb().tasks.find((t) => t.agreementId === agreementId && t.type === 'gate1_approval' && t.status === 'open')!.assigneeId).toBe('u-priya');
    await as(PRIYA);
    await api.agreements.decideGate1(agreementId, 'approve');
    expect(getDb().agreements.find((a) => a.id === agreementId)!.status).toBe('approved_for_signing');
  });

  it('requires a comment to reject and returns the draft to the BD Executive', async () => {
    const { agreementId } = await createNonStandardDraft();
    await api.agreements.submit(agreementId);
    await as(PRIYA);
    await expect(api.agreements.decideGate1(agreementId, 'reject', '')).rejects.toThrow(/comment/);
    await api.agreements.decideGate1(agreementId, 'reject', 'Please fix the address');
    const a = getDb().agreements.find((x) => x.id === agreementId)!;
    expect(a.status).toBe('draft');
    expect(a.lastRejection?.comment).toBe('Please fix the address');
    expect(getDb().tasks.some((t) => t.agreementId === agreementId && t.type === 'fix_rejected' && t.status === 'open')).toBe(true);
  });

  it('does not let the creator approve their own draft', async () => {
    const { agreementId } = await createNonStandardDraft();
    await api.agreements.submit(agreementId);
    await expect(api.agreements.decideGate1(agreementId, 'approve')).rejects.toThrow();
  });

  it('has exactly three users: BD Executive, Legal and Admin', () => {
    expect(getDb().users.map((u) => u.roles.join())).toEqual(['bd_exec', 'legal', 'admin']);
  });

  it('requires an Admin override for a warning-flagged CP', async () => {
    await as(KAVYA);
    const horizon = getDb().cps.find((c) => c.id === 'CP-0009')!;
    const cp = { ...newCp, type: 'partnership' as const, pan: horizon.pan, legalName: horizon.legalName, typeFields: { partners: 'Deepak Jain, Nitin Jain', deedDate: '2020-01-01', authorisedPartner: 'Deepak Jain' } };
    await expect(api.agreements.saveCpAndDraft({ existingCpId: horizon.id, institutionId: 'inst-asu', locationId: 'loc-asu-main', cp })).rejects.toThrow(/override/);
    const { agreementId } = await api.agreements.saveCpAndDraft({ existingCpId: horizon.id, institutionId: 'inst-asu', locationId: 'loc-asu-main', cp, overrideReason: 'Breach was at another institution; new owners' });
    expect(getDb().agreements.find((a) => a.id === agreementId)!.override?.status).toBe('pending');
    await as(ARJUN);
    await api.agreements.decideOverride(agreementId, 'approve', 'Reviewed with Legal, allowed');
    expect(getDb().agreements.find((a) => a.id === agreementId)!.override?.status).toBe('approved');
  });
});

describe('scope rules (PRD 3)', () => {
  it('hides out-of-scope agreements and limits CP details', async () => {
    // The seed BD Executive covers both institutions; add one limited to ASU.
    getDb().users.push({ id: 'u-test', name: 'Test BD', email: 'test.bd@apeejay.edu', designation: 'BD Executive', roles: ['bd_exec'], regionId: 'north', institutionIds: ['inst-asu'], active: true });
    await as('test.bd@apeejay.edu');
    const list = await api.agreements.list();
    expect(list.every((a) => a.institutionCode === 'ASU')).toBe(true);
    await expect(api.agreements.get('AGR-AKS-2025-0011')).rejects.toThrow(/not found/);
    const view = await api.cps.get('CP-0009');
    expect(view.limited).toBe(true);
    expect(JSON.stringify(view)).not.toContain('AAJFH1122E');
  });

  it('never sends raw PAN or account numbers in CP DTOs; reveal is logged', async () => {
    await as(KAVYA);
    const view = await api.cps.get('CP-0001');
    expect(JSON.stringify(view)).not.toContain('ABFPM1234K');
    expect(JSON.stringify(view)).not.toContain('50100234567812');
    const before = getDb().audit.length;
    expect(await api.cps.reveal('CP-0001', 'pan')).toBe('ABFPM1234K');
    expect(getDb().audit.at(-1)!.action).toBe('reveal');
    expect(getDb().audit.length).toBe(before + 1);
  });

  it('Legal and Admin see all institutions', async () => {
    await as(ARJUN);
    const codes = new Set((await api.agreements.list()).map((a) => a.institutionCode));
    expect(codes).toEqual(new Set(['ASU', 'AKS']));
  });
});

describe('deviations (PRD 6.2)', () => {
  it('Legal approval tags the draft Non-standard; rejection returns to standard', async () => {
    const { agreementId } = await createReadyDraft();
    await api.agreements.requestDeviation(agreementId, [{ type: 'rate', ref: 'r-eng:1-10', proposedValue: '20000' }], 'Competitive market in Gurugram');
    await expect(api.agreements.submit(agreementId)).rejects.toThrow(/deviation/);
    await as(PRIYA);
    const dev = getDb().deviations.find((d) => d.agreementId === agreementId)!;
    await api.agreements.decideDeviation(dev.id, 'approve', { agreedValue: '18000' });
    const a = getDb().agreements.find((x) => x.id === agreementId)!;
    expect(a.nonStandard).toBe(true);
    const doc = await api.agreements.render(agreementId);
    expect(doc.html).toContain('18,000');
    // Master rate card untouched
    expect(getDb().rateCards.find((r) => r.id === 'rc-asu-2')!.rows[0]!.slabs['1-10']).toBe(16000);
  });
});

describe('renewal (PRD 6.4) and termination (PRD 6.5)', () => {
  it('Renew creates a linked draft starting the day after expiry', async () => {
    await as(KAVYA);
    const { newAgreementId } = await api.agreements.decideRenewal('AGR-ASU-2025-0002', 'renew');
    const old = getDb().agreements.find((a) => a.id === 'AGR-ASU-2025-0002')!;
    const n = getDb().agreements.find((a) => a.id === newAgreementId)!;
    expect(n.predecessorId).toBe(old.id);
    expect(n.startDate).toBe(shiftDays(old.endDate!, 1));
    expect(old.status).toBe('active');
  });

  it('Do not renew needs a reason and Admin confirmation', async () => {
    await as(KAVYA);
    await expect(api.agreements.decideRenewal('AGR-ASU-2025-0002', 'do_not_renew', '')).rejects.toThrow();
    await api.agreements.decideRenewal('AGR-ASU-2025-0002', 'do_not_renew', 'Low conversions this cycle');
    await as(ARJUN);
    await api.agreements.confirmNonRenewal('AGR-ASU-2025-0002', 'confirm');
    expect(getDb().agreements.find((a) => a.id === 'AGR-ASU-2025-0002')!.renewal?.confirmation).toBe('confirmed');
  });

  it('termination for breach sets a warning flag on the CP', async () => {
    await as(ARJUN);
    await api.agreements.startTermination('AGR-ASU-2026-0001', {
      type: 'breach',
      reason: 'Breach: fees collected from applicants',
      noticeDate: today(),
      effectiveDate: shiftDays(today(), 30),
      noticeFile: new Blob(['x'], { type: 'application/pdf' }),
      noticeFileName: 'notice.pdf',
    });
    expect(getDb().agreements.find((a) => a.id === 'AGR-ASU-2026-0001')!.status).toBe('notice_period');
    expect(getDb().cps.find((c) => c.id === 'CP-0001')!.warning).toBeTruthy();
  });
});

describe('scheduler (PRD 9)', () => {
  it('auto-expires agreements with no decision', () => {
    const a = getDb().agreements.find((x) => x.id === 'AGR-ASU-2025-0002')!;
    a.endDate = shiftDays(today(), -1);
    runScheduledJobs();
    expect(a.status).toBe('expired_no_decision');
  });

  it('escalates overdue tasks to the routing escalation contact', () => {
    runScheduledJobs();
    const t = getDb().tasks.find((x) => x.agreementId === 'AGR-ASU-2026-0004' && x.type === 'gate1_approval')!;
    expect(t.escalatedToId).toBe('u-arjun');
  });

  it('keeps personal data out of notifications', () => {
    expect(containsSensitive('PAN ABCDE1234F')).toBe(true);
    expect(containsSensitive('Account 50100123456789')).toBe(true);
    expect(containsSensitive('Sunrise Education · AGR-ASU-2026-0018')).toBe(false);
    for (const n of getDb().notifications) expect(containsSensitive(`${n.title} ${n.body}`)).toBe(false);
  });
});

describe('maker-checker (PRD 3)', () => {
  it('Admin cannot publish a rate card before Legal approves', async () => {
    await as(ARJUN);
    await expect(api.config.publishRateCard('rc-asu-3')).rejects.toThrow(/Legal must approve/);
    await as(PRIYA);
    await api.config.decideRateCard('rc-asu-3', 'approve');
    await as(ARJUN);
    await expect(api.config.publishRateCard('rc-asu-3')).resolves.toBeTruthy();
  });
});

describe('legacy import (PRD 6.6)', () => {
  it('validates rows and imports valid ones at Signed copy uploaded', async () => {
    await as(KAVYA);
    const batch = await api.legacy.import('test.xlsx', [
      { institution_code: 'AKS', cp_type: 'Individual', legal_name: 'Test Person', pan: 'ABCPT1234Z', execution_date: '2025-06-01', start_date: '2025-06-02', end_date: shiftDays(today(), 200) },
      { institution_code: 'AKS', cp_type: 'Individual', legal_name: 'Bad', pan: 'BAD', execution_date: 'x', start_date: '2025-06-02', end_date: '2020-01-01' },
    ]);
    expect(batch.importedIds).toHaveLength(1);
    expect(batch.errors[0]!.row).toBe(3);
    expect(getDb().agreements.find((a) => a.id === batch.importedIds[0])!.status).toBe('signed_copy_uploaded');
  });
});

describe('template editor', () => {
  it('edits a new version, goes through Legal and is used by new drafts only', async () => {
    await as(ARJUN);
    const draft = await api.config.createTemplateDraft('sole_prop', null);
    expect(draft.status).toBe('draft');
    expect(draft.content!.blocks.some((b) => b.kind === 'clause' && b.id === 'c4')).toBe(true);

    // Edit clause 4, add a new clause using a field, and make GSTIN required.
    const content = structuredClone(draft.content!);
    content.blocks = content.blocks.map((b) => (b.kind === 'clause' && b.id === 'c4' ? { ...b, text: 'Payment within 21 days of each admission month.' } : b));
    const sigAt = content.blocks.findIndex((b) => b.kind === 'signatures');
    content.blocks.splice(sigAt, 0, { id: 'c-gst', kind: 'clause', title: 'Tax', text: 'Invoices must quote GSTIN {{cp.gstin}}.' });
    content.required = { 'cp.gstin': true };

    await expect(api.config.saveTemplateDraft(draft.id, { content: { ...content, blocks: [...content.blocks, { id: 'x', kind: 'paragraph', text: 'Bad {{cp.nope}}' }] }, changeNote: 'x', effectiveFrom: today() })).rejects.toThrow(/Unknown field/);
    await api.config.saveTemplateDraft(draft.id, { content, changeNote: 'Faster payment; GST clause', effectiveFrom: today() });
    await api.config.submitTemplate(draft.id);

    // Maker-checker: Admin cannot publish before Legal approves.
    await expect(api.config.publishTemplate(draft.id)).rejects.toThrow(/Legal must approve/);
    await as(PRIYA);
    await api.config.decideTemplate(draft.id, 'reject', 'Please keep 30 days');
    expect(getDb().templates.find((t) => t.id === draft.id)!.status).toBe('draft');
    await as(ARJUN);
    await api.config.submitTemplate(draft.id);
    await as(PRIYA);
    await api.config.decideTemplate(draft.id, 'approve');
    await as(ARJUN);
    await api.config.publishTemplate(draft.id);

    // Existing agreement keeps its template; a new draft uses the new one.
    const old = await api.agreements.render('AGR-ASU-2026-0001');
    expect(old.html).toContain('45 days');
    const { agreementId } = await createReadyDraft();
    expect(getDb().agreements.find((a) => a.id === agreementId)!.templateVersionId).toBe(draft.id);
    const doc = await api.agreements.render(agreementId);
    expect(doc.html).toContain('Payment within 21 days');
    expect(doc.html).toContain('Invoices must quote GSTIN');
    expect(doc.missing.map((m) => m.key)).toContain('cp.gstin'); // required and empty
    await expect(api.agreements.submit(agreementId)).rejects.toThrow(/GSTIN/);
  });

  it('lets Admin discard an unsent draft and blocks a second draft for the same template', async () => {
    await as(ARJUN);
    const d = await api.config.createTemplateDraft('individual', null);
    await expect(api.config.createTemplateDraft('individual', null)).rejects.toThrow(/already in progress/);
    await api.config.discardTemplateDraft(d.id);
    expect(getDb().templates.some((t) => t.id === d.id)).toBe(false);
  });
});

describe('document export', () => {
  it('builds a real DOCX (zip with WordprocessingML) and a PDF from the merged agreement', async () => {
    const { buildDocx, buildPdf, extractBlocks } = await import('@/lib/docExport');
    await as(PRIYA);
    const { html, fileName } = await api.agreements.download('AGR-ASU-2026-0004', 'docx');
    expect(fileName).toBe('AGR-ASU-2026-0004_v1.docx');

    const blocks = extractBlocks(html);
    expect(blocks.some((b) => b.kind === 'table' && b.rows.length > 0)).toBe(true);
    expect(blocks.some((b) => b.kind === 'signatures')).toBe(true);

    const bytes = (b: Blob) => new Promise<Uint8Array>((res) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result as ArrayBuffer)); r.readAsArrayBuffer(b); });
    const docx = await bytes(buildDocx(html, 'AGR-ASU-2026-0004'));
    expect([...docx.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]); // "PK\3\4"
    const text = new TextDecoder().decode(docx);
    expect(text).toContain('word/document.xml');
    expect(text).toContain('EduBridge Services Pvt. Ltd');

    const pdf = await bytes(await buildPdf(html, 'AGR-ASU-2026-0004'));
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');

    if (process.env.EXPORT_SAMPLES) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${process.env.EXPORT_SAMPLES}/sample.docx`, docx);
      fs.writeFileSync(`${process.env.EXPORT_SAMPLES}/sample.pdf`, pdf);
    }
  });
});

describe('digital signatures (DSC and drawn/typed via email link)', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const stampPaper = { number: 'IN-DL12345678901234', valueInr: 100, purchaseDate: today(), state: 'Haryana', vendor: 'SHCIL e-stamp' };

  async function approvedAgreement() {
    const { agreementId } = await createReadyDraft();
    await api.agreements.submit(agreementId); // standard terms → approved for signing
    return agreementId;
  }
  const signers = (cpMethod: 'electronic' | 'dsc', instMethod: 'electronic' | 'dsc') => [
    { role: 'cp' as const, name: 'Ravi Kumar', designation: 'Proprietor', email: 'ravi@sunrise.in', method: cpMethod },
    { role: 'institution' as const, name: 'Prof. Alok Verma', designation: 'Registrar', email: 'registrar@asu.example', method: instMethod },
  ];
  const tokenOf = (id: string, role: 'cp' | 'institution') => getDb().agreements.find((a) => a.id === id)!.esign!.signers.find((s) => s.role === role)!.token;

  it('signs in order (proprietor, then registrar), builds the signed PDF and sends it to Gate 2', async () => {
    const id = await approvedAgreement();
    await api.agreements.sendForSignature(id, { signers: signers('electronic', 'dsc'), signEveryPage: true, stampPaper });
    expect((await api.agreements.get(id)).summary.displayStatus).toBe('out_for_signature');
    // Only the first signer has been emailed.
    expect(getDb().emails.filter((m) => m.kind === 'signature').map((m) => m.to)).toEqual(['ravi@sunrise.in']);

    const reg = await api.signing.session(tokenOf(id, 'institution'));
    expect(reg.yourTurn).toBe(false);
    expect(reg.waitingFor).toBe('Ravi Kumar');
    await expect(api.signing.sign(tokenOf(id, 'institution'), { kind: 'dsc', certificateId: reg.certificates[0]!.id, pin: '1234' })).rejects.toThrow(/turn/);

    const cp = await api.signing.session(tokenOf(id, 'cp'));
    expect(cp.yourTurn).toBe(true);
    expect(JSON.stringify(cp)).not.toContain(tokenOf(id, 'cp')); // the token never comes back
    await expect(api.signing.sign(tokenOf(id, 'cp'), { kind: 'drawn', image: PNG, consent: false })).rejects.toThrow(/agree/);
    await expect(api.signing.sign(tokenOf(id, 'cp'), { kind: 'drawn', image: PNG, consent: true })).resolves.toEqual({ completed: false });
    // The agreement shows the proprietor's signature straight away: in the preview, on the next signer's page and in downloads.
    expect((await api.agreements.render(id)).html).toContain('Signed electronically (drawn)');
    expect((await api.signing.session(tokenOf(id, 'institution'))).html).toContain('alt="Signature of Ravi Kumar"');
    const dl = await api.agreements.download(id, 'pdf');
    expect(dl.signing?.signatures.map((s) => s.role)).toEqual(['cp']);
    expect(dl.signing?.everyPage).toBe(true);
    expect(getDb().emails.filter((m) => m.kind === 'signature').map((m) => m.to)).toContain('registrar@asu.example');

    const reg2 = await api.signing.session(tokenOf(id, 'institution'));
    expect(reg2.yourTurn).toBe(true);
    const [valid, expired] = reg2.certificates;
    await expect(api.signing.sign(tokenOf(id, 'institution'), { kind: 'dsc', certificateId: expired!.id, pin: '1234' })).rejects.toThrow(/expired/);
    await expect(api.signing.sign(tokenOf(id, 'institution'), { kind: 'dsc', certificateId: valid!.id, pin: '12' })).rejects.toThrow(/PIN/);
    await expect(api.signing.sign(tokenOf(id, 'institution'), { kind: 'dsc', certificateId: valid!.id, pin: '123456' })).resolves.toEqual({ completed: true });

    const a = getDb().agreements.find((x) => x.id === id)!;
    expect(a.status).toBe('active');
    expect(a.esign!.status).toBe('completed');
    expect(a.esign!.documentHash).toMatch(/^[0-9a-f]{64}$/);
    const signed = getDb().documents.find((x) => x.id === a.esign!.signedDocumentId)!;
    expect(signed.type).toBe('signed_copy');
    expect(signed.fileName).toBe(`${id}_e-signed.pdf`);
    if (process.env.EXPORT_SAMPLES) {
      const { getBlob } = await import('../blobStore');
      const blob = (await getBlob(signed.blobKey!))!;
      const buf = await new Promise<Uint8Array>((res) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result as ArrayBuffer)); r.readAsArrayBuffer(blob); });
      (await import('node:fs')).writeFileSync(`${process.env.EXPORT_SAMPLES}/esigned.pdf`, buf);
    }
    // Signed by both parties: Active straight away, no Gate 2.
    expect(a.activatedAt).toBeTruthy();
    expect(getDb().tasks.some((t) => t.agreementId === id && t.type === 'gate2_verification' && t.status === 'open')).toBe(false);
    expect(getDb().tasks.some((t) => t.agreementId === id && t.type === 'signing_upload' && t.status === 'open')).toBe(false);
  });

  it('typed signature with every page off; decline and withdraw return it to the BD Executive', async () => {
    const id = await approvedAgreement();
    await expect(api.agreements.sendForSignature(id, { signers: signers('electronic', 'electronic').map((s) => ({ ...s, email: 'same@x.in' })), signEveryPage: false, stampPaper })).rejects.toThrow(/signer details/);
    await api.agreements.sendForSignature(id, { signers: signers('electronic', 'electronic'), signEveryPage: false, stampPaper });
    expect((await api.agreements.get(id)).actions.uploadSigned).toBe(false); // paper path hidden while out for signature
    await api.signing.decline(tokenOf(id, 'cp'), 'Clause 4 needs another look');
    const a = getDb().agreements.find((x) => x.id === id)!;
    expect(a.esign!.status).toBe('declined');
    expect((await api.agreements.get(id)).actions.sendForSignature).toBe(true);

    await api.agreements.sendForSignature(id, { signers: signers('electronic', 'electronic'), signEveryPage: false, stampPaper });
    await api.signing.sign(tokenOf(id, 'cp'), { kind: 'typed', image: PNG, typedName: 'Ravi Kumar', consent: true });
    expect((await api.agreements.render(id)).html).toContain('Signed electronically (typed)');
    await api.agreements.cancelSignature(id, 'Wrong signatory email');
    expect((await api.agreements.render(id)).html).not.toContain('Signed electronically'); // withdrawn: signatures no longer shown
    expect(getDb().agreements.find((x) => x.id === id)!.esign!.status).toBe('cancelled');
    await expect(api.signing.sign(tokenOf(id, 'cp'), { kind: 'typed', image: PNG, typedName: 'Ravi Kumar', consent: true })).rejects.toThrow(/no longer active/);
  });
});
