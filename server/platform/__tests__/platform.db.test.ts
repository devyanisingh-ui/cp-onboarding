import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../db';
import { afterCommit, ctx, db } from '../context';
import { nextId } from '../ids';
import { audit } from '../audit';
import { notify } from '../notify';
import { closeTasks, createTask } from '../tasks';
import { saveVersioned } from '../versions';
import { userName } from '../users';
import { toEmail } from '../mappers';
import { handleRpc, defineFeature } from '../rpc';
import '../health';
import { addUser, as } from '../../test/helpers';

describe('IDs', () => {
  it('issues readable IDs in sequence, per counter', async () => {
    const ids = await as(null, async () => [await nextId('task', 'T-'), await nextId('task', 'T-'), await nextId('audit', 'EV-', 5)]);
    expect(ids).toEqual(['T-0001', 'T-0002', 'EV-00001']);
  });

  it('never hands the same number to two requests running at once', async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, () => as(null, () => nextId('agreement', 'AGR-'))));
    expect(new Set(ids).size).toBe(12);
    expect(ids.sort()).toEqual(Array.from({ length: 12 }, (_, i) => `AGR-${String(i + 1).padStart(4, '0')}`));
  });
});

describe('transactions', () => {
  it('a request that fails leaves nothing behind, and sends no email', async () => {
    const kavya = await addUser({ id: 'u-kavya', roles: ['bd_exec'] });
    const sent = vi.fn(async () => undefined);
    await expect(
      as(kavya, async () => {
        await audit(ctx(), 'create', 'agreement', 'AGR-1', 'Created draft');
        await notify([kavya.id], { title: 'Draft saved', body: 'Agreement AGR-1', link: '/agreements/AGR-1' });
        afterCommit(sent);
        throw new Error('validation failed half-way');
      }),
    ).rejects.toThrow('half-way');
    expect(await prisma.auditEvent.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.emailMessage.count()).toBe(0);
    expect(sent).not.toHaveBeenCalled();
  });

  it('runs after-commit work once the writes are saved', async () => {
    const seen: number[] = [];
    await as(null, async () => {
      await db().counter.create({ data: { key: 'x', value: 7 } });
      afterCommit(async () => void seen.push((await prisma.counter.findUniqueOrThrow({ where: { key: 'x' } })).value));
    });
    expect(seen).toEqual([7]);
  });

  it('refuses a save based on an out-of-date version', async () => {
    await prisma.counter.create({ data: { key: 'c', value: 1 } });
    // Counter has no version column; use a stand-in delegate shaped like a versioned table.
    let version = 3;
    const delegate = { updateMany: async ({ where }: { where: { id: string; version: number } }) => ({ count: where.version === version ? (version++, 1) : 0 }) };
    await expect(saveVersioned(delegate, 'AGR-1', 3, { status: 'draft' }, 'agreement')).resolves.toBeUndefined();
    await expect(saveVersioned(delegate, 'AGR-1', 3, { status: 'draft' }, 'agreement')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('This agreement was changed by someone else') });
  });
});

describe('audit trail', () => {
  it('records who did what, from where', async () => {
    const priya = await addUser({ id: 'u-priya', name: 'Priya Sharma', roles: ['legal'] });
    await as(priya, () => audit(ctx(), 'approve', 'deviation', 'DEV-0001', 'Approved deviation', { value: '16000' }, { value: '18000' }));
    await as(null, () => audit('system', 'escalate', 'task', 'T-0001', 'Escalated'));
    const rows = await prisma.auditEvent.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((r) => [r.id, r.actorName, r.ip, r.device])).toEqual([
      ['EV-00001', 'Priya Sharma', '127.0.0.1', 'Test'],
      ['EV-00002', 'System', 'scheduler', 'Scheduler'],
    ]);
    expect(rows[0]!.after).toEqual({ value: '18000' });
  });
});

