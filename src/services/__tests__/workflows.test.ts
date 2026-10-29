import { beforeEach, describe, expect, it } from 'vitest';
import { api, type CpDTO } from '../mockApi';
import { setLatency, containsSensitive } from '../api/core';
import { getDb } from '../db';
import { runScheduledJobs } from '../api/scheduler';
import { shiftDays, today } from '@/lib/dates';
import type { CpFormValues } from '@/lib/schemas';
import { DEMO_PASSWORD } from '@/data/seed';
import { requiredKyc } from '@/lib/kyc';
import { correctedDocsToRecheck } from '@/lib/status';
import { handleSendEmail } from '../../../server/sendEmail';

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
  typeFields: { proprietorName: 'Ravi Kumar', msmeNumber: 'UDYAM-HR-05-0012345' },
  consentGiven: true,
};

const file = (name: string, type = 'application/pdf') => ({ file: new Blob(['x'], { type }), fileName: name });

async function createReadyDraft() {
  await as(KAVYA);
  const { agreementId, cpId } = await api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp: newCp });
  // Everything the KYC checklist requires from a Sole Proprietorship Firm.
  for (const k of requiredKyc('sole_prop', false)) await api.documents.upload({ ownerType: 'cp', ownerId: cpId, type: k.type, ...file(`${k.type}_masked.pdf`) });
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

/** As the BD Executive: finalise the draft, then upload a paper-signed copy (it then goes to Legal). */
async function finaliseAndSignOnPaper(agreementId: string) {
  await as(KAVYA);
  await api.agreements.submit(agreementId);
  // Time passes: the execution date arrives and the copies are signed.
  getDb().agreements.find((a) => a.id === agreementId)!.executionDate = today();
  await api.agreements.uploadSigned(agreementId, {
    stampPaper: { number: 'IN-HR99887766', valueInr: 100, purchaseDate: today(), state: 'Haryana', vendor: 'Tehsil vendor' },
    signedOn: today(),
    signedFile: new Blob(['x'], { type: 'application/pdf' }),
    signedFileName: 'signed.pdf',
    stampFile: new Blob(['x'], { type: 'application/pdf' }),
    stampFileName: 'stamp.pdf',
    checklist: [true, true, true],
  });
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
    await expect(api.auth.signIn(' Kavya.Iyer ', DEMO_PASSWORD)).resolves.toMatchObject({ id: 'u-neha' });
    await expect(as(KAVYA)).resolves.toMatchObject({ id: 'u-neha' });
  });
});

