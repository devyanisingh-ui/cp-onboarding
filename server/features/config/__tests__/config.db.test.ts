import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@/types';
import { today } from '@/lib/dates';
import { prisma } from '../../../platform/db';
import { as, seedDemoConfig, seeded } from '../../../test/helpers';
import { firstUserWithRole, routeFor } from '../settings';
import * as s from '../settings';
import * as v from '../versions';
import { onRateCardPublished, onTemplateInUse } from '../hooks';

let kavya: User, priya: User, arjun: User;

beforeEach(async () => {
  await seedDemoConfig();
  [kavya, priya, arjun] = await Promise.all([seeded('u-neha'), seeded('u-priya'), seeded('u-arjun')]);
});

describe('lookups and helpers', () => {
  it('gives every signed-in user the reference data, in the mock’s shapes', async () => {
    const l = await as(kavya, () => s.lookups());
    expect(l.institutions.length).toBe(10);
    const asu = l.institutions.find((i) => i.shortCode === 'ASU')!;
    expect(asu.locations.length).toBeGreaterThan(0);
    expect(asu.programmeGroups.length).toBeGreaterThan(0);
    expect(l.users.find((u) => u.id === 'u-neha')).toMatchObject({ name: 'Kavya Iyer', roles: ['bd_exec'], institutionIds: expect.arrayContaining(['inst-asu']) });
    expect(l.sla.gate1Days).toBeGreaterThan(0);
    expect(l.masterLists.terminationReasons.length).toBeGreaterThan(0);
    await expect(as(null, () => s.lookups())).rejects.toMatchObject({ status: 401 });
  });

  it('finds the approver for an institution, preferring someone who works there', async () => {
    expect((await as(null, () => firstUserWithRole('legal', 'inst-asu')))?.id).toBe('u-priya');
    expect((await as(null, () => firstUserWithRole('admin')))?.id).toBe('u-arjun');
    const rule = await as(null, () => routeFor('inst-asu', true));
    expect(rule).toMatchObject({ institutionId: 'inst-asu' });
  });
});

