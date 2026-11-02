import type { EmailMessage } from '@/types';
import { commit } from './db';

/**
 * Sends outbox emails for real through the server-side Resend relay (`server/sendEmail.ts`).
 * Off unless NEXT_PUBLIC_EMAIL_DELIVERY=resend, so tests keep the simulated outbox only. Every email is still written to the outbox first; this records how delivery went.
 */
export function relayEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EMAIL_DELIVERY === 'resend';
}

const relayUrl = () => process.env.NEXT_PUBLIC_EMAIL_RELAY_URL || '/api/send-email';

export function relay(m: EmailMessage): void {
  if (!relayEnabled()) return;
  m.delivery = { status: 'sending' };
  fetch(relayUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: m.to, cc: m.cc, subject: m.subject, body: m.body, link: m.link, kind: m.kind }),
  })
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      m.delivery = res.ok ? { status: 'sent', providerId: data.id } : { status: 'failed', error: data.error ?? `HTTP ${res.status}` };
    })
    .catch((e: unknown) => {
      m.delivery = { status: 'failed', error: e instanceof Error ? e.message : 'Network error' };
    })
    .finally(commit);
}

/** What the relay server can see of its settings (names only, never values), or why it can't be reached. */
export async function relaySettings(): Promise<{ missing: string[]; from?: string; redirect?: string } | { unreachable: string }> {
  try {
    const res = await fetch(relayUrl(), { method: 'GET' });
    if (!res.ok) return { unreachable: `The email relay answered ${res.status}. It runs with \`npm run dev\` or on Vercel, not in a single-file build.` };
    return (await res.json()) as { missing: string[]; from?: string; redirect?: string };
  } catch (e) {
    return { unreachable: e instanceof Error ? e.message : 'The email relay could not be reached.' };
  }
}

/** Sends one test email straight through the relay (not via the outbox) and returns Resend's answer. */
export async function sendTestEmail(to: string): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(relayUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: 'CP Onboarding test email',
        body: 'This is a test email from CP Onboarding (Admin → System). If you can read it, email delivery through Resend works.',
        link: '/admin/system',
        kind: 'event',
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    return res.ok ? { ok: true, id: data.id } : { ok: false, error: data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
