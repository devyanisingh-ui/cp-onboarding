import type { EmailMessage } from '@/types';
import { handleSendEmail, type RelayEnv } from '../sendEmail';
import { afterCommit, db } from './context';
import { prisma } from './db';
import { nextId } from './ids';

export interface OutboundMessage {
  title: string;
  body: string;
  link: string;
  kind: EmailMessage['kind'];
}

/** Real delivery is on when the same switch as the browser build is set (NEXT_PUBLIC_EMAIL_DELIVERY=resend). */
export function relayEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_EMAIL_DELIVERY || process.env.VITE_EMAIL_DELIVERY) === 'resend';
}

/**
 * Writes the email to the outbox in the current transaction. When delivery is on, it is sent
 * through Resend after the transaction commits — so a request that fails never emails anyone —
 * and the outcome is recorded on the outbox row.
 */
export async function sendEmail(to: string, msg: OutboundMessage): Promise<void> {
  const send = relayEnabled();
  const id = await nextId('email', 'M-');
  await db().emailMessage.create({ data: { id, to, subject: msg.title, body: msg.body, link: msg.link, kind: msg.kind, status: send ? 'sending' : null } });
  if (!send) return;
  afterCommit(async () => {
    const request = new Request('http://internal/api/send-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, subject: msg.title, body: msg.body, link: msg.link, kind: msg.kind }),
    });
    const response = await handleSendEmail(request, process.env as RelayEnv);
    const result = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    await prisma.emailMessage.update({
      where: { id },
      data: response.ok ? { status: 'sent', providerId: result.id ?? null } : { status: 'failed', error: (result.error ?? `Relay responded ${response.status}.`).slice(0, 500) },
    });
  });
}
