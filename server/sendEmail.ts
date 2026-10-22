/**
 * Email relay to Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * The app itself stays in the browser; this is the one piece that runs server-side, because the
 * Resend API key must never reach the browser. It is written against the Web `Request`/`Response`
 * API so the same handler runs as a Vercel function (`api/send-email.ts`) and inside the Vite dev
 * server (`vite.config.ts`).
 *
 * The endpoint is reachable by anyone who can reach the app, so it only sends what the app sends:
 * a fixed sender, a known kind, bounded text, and links that are paths inside the app (the server
 * adds APP_URL, so an email can never point somewhere else).
 */

export interface RelayEnv {
  RESEND_API_KEY?: string;
  /** e.g. `CP Onboarding <notifications@yourdomain.com>` (the domain must be verified in Resend). */
  EMAIL_FROM?: string;
  /** Public address of the app, used to turn in-app paths into links. */
  APP_URL?: string;
  /** Testing: send every email to this address instead (the intended recipient goes in the subject). */
  EMAIL_REDIRECT_TO?: string;
}

export interface RelayRequest {
  to: string;
  subject: string;
  body: string;
  link?: string;
  kind: RelayKind;
}

/** Which emails go out for real. Event notices and the Legal/Admin digest stay in-app only. */
export const RELAY_KINDS = ['task', 'reminder', 'escalation', 'signature'] as const;
export type RelayKind = (typeof RELAY_KINDS)[number];

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

const KIND_ACTION: Record<RelayKind, string> = {
  task: 'Open your task',
  reminder: 'Open your task',
  escalation: 'Review the task',
  signature: 'Open the agreement',
};

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Returns the request if it is one the app could have sent, otherwise why not. */
export function parseRelayRequest(input: unknown): RelayRequest | string {
  if (!input || typeof input !== 'object') return 'Body must be a JSON object.';
  const { to, subject, body, link, kind } = input as Record<string, unknown>;
  if (typeof to !== 'string' || !EMAIL.test(to)) return 'Invalid recipient.';
  if (typeof subject !== 'string' || !subject.trim() || subject.length > MAX_SUBJECT) return 'Invalid subject.';
  if (typeof body !== 'string' || body.length > MAX_BODY) return 'Invalid body.';
  if (typeof kind !== 'string' || !(RELAY_KINDS as readonly string[]).includes(kind)) return 'This kind of email is not sent.';
  if (link !== undefined && link !== '' && (typeof link !== 'string' || !/^\/(?!\/)[^\s\\]*$/.test(link))) return 'Links must be paths inside the app.';
  return { to, subject: subject.replace(/[\r\n]+/g, ' '), body, link: link || undefined, kind: kind as RelayKind };
}

export function renderEmail(msg: RelayRequest, appUrl: string): { text: string; html: string } {
  const url = msg.link ? `${appUrl.replace(/\/+$/, '')}${msg.link}` : undefined;
  const action = KIND_ACTION[msg.kind];
  const text = url ? `${msg.body}\n\n${action}: ${url}` : msg.body;
  const paragraphs = msg.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = url
    ? `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${action}</a></p>`
    : '';
  const html = `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;max-width:560px">${paragraphs}${button}<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Apeejay Education · CP Onboarding</p></div>`;
  return { text, html };
}

export async function handleSendEmail(req: Request, env: RelayEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.APP_URL) {
    return json(503, { error: 'Email is not configured (RESEND_API_KEY, EMAIL_FROM and APP_URL are required).' });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  const msg = parseRelayRequest(payload);
  if (typeof msg === 'string') return json(400, { error: msg });

  const redirect = env.EMAIL_REDIRECT_TO?.trim();
  const { text, html } = renderEmail(msg, env.APP_URL);
  let res: Response;
  try {
    res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [redirect || msg.to],
        subject: redirect ? `[to ${msg.to}] ${msg.subject}` : msg.subject,
        text,
        html,
        tags: [{ name: 'kind', value: msg.kind }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    // Network failure (no internet, DNS, a proxy or firewall blocking api.resend.com, timeout).
    // Answer instead of throwing: an unhandled rejection here takes down the whole dev server.
    const cause = (e as { cause?: { code?: string } })?.cause?.code ?? (e instanceof Error ? e.name : '');
    return json(502, { error: `Could not reach Resend from the server${cause ? ` (${cause})` : ''}. Check that this machine can reach api.resend.com.` });
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return json(502, { error: data.message ?? `Resend responded ${res.status}.` });
  return json(200, { id: data.id });
}
