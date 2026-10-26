import type { AppNotification, AuditEvent, EmailMessage, Task, TaskType } from '@/types';
import type { AuditEvent as AuditRow, EmailMessage as EmailRow, Notification as NotificationRow, Task as TaskRow } from '../generated/prisma/client';

/**
 * Database rows → the shapes the app already uses (src/types.ts). Dates become ISO strings and
 * empty columns become absent keys, exactly as the browser mock stores them.
 */
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined || o[k] === null) delete o[k];
  return o;
}

export function toTask(r: TaskRow): Task {
  return compact({
    id: r.id,
    type: r.type as TaskType,
    title: r.title,
    agreementId: r.agreementId ?? undefined,
    cpId: r.cpId ?? undefined,
    refId: r.refId ?? undefined,
    institutionId: r.institutionId ?? undefined,
    assigneeId: r.assigneeId,
    dueDate: r.dueDate,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    completedAt: iso(r.completedAt),
    completedById: r.completedById ?? undefined,
    remindedAt: iso(r.remindedAt),
    escalatedToId: r.escalatedToId ?? undefined,
    escalatedAt: iso(r.escalatedAt),
  });
}

export function toNotification(r: NotificationRow): AppNotification {
  return { id: r.id, userId: r.userId, title: r.title, body: r.body, link: r.link, createdAt: r.createdAt.toISOString(), read: r.read };
}

export function toEmail(r: EmailRow): EmailMessage {
  return compact({
    id: r.id,
    to: r.to,
    subject: r.subject,
    body: r.body,
    link: r.link ?? undefined,
    kind: r.kind,
    sentAt: r.sentAt.toISOString(),
    delivery: r.status ? compact({ status: r.status, providerId: r.providerId ?? undefined, error: r.error ?? undefined }) : undefined,
  });
}

export function toAuditEvent(r: AuditRow): AuditEvent {
  return compact({
    id: r.id,
    actorId: r.actorId,
    actorName: r.actorName,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    before: (r.before ?? undefined) as Record<string, unknown> | undefined,
    after: (r.after ?? undefined) as Record<string, unknown> | undefined,
    at: r.at.toISOString(),
    ip: r.ip,
    device: r.device,
  });
}