describe('notifications and email', () => {
  it('blocks personal or rate data in notification text', async () => {
    const kavya = await addUser({ id: 'u-kavya', roles: ['bd_exec'] });
    await expect(as(kavya, () => notify([kavya.id], { title: 'PAN ABCDE1234F', body: '', link: '/' }))).rejects.toThrow(/personal or rate data/);
  });

  it('notifies each user once and emails them; Legal and Admin get reminders in the digest instead', async () => {
    const kavya = await addUser({ id: 'u-kavya', email: 'kavya@example.com', roles: ['bd_exec'] });
    const priya = await addUser({ id: 'u-priya', email: 'priya@example.com', roles: ['legal'] });
    await as(kavya, () => notify([kavya.id, priya.id, kavya.id, undefined], { title: 'Task due', body: 'Agreement AGR-1', link: '/tasks' }, { email: 'reminder' }));
    expect((await prisma.notification.findMany()).map((n) => n.userId).sort()).toEqual(['u-kavya', 'u-priya']);
    const emails = (await prisma.emailMessage.findMany()).map(toEmail);
    expect(emails).toEqual([{ id: 'M-0001', to: 'kavya@example.com', subject: 'Task due', body: 'Agreement AGR-1', link: '/tasks', kind: 'reminder', sentAt: expect.any(String) }]);
  });
});

describe('email delivery', () => {
  it('sends through Resend only after the transaction commits, and records the outcome', async () => {
    vi.stubEnv('NEXT_PUBLIC_EMAIL_DELIVERY', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'CP <n@example.com>');
    vi.stubEnv('APP_URL', 'https://app.example.com');
    const resend = vi.fn(async () => new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }));
    vi.stubGlobal('fetch', resend);
    try {
      const kavya = await addUser({ id: 'u-kavya', email: 'kavya@example.com', roles: ['bd_exec'] });
      await as(kavya, async () => {
        await notify([kavya.id], { title: 'Deviation decided', body: 'Agreement AGR-1', link: '/agreements/AGR-1' });
        // Still inside the transaction: queued, not sent.
        expect(resend).not.toHaveBeenCalled();
      });
      expect(resend).toHaveBeenCalledTimes(1);
      expect(JSON.parse((resend.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ to: ['kavya@example.com'], subject: 'Deviation decided' });
      expect(toEmail(await prisma.emailMessage.findFirstOrThrow())).toMatchObject({ delivery: { status: 'sent', providerId: 'em_1' } });
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});

describe('tasks', () => {
  it('opens a task with a due date and link, tells the assignee, and closes it', async () => {
    const priya = await addUser({ id: 'u-priya', roles: ['legal'] });
    const task = await as(priya, () => createTask({ type: 'deviation_review', title: 'Review deviation: Sharma & Gill', assigneeId: priya.id, slaDays: 2, agreementId: 'AGR-1' }));
    expect(task).toMatchObject({ id: 'T-0001', status: 'open', assigneeId: 'u-priya', agreementId: 'AGR-1', dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(await prisma.notification.findFirst()).toMatchObject({ title: 'New task: Review deviation: Sharma & Gill', link: '/agreements/AGR-1/deviation' });
    await as(priya, () => closeTasks({ agreementId: 'AGR-1', types: ['deviation_review'] }, priya));
    expect(await prisma.task.findUnique({ where: { id: 'T-0001' } })).toMatchObject({ status: 'done', completedById: 'u-priya' });
  });

  it('names users for lists and the audit trail', async () => {
    await addUser({ id: 'u-arjun', name: 'Arjun Mehta', roles: ['admin'] });
    expect(await as(null, async () => [await userName('u-arjun'), await userName('system'), await userName('nobody'), await userName()])).toEqual(['Arjun Mehta', 'System', 'Unknown user', '—']);
  });
});

describe('RPC', () => {
  const call = (name: string, body: unknown = { args: [] }) => handleRpc(name, new Request(`http://x/api/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }));

  it('answers the public health check from the database', async () => {
    const res = await call('platform.health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { ok: true, database: 'up' } });
  });

  it('refuses unknown operations, bad bodies, and signed-out callers', async () => {
    defineFeature('demo', { secret: async () => 'hidden' });
    expect((await call('nope.nothing')).status).toBe(404);
    expect((await handleRpc('platform.health', new Request('http://x', { method: 'POST', body: 'not json' }))).status).toBe(400);
    const res = await call('demo.secret');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Your session has ended. Please sign in again.' });
  });
});
