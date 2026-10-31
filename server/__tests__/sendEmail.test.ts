import { handleSendEmail, parseRelayRequest } from '../sendEmail';

const env = { RESEND_API_KEY: 're_test', EMAIL_FROM: 'CP <n@example.com>', APP_URL: 'https://app.example.com/' };
const ok = { to: 'bd@example.com', subject: 'New task: Legal approval', body: 'Agreement AGR-1', link: '/agreements/AGR-1', kind: 'task' };

function post(body: unknown) {
  return new Request('http://x/api/send-email', { method: 'POST', body: JSON.stringify(body) });
}

function resendMock(status = 200, data: unknown = { id: 'em_1' }) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(data), { status }));
}

describe('email relay', () => {
  it('sends through Resend with an absolute link and escaped HTML', async () => {
    const fetchMock = resendMock();
    const res = await handleSendEmail(post({ ...ok, body: 'Hi <b>there</b>' }), env, fetchMock as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'em_1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    const sent = JSON.parse(init!.body as string);
    expect(sent.to).toEqual(['bd@example.com']);
    expect(sent.text).toContain('https://app.example.com/agreements/AGR-1');
    expect(sent.html).toContain('Hi &lt;b&gt;there&lt;/b&gt;');
  });

  it('redirects every email to the test inbox when EMAIL_REDIRECT_TO is set', async () => {
    const fetchMock = resendMock();
    await handleSendEmail(post(ok), { ...env, EMAIL_REDIRECT_TO: 'qa@example.com' }, fetchMock as unknown as typeof fetch);
    const sent = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(sent.to).toEqual(['qa@example.com']);
    expect(sent.subject).toBe('[to bd@example.com] New task: Legal approval');
  });

  it('sends every kind the app writes to its outbox, notices and digests included', async () => {
    for (const kind of ['task', 'reminder', 'escalation', 'signature', 'event', 'digest']) expect(parseRelayRequest({ ...ok, kind })).toMatchObject({ kind });
    const fetchMock = resendMock();
    await handleSendEmail(post({ ...ok, subject: 'Agreement active', kind: 'event' }), env, fetchMock as unknown as typeof fetch);
    const sent = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(sent.tags).toEqual([{ name: 'kind', value: 'event' }]);
    expect(sent.text).toContain('Open in CP Onboarding: https://app.example.com/agreements/AGR-1');
  });

  it('copies in the cc recipients, and leaves them out when redirected for testing', async () => {
    const withCc = { ...ok, to: 'cp@example.com', cc: ['bd@example.com'], link: undefined, kind: 'event' };
    let fetchMock = resendMock();
    await handleSendEmail(post(withCc), env, fetchMock as unknown as typeof fetch);
    let sent = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(sent).toMatchObject({ to: ['cp@example.com'], cc: ['bd@example.com'] });
    expect(sent.html).not.toContain('<a href');
    fetchMock = resendMock();
    await handleSendEmail(post(withCc), { ...env, EMAIL_REDIRECT_TO: 'qa@example.com' }, fetchMock as unknown as typeof fetch);
    sent = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(sent.to).toEqual(['qa@example.com']);
    expect(sent.cc).toBeUndefined();
    expect(sent.subject).toBe('[to cp@example.com, cc bd@example.com] New task: Legal approval');
    expect(parseRelayRequest({ ...ok, cc: ['not-an-email'] })).toBe('Invalid copy (cc) recipients.');
    expect(parseRelayRequest({ ...ok, cc: 'bd@example.com' })).toBe('Invalid copy (cc) recipients.');
    expect(parseRelayRequest({ ...ok, cc: Array(6).fill('a@b.com') })).toBe('Invalid copy (cc) recipients.');
  });

  it('reports on GET which settings are missing, never their values', async () => {
    const get = (e: Record<string, string>) => handleSendEmail(new Request('http://x/api/send-email'), e).then((r) => r.json());
    expect(await get({})).toEqual({ missing: ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'] });
    const full = await get({ ...env, EMAIL_REDIRECT_TO: 'devyani@school.example' });
    expect(full).toEqual({ missing: [], from: 'n@example.com', redirect: 'd…@school.example' });
    expect(JSON.stringify(full)).not.toContain('re_test');
  });

  it('refuses what the app would never send', () => {
    expect(parseRelayRequest({ ...ok, link: 'https://evil.example.com' })).toBe('Links must be paths inside the app.');
    expect(parseRelayRequest({ ...ok, link: '//evil.example.com' })).toBe('Links must be paths inside the app.');
    expect(parseRelayRequest({ ...ok, kind: 'newsletter' })).toBe('This kind of email is not sent.');
    expect(parseRelayRequest({ ...ok, to: 'a@b.com, c@d.com' })).toBe('Invalid recipient.');
    expect(parseRelayRequest({ ...ok, link: '' })).toMatchObject({ link: undefined });
  });

  it('reports missing configuration and Resend errors', async () => {
    expect((await handleSendEmail(post(ok), {}, resendMock() as unknown as typeof fetch)).status).toBe(503);
    const res = await handleSendEmail(post(ok), env, resendMock(422, { message: 'Domain not verified' }) as unknown as typeof fetch);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Domain not verified' });
  });

  it('answers with an error instead of throwing when Resend cannot be reached', async () => {
    const offline = (() => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }))) as unknown as typeof fetch;
    const res = await handleSendEmail(post(ok), env, offline);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('Could not reach Resend from the server (ENOTFOUND)');
  });
});
