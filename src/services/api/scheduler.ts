import { addWorkingDays, daysUntil, shiftDays, today } from '@/lib/dates';
import { taskLink } from '@/lib/links';
import { deliver } from '../notificationChannels';
import { audit, closeTasks, commit, createTask, firstUserWithRole, getDb, notify, now, routeFor, userName } from './core';

export interface JobReport {
  reminders: number;
  escalations: number;
  renewalTasks: number;
  statusChanges: number;
  digests: number;
}

/**
 * The jobs a production scheduler (cron) runs: SLA reminders and escalations, renewal tasks,
 * expiry and notice-period status changes, version retirement and the 9:00 IST digest.
 * The prototype runs it on app load, every minute, and from Admin → System.
 */
export function runScheduledJobs(opts: { forceDigest?: boolean } = {}): JobReport {
  const d = getDb();
  const t = today();
  const sla = d.settings.sla;
  const report: JobReport = { reminders: 0, escalations: 0, renewalTasks: 0, statusChanges: 0, digests: 0 };

  // 1. Reminders when a task falls due; escalation after the grace period.
  for (const task of d.tasks.filter((x) => x.status === 'open')) {
    if (task.dueDate <= t && !task.remindedAt) {
      task.remindedAt = now();
      notify([task.assigneeId], { title: `Reminder: ${task.title}`, body: 'This task is due today or overdue.', link: taskLink(task) }, { email: 'reminder' });
      report.reminders++;
    }
    const escalateOn = addWorkingDays(task.dueDate, sla.graceDays);
    if (!task.escalatedToId && escalateOn < t && task.type !== 'renewal_decision') {
      const agreement = task.agreementId ? d.agreements.find((a) => a.id === task.agreementId) : undefined;
      const assignee = d.users.find((u) => u.id === task.assigneeId);
      const route = agreement ? routeFor(agreement.institutionId, agreement.nonStandard) : undefined;
      const target = (task.type === 'gate1_approval' && route?.escalateToId) || assignee?.managerId;
      if (target && target !== task.assigneeId) {
        task.escalatedToId = target;
        task.escalatedAt = now();
        notify([target], { title: `Escalation: ${task.title}`, body: `Overdue with ${userName(task.assigneeId)}.`, link: taskLink(task) }, { email: 'escalation' });
        audit('system', 'escalate', 'task', task.id, `Escalated "${task.title}" to ${userName(target)} (SLA breached)`);
        report.escalations++;
      }
    }
  }

  for (const a of d.agreements) {
    // 2. Renewal decision task at N days before expiry.
    if (a.status === 'active' && a.endDate && !a.renewal && !a.termination) {
      const left = daysUntil(a.endDate);
      const open = d.tasks.find((x) => x.agreementId === a.id && x.type === 'renewal_decision' && x.status === 'open');
      if (left <= sla.renewalLeadDays && left >= 0 && !open) {
        createTask({
          type: 'renewal_decision',
          title: `Renewal decision due: ${d.cps.find((c) => c.id === a.cpId)!.legalName}`,
          assigneeId: a.ownerId,
          dueDate: shiftDays(a.endDate, -sla.renewalEscalationDays) > t ? shiftDays(a.endDate, -sla.renewalEscalationDays) : t,
          agreementId: a.id,
          cpId: a.cpId,
          institutionId: a.institutionId,
        });
        report.renewalTasks++;
      }
      // 3. No decision by 30 days before expiry: escalate to the Approver.
      if (open && left <= sla.renewalEscalationDays && !open.escalatedToId) {
        const approver = routeFor(a.institutionId, false)?.approverId ?? firstUserWithRole('approver', a.institutionId)?.id;
        if (approver) {
          open.escalatedToId = approver;
          open.escalatedAt = now();
          notify([approver], { title: `Escalation: ${open.title}`, body: `No renewal decision ${left} days before expiry · ${a.id}`, link: taskLink(open) }, { email: 'escalation' });
          audit('system', 'escalate', 'task', open.id, `Renewal decision escalated to ${userName(approver)} (${left} days to expiry)`);
          report.escalations++;
        }
      }
    }

    // 4. Expiry.
    if (a.status === 'active' && a.endDate && a.endDate < t) {
      const before = a.status;
      if (a.renewal?.decision === 'do_not_renew' && a.renewal.confirmation === 'confirmed') a.status = 'not_renewed';
      else if (a.renewal && a.renewal.decision !== 'do_not_renew') a.status = 'expired';
      else a.status = 'expired_no_decision';
      a.closedAt = now();
      a.updatedAt = now();
      closeTasks({ agreementId: a.id, types: ['renewal_decision', 'non_renewal_confirm', 'termination_confirm'] }, 'system', 'cancelled');
      audit('system', 'status_change', 'agreement', a.id, `Agreement reached expiry → ${a.status.replace(/_/g, ' ')}`, { status: before }, { status: a.status });
      notify([a.ownerId], { title: 'Agreement expired', body: `${a.id} reached its expiry date.`, link: `/agreements/${a.id}` });
      report.statusChanges++;
    }

    // 5. Notice period ends.
    if (a.status === 'notice_period' && a.termination && a.termination.effectiveDate <= t) {
      a.status = 'terminated';
      a.closedAt = now();
      a.updatedAt = now();
      audit('system', 'status_change', 'agreement', a.id, 'Notice period ended → Terminated', { status: 'notice_period' }, { status: 'terminated' });
      notify([a.ownerId], { title: 'Termination effective', body: `${a.id} is now Terminated.`, link: `/agreements/${a.id}` });
      report.statusChanges++;
    }
  }

  // 6. Retire superseded rate cards / templates once a newer version's effective date arrives.
  for (const inst of d.institutions) {
    const live = d.rateCards.filter((r) => r.institutionId === inst.id && r.status === 'published' && r.effectiveFrom <= t).sort((a, b) => b.version - a.version);
    for (const old of live.slice(1)) {
      old.status = 'retired';
      audit('system', 'retire', 'rate_card', old.id, `Retired rate card v${old.version}`);
    }
  }

  // 7. Daily digest at 09:00 IST for Approvers, Legal and Audit.
  const istHour = (new Date().getUTCHours() + 5 + (new Date().getUTCMinutes() + 30 >= 60 ? 1 : 0)) % 24;
  if (opts.forceDigest || (istHour >= sla.digestHourIst && d.settings.lastDigestDate !== t)) {
    for (const u of d.users.filter((x) => x.active && x.roles.some((r) => r === 'approver' || r === 'legal' || r === 'audit'))) {
      const mine = d.tasks.filter((x) => x.status === 'open' && (x.assigneeId === u.id || x.escalatedToId === u.id));
      if (!mine.length) continue;
      const overdue = mine.filter((x) => x.dueDate < t).length;
      deliver(u, {
        title: `Daily digest: ${mine.length} pending, ${overdue} overdue`,
        body: mine.map((x) => `• ${x.title}${x.agreementId ? ` (${x.agreementId})` : ''}${x.dueDate < t ? ' — OVERDUE' : ''}`).join('\n'),
        link: '/tasks',
        kind: 'digest',
      });
      report.digests++;
    }
    d.settings.lastDigestDate = t;
  }

  if (report.reminders + report.escalations + report.renewalTasks + report.statusChanges + report.digests > 0) commit();
  return report;
}
