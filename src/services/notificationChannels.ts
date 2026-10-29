import type { EmailMessage, User } from '@/types';
import { getDb, nextId } from './db';
import { relay } from './emailRelay';

/**
 * Pluggable notification channels (PRD §2, §9). In-app notifications are written by `notify`;
 * this registry covers outbound channels. WhatsApp is registered but disabled until phase 2.
 */
export interface OutboundMessage {
  title: string;
  body: string;
  link: string;
  kind: 'task' | 'reminder' | 'escalation' | 'event' | 'digest' | 'signature' | 'verification';
}

export interface NotificationChannel {
  id: 'email' | 'whatsapp';
  label: string;
  enabled: boolean;
  send(user: User, msg: OutboundMessage): void;
}

const emailChannel: NotificationChannel = {
  id: 'email',
  label: 'Email',
  enabled: true,
  send(user, msg) {
    sendEmail(user.email, msg);
  },
};

/** Writes to the outbox and, when enabled, sends for real through the Resend relay. */
function sendEmail(to: string, msg: OutboundMessage) {
  const m: EmailMessage = { id: nextId('email', 'M-'), to, subject: msg.title, body: msg.body, link: msg.link, kind: msg.kind, sentAt: new Date().toISOString() };
  getDb().emails.push(m);
  relay(m);
}

const whatsappChannel: NotificationChannel = {
  id: 'whatsapp',
  label: 'WhatsApp (phase 2)',
  enabled: false,
  send() {
    /* phase 2: WhatsApp Business API */
  },
};

export const channels: NotificationChannel[] = [emailChannel, whatsappChannel];

export function deliver(user: User, msg: OutboundMessage) {
  for (const c of channels) if (c.enabled) c.send(user, msg);
}

/**
 * Email to someone without an app account (e-signature signers). Goes to the same simulated
 * outbox; WhatsApp and other channels never carry signing links.
 */
export function sendExternalEmail(to: string, msg: OutboundMessage) {
  sendEmail(to, msg);
}
