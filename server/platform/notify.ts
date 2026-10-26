import type { Role } from '@/types';
import { containsSensitive } from '@/lib/records';
import { db } from './context';
import { sendEmail, type OutboundMessage } from './email';
import { nextId } from './ids';

/**
 * In-app notification for each user, plus an email (same rules as the browser mock's notify()):
 * no personal or rate data in the text, and Legal/Admin get the 9 AM digest instead of
 * individual reminder emails.
 */
export async function notify(
  userIds: (string | undefined)[],
  msg: { title: string; body: string; link: string },
  opts: { email?: 'task' | 'reminder' | 'escalation' | 'event' | false } = {},
): Promise<void> {
  if (containsSensitive(`${msg.title} ${msg.body}`)) {
    throw new Error('Notification blocked: it contains personal or rate data.');
  }
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (!ids.length) return;
  const users = await db().user.findMany({ where: { id: { in: ids } }, include: { roles: true } });
  // Same order as asked, so notification and email IDs are issued predictably.
  for (const uid of ids) {
    const user = users.find((u) => u.id === uid);
    if (!user) continue;
    await db().notification.create({ data: { id: await nextId('notif', 'N-'), userId: uid, ...msg } });
    const kind = opts.email ?? 'event';
    if (kind === false) continue;
    const digestUser = user.roles.some((r) => r.role === ('legal' satisfies Role) || r.role === ('admin' satisfies Role));
    if (kind === 'reminder' && digestUser) continue;
    await deliver(user.email, { ...msg, kind });
  }
}

/** Outbound channels. Email is the only one live; WhatsApp is phase 2 (PRD §2, §9). */
export async function deliver(email: string, msg: OutboundMessage): Promise<void> {
  await sendEmail(email, msg);
}

/** Email to someone without an app account (e-signature signers, CP document links). */
export async function sendExternalEmail(to: string, msg: OutboundMessage): Promise<void> {
  await sendEmail(to, msg);
}