describe('new CP onboarding (PRD 6.1)', () => {
  it('runs BD → paper signing → Legal → Active', async () => {
    const { agreementId, cpId } = await createReadyDraft();
    await expect(api.agreements.submit(agreementId)).resolves.toEqual({ sentToLegal: false });
    expect(getDb().agreements.find((a) => a.id === agreementId)!.status).toBe('approved_for_signing');
    expect(getDb().tasks.some((t) => t.agreementId === agreementId && t.type === 'gate1_approval')).toBe(false);

    getDb().agreements.find((a) => a.id === agreementId)!.executionDate = today();
    await api.agreements.uploadSigned(agreementId, {
      stampPaper: { number: 'IN-HR99887766', valueInr: 100, purchaseDate: today(), state: 'Haryana', vendor: 'Tehsil vendor' },
      signedOn: today(),
      signedFile: new Blob(['x'], { type: 'application/pdf' }),
      signedFileName: 'signed.pdf',
      stampFile: new Blob(['x'], { type: 'application/pdf' }),
      stampFileName: 'stamp.pdf',
      checklist: [true, true, true],
    });
    // Signed: it goes to Legal (no Gate 2 for app agreements).
    expect(getDb().agreements.find((a) => a.id === agreementId)!.status).toBe('pending_approval');
    expect(getDb().tasks.find((t) => t.agreementId === agreementId && t.type === 'gate1_approval' && t.status === 'open')!.assigneeId).toBe('u-priya');
    expect(getDb().tasks.some((t) => t.agreementId === agreementId && t.type === 'gate2_verification')).toBe(false);

    await as(PRIYA);
    await api.agreements.decideGate1(agreementId, 'approve');
    // Legal's approval is the last step: no Admin approval, the agreement is Active.
    // Legal's review verifies the CP's KYC documents.
    expect(getDb().documents.filter((x) => x.ownerType === 'cp' && x.ownerId === cpId).every((x) => x.verificationStatus === 'verified')).toBe(true);
    expect(getDb().tasks.some((t) => t.agreementId === agreementId && t.status === 'open')).toBe(false);
    const a = getDb().agreements.find((x) => x.id === agreementId)!;
    expect(a.status).toBe('active');
    expect(a.activatedAt).toBeTruthy();
    expect(getDb().documents.find((x) => x.ownerId === agreementId && x.type === 'signed_copy')!.verificationStatus).toBe('verified');
    expect(getDb().audit.filter((e) => e.entityId === agreementId).map((e) => e.action)).toEqual(
      expect.arrayContaining(['create', 'submit', 'approve', 'upload']),
    );
  });

  it('does not block a CP whose PAN holder type differs from the CP type (advisory only)', async () => {
    await as(KAVYA);
    const cp = { ...newCp, type: 'partnership' as const, pan: 'ABCPQ5678R', typeFields: { partners: 'A One, B Two', deedDate: '2020-01-01', authorisedPartner: 'A One', ownerPan: 'ABCPO1234N' } };
    await expect(api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp })).resolves.toMatchObject({ agreementId: expect.any(String) });
  });

  it('asks for the fields and KYC documents of each CP category (checklist 2026)', async () => {
    await as(KAVYA);
    const firm = { ...newCp, type: 'proprietorship' as const, pan: 'AAJFR1234K', legalName: 'Ravi Career Point', typeFields: {} };
    const err = await api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp: firm }).catch((e) => e);
    expect(Object.keys(err.fieldErrors)).toEqual(expect.arrayContaining(['typeFields.ownerName', 'typeFields.ownerPan', 'typeFields.msmeNumber', 'typeFields.businessRegistration']));
    const ok = { ...firm, typeFields: { ownerName: 'Ravi Kumar', ownerPan: 'ABCPK1234L', msmeNumber: 'UDYAM-HR-05-0099999', businessRegistration: 'Trade licence TL/2021/1' } };
    const { cpId } = await api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp: ok });
    expect(getDb().cps.find((c) => c.id === cpId)!.typeFields.ownerPan).toBe('ABCPK1234L');
    // The CP view never shows the owner's full PAN.
    expect(((await api.cps.get(cpId)).cp as { typeFields?: { ownerPan?: string } }).typeFields?.ownerPan).toBe('ABCPK••••L');

    const company = { ...newCp, type: 'pvt_ltd' as const, pan: 'AABCZ1234K', legalName: 'Zeta Learning Pvt Ltd', residenceAddress: '', typeFields: { cin: 'U80900DL2018PTC334455', incorporationDate: '2018-04-01', registeredOffice: 'B-12, Lajpat Nagar II, New Delhi', authorisedSignatory: 'Z Director, Director', boardResolutionDate: '2026-01-10', ownerPan: 'ABCPZ1234K' } };
    const { agreementId } = await api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp: company });
    await expect(api.agreements.submit(agreementId)).rejects.toThrow(/Certificate of incorporation.*PAN card of the director/);

    // Individuals aren't GST registered on the checklist.
    const person = { ...newCp, type: 'individual' as const, pan: 'ABCPI1234K', gstRegistered: true, gstin: 'bad', typeFields: { fatherName: 'Shri A', dob: '1980-01-01' } };
    const ind = await api.agreements.saveCpAndDraft({ institutionId: 'inst-asu', locationId: 'loc-asu-main', cp: person });
    expect(getDb().cps.find((c) => c.id === ind.cpId)!.gstRegistered).toBe(false);
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

  it('Admin can also give the Legal approval, which makes the agreement Active', async () => {
    const { agreementId } = await createReadyDraft();
    await finaliseAndSignOnPaper(agreementId);
    await as(ARJUN);
    expect((await api.agreements.get(agreementId)).actions.approveGate1).toBe(true);
    await api.agreements.decideGate1(agreementId, 'approve');
    expect(getDb().agreements.find((x) => x.id === agreementId)!.status).toBe('active');
  });

  it('Legal asks for corrected documents; the CP re-uploads them from a link; BD checks and resubmits', async () => {
    const { agreementId, cpId } = await createReadyDraft();
    await finaliseAndSignOnPaper(agreementId);
    const pan = getDb().documents.find((x) => x.ownerType === 'cp' && x.ownerId === cpId && x.type === 'pan')!;

    await as(PRIYA);
    await expect(api.agreements.requestDocChanges(agreementId, [{ documentId: pan.id, remark: ' ' }])).rejects.toThrow(/remark/);
    await api.agreements.requestDocChanges(agreementId, [{ documentId: pan.id, remark: 'PAN copy is blurred' }], 'Please get a clear scan');
    let a = getDb().agreements.find((x) => x.id === agreementId)!;
    // The signed agreement waits with the BD; it does not go back to Draft or need signing again.
    expect(a.status).toBe('signed_copy_uploaded');
    expect((await api.agreements.get(agreementId)).summary.displayStatus).toBe('docs_requested');
    expect(a.docRequest?.status).toBe('with_bd');
    expect(pan.verificationStatus).toBe('mismatch');
    expect(pan.remarks).toBe('PAN copy is blurred');
    expect(getDb().tasks.some((t) => t.agreementId === agreementId && t.type === 'cp_doc_request' && t.status === 'open' && t.assigneeId === 'u-neha')).toBe(true);

    await as(KAVYA);
    expect((await api.agreements.get(agreementId)).actions.verifyGate2).toBe(false);
    const { link } = await api.agreements.sendDocRequestLink(agreementId, 'ravi@sunrise.in');
    const token = link.split('/').pop()!;
    expect(getDb().emails.some((m) => m.to === 'ravi@sunrise.in' && m.link === link)).toBe(true);

    // The CP, with no account, opens the link.
    const session = await api.cpDocs.session(token);
    expect(session.items).toEqual([expect.objectContaining({ documentType: 'pan', remark: 'PAN copy is blurred' })]);
    expect(session.open).toBe(true);
    await expect(api.cpDocs.submit(token)).rejects.toThrow(/Upload every requested document/);
    await api.cpDocs.upload(token, 'pan', new Blob(['y'], { type: 'application/pdf' }), 'pan-clear.pdf');
    await api.cpDocs.submit(token, 'Clear scan attached');
    a = getDb().agreements.find((x) => x.id === agreementId)!;
    expect(a.docRequest?.status).toBe('cp_submitted');
    expect((await api.cpDocs.session(token)).open).toBe(false);
    expect(getDb().tasks.some((t) => t.agreementId === agreementId && t.type === 'cp_doc_review' && t.status === 'open')).toBe(true);

    await api.agreements.acceptCpDocs(agreementId);
    a = getDb().agreements.find((x) => x.id === agreementId)!;
    expect(a.docRequest?.status).toBe('closed');
    expect(a.status).toBe('pending_approval');
    // Legal re-checks only the corrected PAN, not every document again.
    expect(correctedDocsToRecheck(a)?.map((it) => it.documentType)).toEqual(['pan']);

    await as(PRIYA);
    await api.agreements.decideGate1(agreementId, 'approve');
    expect(correctedDocsToRecheck(getDb().agreements.find((x) => x.id === agreementId)!)).toBeNull();
    const newPan = getDb().documents.find((x) => x.ownerType === 'cp' && x.ownerId === cpId && x.fileName === 'pan-clear.pdf')!;
    expect(newPan.verificationStatus).toBe('verified');
    expect(getDb().agreements.find((x) => x.id === agreementId)!.status).toBe('active');
  });

  it('emails the CP their upload link for the corrected documents, through the real-delivery relay', async () => {
    const { agreementId, cpId } = await createReadyDraft();
    await finaliseAndSignOnPaper(agreementId);
    const docOf = (type: string) => getDb().documents.find((x) => x.ownerType === 'cp' && x.ownerId === cpId && x.type === type)!;
    await as(PRIYA);
    await api.agreements.requestDocChanges(agreementId, [{ documentId: docOf('pan').id, remark: 'PAN copy is blurred' }], 'Please get a clear scan');

    // Real delivery on (as with NEXT_PUBLIC_EMAIL_DELIVERY=resend in .env); capture what the app posts to the relay.
    vi.stubEnv('NEXT_PUBLIC_EMAIL_DELIVERY', 'resend');
    const relayed: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => (relayed.push(JSON.parse(init.body as string)), new Response(JSON.stringify({ id: 'em_1' })))));
    try {
      await as(KAVYA);
      const before = getDb().emails.length;
      const { link } = await api.agreements.sendDocRequestLink(agreementId, 'ravi@sunrise.in');

      // Exactly one email, to the CP, carrying their personal link and what to fix.
      const sent = getDb().emails.slice(before);
      expect(sent).toHaveLength(1);
      const [m] = sent;
      expect(m).toMatchObject({ to: 'ravi@sunrise.in', link, kind: 'task' });
      expect(m!.subject).toContain(agreementId);
      expect(m!.body).toContain('PAN copy is blurred');
      expect(m!.body).toMatch(/Do not forward it/);

      // Handed to the relay, which accepts it and would send it through Resend with an absolute link.
      expect(relayed).toEqual([{ to: 'ravi@sunrise.in', subject: m!.subject, body: m!.body, link, kind: 'task' }]);
      const resend = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ id: 'em_2' })));
      const res = await handleSendEmail(
        new Request('http://x/api/send-email', { method: 'POST', body: JSON.stringify(relayed[0]) }),
        { RESEND_API_KEY: 're_test', EMAIL_FROM: 'CP <n@example.com>', APP_URL: 'https://cp.apeejay.example' },
        resend as unknown as typeof fetch,
      );
      expect(res.status).toBe(200);
      const toResend = JSON.parse(resend.mock.calls[0]![1]!.body as string);
      expect(toResend.to).toEqual(['ravi@sunrise.in']);
      expect(toResend.text).toContain(`https://cp.apeejay.example${link}`);
      await vi.waitFor(() => expect(m!.delivery).toEqual({ status: 'sent', providerId: 'em_1' }));

      // The link opens the CP's upload page for just the flagged document.
      const session = await api.cpDocs.session(link.split('/').pop()!);
      expect(session.items.map((it) => it.documentType)).toEqual(['pan']);

      // Resending emails a fresh link; the old one stops working.
      const again = await api.agreements.sendDocRequestLink(agreementId, 'ravi@sunrise.in');
      expect(again.link).not.toBe(link);
      expect(getDb().emails.slice(before).map((x) => x.link)).toEqual([link, again.link]);
      await expect(api.cpDocs.session(link.split('/').pop()!)).rejects.toThrow();

      // A bad address sends nothing.
      await expect(api.agreements.sendDocRequestLink(agreementId, 'not-an-email')).rejects.toThrow(/valid email/);
      expect(getDb().emails.length).toBe(before + 2);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('sends a signed non-standard agreement to Legal, whose approval makes it Active', async () => {
    const { agreementId } = await createNonStandardDraft();
    await finaliseAndSignOnPaper(agreementId);
    expect(getDb().agreements.find((a) => a.id === agreementId)!.status).toBe('pending_approval');
    await as(PRIYA);
    await api.agreements.decideGate1(agreementId, 'approve');
    expect(getDb().agreements.find((a) => a.id === agreementId)!.status).toBe('active');
  });

  it('requires a comment to reject and returns the draft to the BD Executive', async () => {
    const { agreementId } = await createNonStandardDraft();
    await finaliseAndSignOnPaper(agreementId);
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
    await finaliseAndSignOnPaper(agreementId);
    await expect(api.agreements.decideGate1(agreementId, 'approve')).rejects.toThrow();
  });

  it('has exactly three users: BD Executive, Legal and Admin', () => {
    expect(getDb().users.map((u) => u.roles.join())).toEqual(['bd_exec', 'legal', 'admin']);
  });

  it('requires an Admin override for a warning-flagged CP', async () => {
    await as(KAVYA);
    const horizon = getDb().cps.find((c) => c.id === 'CP-0009')!;
    const cp = { ...newCp, type: 'partnership' as const, pan: horizon.pan, legalName: horizon.legalName, typeFields: { partners: 'Deepak Jain, Nitin Jain', deedDate: '2020-01-01', authorisedPartner: 'Deepak Jain', ownerPan: 'ADJPJ6654Q' } };
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

  it('Legal decides a whole request at once; the review task closes and nothing stays pending', async () => {
    const { agreementId } = await createReadyDraft();
    await api.agreements.requestDeviation(
      agreementId,
      [
        { type: 'rate', ref: 'r-eng:1-10', proposedValue: '20000' },
        { type: 'rate', ref: 'r-eng:11-15', proposedValue: '21000' },
      ],
      'Competitive market in Gurugram',
    );
    await as(PRIYA);
    const devs = getDb().deviations.filter((d) => d.agreementId === agreementId);
    await expect(api.agreements.decideDeviations(agreementId, [{ id: devs[0]!.id, decision: 'approve' }, { id: devs[1]!.id, decision: 'reject' }])).rejects.toThrow(/comment/i);
    expect(getDb().deviations.filter((d) => d.agreementId === agreementId && d.status === 'pending')).toHaveLength(2);
    await api.agreements.decideDeviations(agreementId, devs.map((d) => ({ id: d.id, decision: 'approve' as const })));
    expect(getDb().deviations.filter((d) => d.agreementId === agreementId).map((d) => d.status)).toEqual(['approved', 'approved']);
    expect(getDb().tasks.some((t) => t.type === 'deviation_review' && t.agreementId === agreementId && t.status === 'open')).toBe(false);
    expect((await api.inbox.dashboard()).legal!.deviations.some((x) => x.agreement.id === agreementId)).toBe(false);
  });

  it('Several deviations in one request, each with its own reason and supporting documents', async () => {
    const { agreementId } = await createReadyDraft();
    const pdf = (name: string) => ({ file: new Blob(['x'], { type: 'application/pdf' }), name });
    const wording = 'Payment shall be made within 30 days of the close of each admission month against a valid invoice.';
    await api.agreements.requestDeviation(
      agreementId,
      [
        { type: 'rate', ref: 'r-eng:1-10', proposedValue: '20000' },
        { type: 'rate', ref: 'r-eng:11-15', proposedValue: '21000' },
        { type: 'clause', ref: 'c4', proposedValue: wording, reason: 'Partner payroll runs monthly', files: [pdf('partner_email.pdf')] },
        { type: 'clause', ref: 'c5', proposedValue: `${wording} Extended.`, reason: 'Matches the competitor contract', files: [] },
      ],
      'Competing offer in Gurugram',
      [pdf('competitor_offer.pdf')],
    );
    const devs = getDb().deviations.filter((d) => d.agreementId === agreementId);
    expect(devs).toHaveLength(4);
    const docName = (id: string) => getDb().documents.find((x) => x.id === id)!.fileName;
    const rates = devs.filter((d) => d.type === 'rate');
    expect(rates.map((d) => d.reason)).toEqual(['Competing offer in Gurugram', 'Competing offer in Gurugram']);
    // The shared document is stored once and linked to both rate changes.
    expect(rates[0]!.documentIds).toEqual(rates[1]!.documentIds);
    expect(rates[0]!.documentIds!.map(docName)).toEqual(['competitor_offer.pdf']);
    const c4 = devs.find((d) => d.ref === 'c4')!;
    expect(c4.reason).toBe('Partner payroll runs monthly');
    expect(c4.documentIds!.map(docName)).toEqual(['partner_email.pdf']);
    expect(devs.find((d) => d.ref === 'c5')!.documentIds).toBeUndefined();
    expect(getDb().documents.filter((x) => x.ownerId === agreementId && x.type === 'deviation_support')).toHaveLength(2);
    // Every change needs a reason, and a clause can only be changed once per request.
    await expect(api.agreements.requestDeviation(agreementId, [{ type: 'clause', ref: 'c4', proposedValue: wording }])).rejects.toThrow(/reason/);
    await expect(
      api.agreements.requestDeviation(agreementId, [
        { type: 'clause', ref: 'c4', proposedValue: wording, reason: 'First reason' },
        { type: 'clause', ref: 'c4', proposedValue: wording, reason: 'Second reason' },
      ]),
    ).rejects.toThrow(/twice/);
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
    // A second discard (double click, another tab) is a no-op, not an error.
    await expect(api.config.discardTemplateDraft(d.id)).resolves.toBeUndefined();
  });

  it('lets Admin withdraw a version waiting for Legal and discard it, but not a published one', async () => {
    await as(ARJUN);
    // Seed: Partnership v2 (tpl-pa-2) is waiting for Legal.
    await api.config.discardTemplateDraft('tpl-pa-2');
    expect(getDb().templates.some((t) => t.id === 'tpl-pa-2')).toBe(false);
    expect(getDb().tasks.find((t) => t.refId === 'tpl-pa-2' && t.type === 'template_approval')!.status).toBe('cancelled');
    await expect(api.config.discardTemplateDraft('tpl-pa-1')).rejects.toThrow(/kept for history/);
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
    await api.agreements.submit(agreementId); // finalised → ready for signing
    return agreementId;
  }
  const signers = (cpMethod: 'electronic' | 'dsc', instMethod: 'electronic' | 'dsc') => [
    { role: 'cp' as const, name: 'Ravi Kumar', designation: 'Proprietor', email: 'ravi@sunrise.in', method: cpMethod },
    { role: 'institution' as const, name: 'Prof. Alok Verma', designation: 'Registrar', email: 'registrar@asu.example', method: instMethod },
  ];
  const tokenOf = (id: string, role: 'cp' | 'institution') => getDb().agreements.find((a) => a.id === id)!.esign!.signers.find((s) => s.role === role)!.token;

  it('signs in order (proprietor, then registrar), builds the signed PDF and sends it to Legal', async () => {
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
    expect(a.status).toBe('pending_approval');
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
    // Signed by both parties: on to Legal review, no Gate 2.
    expect(getDb().tasks.some((t) => t.agreementId === id && t.type === 'gate1_approval' && t.status === 'open')).toBe(true);
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

describe('clear all records', () => {
  it('Admin deletes every record but keeps the set-up, and numbering restarts', async () => {
    await as(ARJUN);
    await api.system.clearRecords();
    const d = getDb();
    expect([d.cps, d.agreements, d.deviations, d.notifications, d.emails, d.legacyBatches].every((x) => x.length === 0)).toBe(true);
    expect(d.documents.every((x) => x.ownerType === 'template')).toBe(true);
    expect(d.users.length).toBeGreaterThan(0);
    expect(d.templates.length).toBeGreaterThan(0);
    expect(d.rateCards.length).toBeGreaterThan(0);
    expect(await api.agreements.list()).toHaveLength(0);
    const { agreementId, cpId } = await createReadyDraft();
    expect(cpId).toBe('CP-0001');
    expect(agreementId).toMatch(/-0001$/);
    await as(KAVYA);
    await expect(api.system.clearRecords()).rejects.toThrow();
  });
});

describe('manual signing upload', () => {
  it('uploads the signed copy without a signing date or checklist; the upload day is recorded and it goes to Legal', async () => {
    const { agreementId } = await createReadyDraft();
    await api.agreements.submit(agreementId);
    getDb().agreements.find((a) => a.id === agreementId)!.executionDate = today();
    await api.agreements.uploadSigned(agreementId, {
      stampPaper: { number: 'IN-HR99887766', valueInr: 100, purchaseDate: today(), state: 'Haryana', vendor: 'Tehsil vendor' },
      signedFile: new Blob(['x'], { type: 'application/pdf' }),
      signedFileName: 'signed.pdf',
      stampFile: new Blob(['x'], { type: 'application/pdf' }),
      stampFileName: 'stamp.pdf',
    });
    const a = getDb().agreements.find((x) => x.id === agreementId)!;
    expect(a.status).toBe('pending_approval');
    expect(a.signedOn).toBe(today());
  });
});

describe('CP contact verification (email link + mobile code)', () => {
  const codeFromSms = () => /^(\d{6}) /.exec(getDb().sms!.at(-1)!.body)![1]!;
  const tokenFromEmail = () => getDb().emails.filter((e) => e.kind === 'verification').at(-1)!.link!.replace('/verify/', '');
  const contactOf = async (cpId: string) => ((await api.cps.get(cpId)).cp as CpDTO).contact;

  it('starts by itself when the agreement goes to Legal, without holding up Legal’s review', async () => {
    const { agreementId, cpId } = await createReadyDraft();
    expect((await contactOf(cpId))).toMatchObject({ email: 'not_started', mobile: 'not_started' });
    await finaliseAndSignOnPaper(agreementId);
    const a = getDb().agreements.find((x) => x.id === agreementId)!;
    expect(a.status).toBe('pending_approval');
    const email = getDb().emails.filter((e) => e.kind === 'verification').at(-1)!;
    expect(email).toMatchObject({ to: 'ravi@sunrise.in', subject: 'Please verify your contact details for Apeejay', link: expect.stringMatching(/^\/verify\/[0-9a-f]{32}$/) });
    expect((await contactOf(cpId))).toMatchObject({ email: 'pending', mobile: 'pending', linkExpired: false });
    // The token and code never reach the screens.
    expect(JSON.stringify(await api.cps.get(cpId))).not.toContain(tokenFromEmail());

    // Legal can approve while the CP has not verified yet: the two run side by side.
    await as(PRIYA);
    await api.agreements.decideGate1(agreementId, 'approve');
    expect(a.status).toBe('active');
  });

  it('the CP confirms their email, then their mobile with a code; the BD and Legal are told', async () => {
    const { agreementId, cpId } = await createReadyDraft();
    await finaliseAndSignOnPaper(agreementId);
    const token = tokenFromEmail();
    sessionStorage.clear(); // the CP has no account

    const s = await api.verifyContact.session(token);
    expect(s).toMatchObject({ cpName: 'Sunrise Education Services', emailMasked: 'ra••@sunrise.in', mobileMasked: '•••••••345', email: 'pending', mobile: 'pending', codeSent: false });
    await api.verifyContact.confirmEmail(token);
    expect((await api.verifyContact.session(token)).email).toBe('verified');

    expect(await api.verifyContact.sendCode(token)).toEqual({ sentTo: '•••••••345' });
    const sms = getDb().sms!.at(-1)!;
    expect(sms).toMatchObject({ to: '9812012345', kind: 'otp' });
    expect(sms.body).toMatch(/^\d{6} is your Apeejay CP verification code/);
    // Only a hash of the code is stored.
    expect(JSON.stringify(getDb().cps.find((c) => c.id === cpId)!.contactVerification)).not.toContain(codeFromSms());

    await expect(api.verifyContact.verifyCode(token, '12345')).rejects.toThrow('Enter the 6-digit code from the text message.');
    const wrong = codeFromSms() === '000000' ? '111111' : '000000';
    await expect(api.verifyContact.verifyCode(token, wrong)).rejects.toThrow('That code is not right. 4 attempts left.');
    await api.verifyContact.verifyCode(token, codeFromSms());

    await as(KAVYA);
    expect((await contactOf(cpId))).toMatchObject({ email: 'verified', mobile: 'verified', emailVerifiedAt: expect.any(String), mobileVerifiedAt: expect.any(String) });
    const told = getDb().notifications.filter((n) => n.title === 'CP contact details verified').map((n) => n.userId);
    expect(told).toEqual(expect.arrayContaining(['u-neha', 'u-priya']));
    // Reopening the link shows that both are done (and confirming again changes nothing).
    expect(await api.verifyContact.session(token)).toMatchObject({ email: 'verified', mobile: 'verified' });
    await api.verifyContact.confirmEmail(token);
    expect(getDb().notifications.filter((n) => n.title === 'CP contact details verified').map((n) => n.userId)).toEqual(told);
  });

  it('limits codes: wait before resending, 5 wrong tries, expiry', async () => {
    const { agreementId } = await createReadyDraft();
    await finaliseAndSignOnPaper(agreementId);
    const token = tokenFromEmail();
    await api.verifyContact.sendCode(token);
    await expect(api.verifyContact.sendCode(token)).rejects.toThrow('Please wait 30 seconds before asking for another code.');
    const wrong = codeFromSms() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await expect(api.verifyContact.verifyCode(token, wrong)).rejects.toThrow(/not right/);
    await expect(api.verifyContact.verifyCode(token, wrong)).rejects.toThrow('Too many wrong codes. Ask for a new code.');
    // Even the right code no longer works after 5 wrong tries.
    await expect(api.verifyContact.verifyCode(token, codeFromSms())).rejects.toThrow('Too many wrong codes. Ask for a new code.');

    const cp = getDb().cps.find((c) => c.contactVerification?.token === token)!;
    cp.contactVerification!.otp = { ...cp.contactVerification!.otp!, attempts: 0, expiresAt: new Date(Date.now() - 1000).toISOString() };
    await expect(api.verifyContact.verifyCode(token, codeFromSms())).rejects.toThrow('This code has expired. Ask for a new code.');
    cp.contactVerification!.linkExpiresAt = new Date(Date.now() - 1000).toISOString();
    await expect(api.verifyContact.confirmEmail(token)).rejects.toThrow('This link has expired. Ask your Apeejay contact to send a new one.');
  });

  it('the BD can resend; a new link replaces the old one; changing the mobile asks for it again', async () => {
    const { agreementId, cpId } = await createReadyDraft();
    await finaliseAndSignOnPaper(agreementId);
    const first = tokenFromEmail();
    await as(KAVYA);
    const { link } = await api.cps.sendVerification(cpId);
    expect(link).not.toBe(`/verify/${first}`);
    await expect(api.verifyContact.session(first)).rejects.toThrow('This verification link is not valid. Ask your Apeejay contact to send you a new one.');

    const token = tokenFromEmail();
    await api.verifyContact.confirmEmail(token);
    await api.verifyContact.sendCode(token);
    await api.verifyContact.verifyCode(token, codeFromSms());
    await expect(api.cps.sendVerification(cpId)).rejects.toThrow('This CP’s email and mobile are already verified.');

    // A new mobile has not been verified, so it shows as not verified again and can be re-sent.
    getDb().cps.find((c) => c.id === cpId)!.mobile = '9876543210';
    expect((await contactOf(cpId))).toMatchObject({ email: 'verified', mobile: 'pending' });
    await expect(api.cps.sendVerification(cpId)).resolves.toMatchObject({ link: expect.stringMatching(/^\/verify\//) });

    await as(PRIYA);
    await expect(api.cps.sendVerification(cpId)).rejects.toMatchObject({ status: 403 });
  });

  it('sends the verification email through the relay with its own button', async () => {
    const res = await handleSendEmail(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ to: 'ravi@sunrise.in', subject: 'Please verify your contact details for Apeejay', body: 'Hello', link: '/verify/abc', kind: 'verification' }) }),
      { RESEND_API_KEY: 're_x', EMAIL_FROM: 'CP <n@example.com>', APP_URL: 'https://app.example.com' },
      async (_u, init) => {
        expect(String((init as RequestInit).body)).toContain('Verify my details');
        return new Response(JSON.stringify({ id: 'em_9' }), { status: 200 });
      },
    );
    expect(res.status).toBe(200);
  });
});
