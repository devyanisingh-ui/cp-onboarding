import type { Task, TaskType, User } from '@/types';
import { addWorkingDays, today } from '@/lib/dates';
import { taskLink } from '@/lib/links';
import { db, now } from './context';
import { nextId } from './ids';
import { notify } from './notify';
import { toTask } from './mappers';

/** Opens a task and tells the assignee (same arguments as the browser mock's createTask()). */
export async function createTask(t: {
  type: TaskType;
  title: string;
  assigneeId: string;
  slaDays?: number;
  dueDate?: string;
  agreementId?: string;
  cpId?: string;
  refId?: string;
  institutionId?: string;
  cpName?: string;
}): Promise<Task> {
  const row = await db().task.create({
    data: {
      id: await nextId('task', 'T-'),
      type: t.type,
      title: t.title,
      assigneeId: t.assigneeId,
      agreementId: t.agreementId,
      cpId: t.cpId,
      refId: t.refId,
      institutionId: t.institutionId,
      dueDate: t.dueDate ?? addWorkingDays(today(), t.slaDays ?? 2),
    },
  });
  const task = toTask(row);
  await notify(
    [t.assigneeId],
    { title: `New task: ${t.title}`, body: t.agreementId ? `Agreement ${t.agreementId}` : 'Open the task to act.', link: taskLink(task) },
    { email: 'task' },
  );
  return task;
}

/** Closes the open tasks that match (same arguments as the browser mock's closeTasks()). */
export async function closeTasks(
  match: { agreementId?: string; refId?: string; types: TaskType[] },
  by: User | 'system',
  status: 'done' | 'cancelled' = 'done',
): Promise<void> {
  await db().task.updateMany({
    where: { status: 'open', type: { in: match.types }, ...(match.agreementId ? { agreementId: match.agreementId } : {}), ...(match.refId ? { refId: match.refId } : {}) },
    data: { status, completedAt: now(), completedById: by === 'system' ? 'system' : by.id },
  });
}