describe('institutions, users and settings (Admin only)', () => {
  it('adds and edits an institution with its campuses, audit-logged', async () => {
    const asu = (await as(arjun, () => s.lookups())).institutions.find((i) => i.shortCode === 'ASU')!;
    const added = await as(arjun, () => s.saveInstitution({ ...asu, id: '', shortCode: 'NEWU', legalName: 'New University', locations: [{ id: '', name: 'Main campus', city: 'Pune' }] }));
    expect(added).toMatchObject({ id: 'inst-newu', locations: [{ name: 'Main campus', city: 'Pune', id: expect.stringMatching(/^loc-newu-/) }] });
    const edited = await as(arjun, () => s.saveInstitution({ ...added, city: 'Mumbai', locations: [...added.locations, { id: '', name: 'Annexe', city: 'Pune' }] }));
    expect(edited.locations.map((l) => l.name)).toEqual(['Main campus', 'Annexe']);
    expect(edited.locations[0]!.id).toBe(added.locations[0]!.id);
    expect(await prisma.auditEvent.findFirst({ where: { entityId: 'inst-newu', summary: { startsWith: 'Updated' } } })).toMatchObject({ summary: expect.stringContaining('city') });

    await expect(as(arjun, () => s.saveInstitution({ ...asu, id: '', shortCode: 'ASU' }))).rejects.toThrow('That short code is already used.');
    await expect(as(arjun, () => s.saveInstitution({ ...asu, shortCode: 'asu' }))).rejects.toThrow('Short code must be 2–6 capital letters.');
    await expect(as(kavya, () => s.saveInstitution(asu))).rejects.toMatchObject({ status: 403 });
  });

  it('adds a user with roles and institutions, and enforces domains and self-protection', async () => {
    const base = { id: '', name: 'Neha Kapoor', email: 'neha.kapoor@apeejay.edu', designation: 'BD Executive', roles: ['bd_exec' as const], regionId: kavya.regionId, institutionIds: ['inst-asu'], active: true };
    const u = await as(arjun, () => s.saveUser(base));
    expect(u).toMatchObject({ id: expect.stringMatching(/^u-\d{4}$/), roles: ['bd_exec'], institutionIds: ['inst-asu'] });
    await expect(as(arjun, () => s.saveUser({ ...base, email: 'x@gmail.com' }))).rejects.toThrow('gmail.com is not an allowed sign-in domain.');
    await expect(as(arjun, () => s.saveUser({ ...base, email: 'neha.kapoor@apeejay.edu' }))).rejects.toThrow('A user with this email already exists.');
    await expect(as(arjun, () => s.saveUser({ ...base, email: 'x@apeejay.edu', institutionIds: ['inst-nope'] }))).rejects.toThrow('One of the institutions no longer exists.');
    await expect(as(arjun, () => s.saveUser({ ...arjun, roles: ['legal'] }))).rejects.toThrow('You cannot remove your own Admin role.');
    // Moving Kavya to another institution changes what she can see from her next request.
    await as(arjun, () => s.saveUser({ ...kavya, institutionIds: ['inst-aks'] }));
    expect((await seeded('u-neha')).institutionIds).toEqual(['inst-aks']);
  });

  it('validates routing, SLAs, master lists and domains', async () => {
    const rules = await as(arjun, () => v.listRateCards().then(() => s.listRouting()));
    await expect(as(arjun, () => s.saveRouting([{ ...rules[0]!, escalateToId: rules[0]!.approverId }]))).rejects.toThrow('Escalation must go to a different person than the approver.');
    await expect(as(arjun, () => s.saveRouting([rules[0]!, { ...rules[0]!, id: '' }]))).rejects.toThrow('Each institution can have only one rule per condition.');
    await as(arjun, () => s.saveRouting(rules.slice(0, 1)));
    expect(await as(arjun, () => s.listRouting())).toHaveLength(1);

    const { sla } = await as(arjun, () => s.getSettings());
    await expect(as(arjun, () => s.saveSla({ ...sla, gate1Days: 1.5 }))).rejects.toThrow('gate1Days must be a whole number between 0 and 120.');
    await as(arjun, () => s.saveSla({ ...sla, gate1Days: 4 }));
    expect((await as(kavya, () => s.lookups())).sla.gate1Days).toBe(4);

    await expect(as(arjun, () => s.saveDomains([' '] ))).rejects.toThrow('Keep at least one allowed domain, or nobody can sign in.');
    await as(arjun, () => s.saveDomains(['Apeejay.edu', 'apeejay.edu', 'aks.ac.in']));
    expect((await as(arjun, () => s.getSettings())).allowedDomains).toEqual(['apeejay.edu', 'aks.ac.in']);
    await expect(as(kavya, () => s.getSettings())).rejects.toMatchObject({ status: 403 });
  });
});

