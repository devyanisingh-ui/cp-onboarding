import type { User } from '@/types';
import { getDb, nextId } from './db';

/**
 * Pluggable notification channels (PRD §2, §9). In-app notifications are written by `notify`;
 * this registry covers outbound channels. WhatsApp is registered but disabled until phase 2.
 */
export interface OutboundMessage {
  title: string;
  body: string;
  link: string;
  kind: 'task' | 'reminder' | 'escalation' | 'event' | 'digest';
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
    getDb().emails.push({
      id: nextId('email', 'M-'),
      to: user.email,
      subject: msg.title,
      body: msg.body,
      link: msg.link,
      kind: msg.kind,
      sentAt: new Date().toISOString(),
    });
  },
};

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
