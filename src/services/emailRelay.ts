import type { EmailMessage } from '@/types';
import { commit } from './db';

/**
 * Sends outbox emails for real through the server-side Resend relay (`server/sendEmail.ts`).
 * Off unless VITE_EMAIL_DELIVERY=resend, so tests and the single-file builds keep the simulated
 * outbox only. Every email is still written to the outbox first; this records how delivery went.
 */
const RELAYED_KINDS: EmailMessage['kind'][] = ['task', 'reminder', 'escalation', 'signature'];

export function relayEnabled(): boolean {
  return import.meta.env.VITE_EMAIL_DELIVERY === 'resend';
}

export function relay(m: EmailMessage): void {
  if (!relayEnabled() || !RELAYED_KINDS.includes(m.kind)) return;
  m.delivery = { status: 'sending' };
  const url = import.meta.env.VITE_EMAIL_RELAY_URL || '/api/send-email';
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: m.to, subject: m.subject, body: m.body, link: m.link, kind: m.kind }),
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