describe('rate cards: maker-checker (PRD 3, 6.3)', () => {
  it('Admin cannot publish before Legal approves; a version taking effect later leaves the current one in force', async () => {
    await expect(as(arjun, () => v.publishRateCard('rc-asu-3'))).rejects.toThrow(/Legal must approve/);
    await as(priya, () => v.decideRateCard('rc-asu-3', 'approve'));
    expect(await as(arjun, () => v.publishRateCard('rc-asu-3'))).toEqual({ flagged: 0, affected: 0 });
    const asu = await as(arjun, () => v.listRateCards('inst-asu'));
    expect(asu.find((r) => r.id === 'rc-asu-3')).toMatchObject({ status: 'published', publishedById: 'u-arjun' });
    // v3 takes effect in 45 days, so v2 stays in force until then (the scheduler retires it).
    expect(asu.find((r) => r.id === 'rc-asu-2')).toMatchObject({ status: 'published' });
    await prisma.rateCard.update({ where: { id: 'rc-asu-3' }, data: { effectiveFrom: today() } });
    await as(null, () => v.retireSupersededRateCards('inst-asu'));
    expect(await prisma.rateCard.findUnique({ where: { id: 'rc-asu-2' } })).toMatchObject({ status: 'retired' });
  });

  it('runs a draft through Legal: one draft at a time, edits only as a draft, a return needs a comment', async () => {
    const draft = await as(arjun, () => v.createRateCardDraft('inst-aks'));
    expect(draft).toMatchObject({ status: 'draft', version: expect.any(Number), createdById: 'u-arjun' });
    await expect(as(arjun, () => v.createRateCardDraft('inst-aks'))).rejects.toThrow(/already in progress/);
    const rows = draft.rows.map((r, i) => (i === 0 ? { ...r, slabs: { ...r.slabs, '1-10': 15000 } } : r));
    await as(arjun, () => v.saveRateCardDraft({ ...draft, rows }));
    await as(arjun, () => v.submitRateCard(draft.id));
    expect(await prisma.task.findFirst({ where: { refId: draft.id } })).toMatchObject({ type: 'rate_card_approval', assigneeId: 'u-priya', status: 'open' });
    await expect(as(arjun, () => v.saveRateCardDraft({ ...draft, rows }))).rejects.toThrow('Only draft versions can be edited. Published versions are never changed.');
    await expect(as(priya, () => v.decideRateCard(draft.id, 'reject', 'no'))).rejects.toThrow('Add a comment explaining the rejection.');
    await as(priya, () => v.decideRateCard(draft.id, 'reject', 'Slab 1 is too high'));
    expect((await as(arjun, () => v.listRateCards('inst-aks'))).find((r) => r.id === draft.id)).toMatchObject({ status: 'draft', rejectComment: 'Slab 1 is too high', rows: rows });
    expect(await prisma.task.findFirst({ where: { refId: draft.id } })).toMatchObject({ status: 'done' });
    expect(await prisma.notification.findFirst({ where: { userId: 'u-arjun' }, orderBy: { id: 'desc' } })).toMatchObject({ title: 'Rate card returned by Legal' });
  });

  it('only one of two Admins starting a version at the same moment succeeds', async () => {
    const results = await Promise.allSettled([as(arjun, () => v.createRateCardDraft('inst-aks')), as(arjun, () => v.createRateCardDraft('inst-aks'))]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await prisma.rateCard.count({ where: { institutionId: 'inst-aks', status: 'draft' } })).toBe(1);
  });

  it('only one of two Legal decisions on the same version counts', async () => {
    const results = await Promise.allSettled([as(priya, () => v.decideRateCard('rc-asu-3', 'approve')), as(priya, () => v.decideRateCard('rc-asu-3', 'reject', 'Not yet please'))]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('lets the agreements feature flag agreements when a rate card is published', async () => {
    const off = onRateCardPublished(async (rc) => ({ flagged: rc.id === 'rc-asu-3' ? 2 : 0, activeAgreementIds: ['AGR-1', 'AGR-2', 'AGR-3'] }));
    try {
      await as(priya, () => v.decideRateCard('rc-asu-3', 'approve'));
      const rc = (await as(arjun, () => v.listRateCards('inst-asu'))).find((r) => r.id === 'rc-asu-3')!;
      const expected = rc.applyMode === 'addendums' ? 3 : 0;
      expect(await as(arjun, () => v.publishRateCard('rc-asu-3'))).toEqual({ flagged: 2, affected: expected });
    } finally {
      off();
    }
  });
});

describe('templates: editor and maker-checker', () => {
  it('edits a new version, goes through Legal, and retires the old one when published', async () => {
    const draft = await as(arjun, () => v.createTemplateDraft('sole_prop', null));
    expect(draft.status).toBe('draft');
    expect(draft.content!.blocks.some((b) => b.kind === 'clause' && b.id === 'c4')).toBe(true);
    const content = structuredClone(draft.content!);
    content.blocks = content.blocks.map((b) => (b.kind === 'clause' && b.id === 'c4' ? { ...b, text: 'Payment within 21 days of each admission month.' } : b));
    await expect(as(arjun, () => v.saveTemplateDraft(draft.id, { content: { ...content, blocks: [...content.blocks, { id: 'x', kind: 'paragraph', text: 'Bad {{cp.nope}}' }] }, changeNote: 'x', effectiveFrom: today() }))).rejects.toThrow(/Unknown field/);
    await expect(as(arjun, () => v.submitTemplate(draft.id))).rejects.toThrow('Describe what changed in this version before sending it to Legal.');
    await as(arjun, () => v.saveTemplateDraft(draft.id, { content, changeNote: 'Faster payment', effectiveFrom: today() }));
    await as(arjun, () => v.submitTemplate(draft.id));
    await expect(as(arjun, () => v.publishTemplate(draft.id))).rejects.toThrow(/Legal must approve/);
    await expect(as(arjun, () => v.decideTemplate(draft.id, 'approve'))).rejects.toMatchObject({ status: 403 });
    await as(priya, () => v.decideTemplate(draft.id, 'reject', 'Please keep 30 days'));
    expect((await as(arjun, () => v.getTemplate(draft.id))).status).toBe('draft');
    await as(arjun, () => v.submitTemplate(draft.id));
    await as(priya, () => v.decideTemplate(draft.id, 'approve'));
    await as(arjun, () => v.publishTemplate(draft.id));
    const all = await as(arjun, () => v.listTemplates());
    const soleProp = all.filter((t) => t.cpType === 'sole_prop' && t.institutionId === null);
    expect(soleProp.find((t) => t.id === draft.id)!.status).toBe('published');
    expect(soleProp.filter((t) => t.status === 'published')).toHaveLength(1);
    expect((await as(arjun, () => v.getTemplate(draft.id))).content!.blocks.find((b) => b.id === 'c4')).toMatchObject({ text: 'Payment within 21 days of each admission month.' });
  });

  it('lets Admin discard an unsent draft and blocks a second draft for the same template', async () => {
    const d = await as(arjun, () => v.createTemplateDraft('individual', null));
    await expect(as(arjun, () => v.createTemplateDraft('individual', null))).rejects.toThrow(/already in progress/);
    await as(arjun, () => v.discardTemplateDraft(d.id));
    expect(await prisma.templateVersion.findUnique({ where: { id: d.id } })).toBeNull();
    await expect(as(arjun, () => v.discardTemplateDraft(d.id))).resolves.toBeUndefined();
  });

  it('withdraws a version waiting for Legal, keeps published ones, and refuses to discard one agreements use', async () => {
    const d = await as(arjun, () => v.createTemplateDraft('individual', null));
    await as(arjun, () => v.saveTemplateDraft(d.id, { content: d.content!, changeNote: 'Wording', effectiveFrom: today() }));
    await as(arjun, () => v.submitTemplate(d.id));
    await as(arjun, () => v.discardTemplateDraft(d.id));
    expect(await prisma.task.findFirst({ where: { refId: d.id } })).toMatchObject({ status: 'cancelled' });
    const published = (await prisma.templateVersion.findFirst({ where: { status: 'published' } }))!;
    await expect(as(arjun, () => v.discardTemplateDraft(published.id))).rejects.toThrow(/kept for history/);

    const e = await as(arjun, () => v.createTemplateDraft('individual', null));
    const off = onTemplateInUse(async (id) => id === e.id);
    try {
      await expect(as(arjun, () => v.discardTemplateDraft(e.id))).rejects.toThrow('This version has history and cannot be discarded.');
    } finally {
      off();
    }
  });
});
