import { Link } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, ChevronRight, FileCheck2, FileSignature, FileWarning, Hourglass, Paperclip, RotateCcw, Scale, ScrollText, ShieldCheck, Undo2 } from 'lucide-react';
import type { Dashboard, LegalDocsItem } from '@/services/api/inbox';
import { cn } from '@/lib/cn';
import { daysUntil, formatShortDate, shiftDays, today } from '@/lib/dates';
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from '@/components/ui';
import { TaskRow } from '@/components/lists';
import { MiniStat, StatGrid, UrgencyChip, WorkflowStrip } from '@/components/dashboard';

/**
 * Home for Legal: the workflow from Legal's side (deviations before signing, signed agreements to
 * review, documents sent back), the review queue first, then the rest of Legal's work.
 */
export function HomeLegal({ data, greeting, firstName }: { data: Dashboard; greeting: string; firstName: string }) {
  const lg = data.legal!;
  const overdue = lg.queue.filter((q) => q.overdue).length;
  const dueSoon = lg.queue.filter((q) => !q.overdue && q.dueDate && q.dueDate <= shiftDays(today(), 7)).length;
  const configTasks = data.pendingTasks.filter((t) => t.type === 'template_approval' || t.type === 'rate_card_approval');
  const toDo = lg.queue.length + lg.deviations.length + configTasks.length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow text-primary-700">Legal</p>
        <h1 className="text-display mt-1.5">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {toDo
            ? `${lg.queue.length} signed agreement${lg.queue.length === 1 ? '' : 's'} to review${overdue ? ` (${overdue} overdue)` : ''} · ${lg.deviations.length} deviation request${lg.deviations.length === 1 ? '' : 's'} · ${configTasks.length} template / rate card approval${configTasks.length === 1 ? '' : 's'}.`
            : 'Nothing is waiting for Legal right now.'}
        </p>
      </div>

      <WorkflowStrip
        title="Legal’s part of the workflow"
        description="Highlighted steps are waiting for you. Documents sent back are with the BD or CP."
        steps={[
          { key: 'deviations', label: 'Deviations to decide', who: 'Your move · before signing', yours: true, count: lg.stages.deviations, to: '#deviations', icon: <Scale /> },
          { key: 'review', label: 'Signed, to review', who: 'Your move', yours: true, count: lg.stages.review, to: '/agreements?status=pending_approval', icon: <FileSignature /> },
          { key: 'docs', label: 'Documents sent back', who: 'With BD / CP', yours: false, count: lg.stages.docs, to: '/agreements?status=docs_requested', icon: <FileWarning /> },
          { key: 'admin', label: 'Admin approval', who: 'With Admin', yours: false, count: lg.stages.admin, to: '/agreements?status=pending_admin_approval', icon: <ShieldCheck /> },
          { key: 'active', label: 'Active', who: 'Live', yours: false, count: lg.stages.active, to: '/agreements?status=active', icon: <CheckCircle2 />, done: true },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Review queue"
              description="Signed agreements waiting for your Legal review, overdue first"
              icon={<FileCheck2 />}
              action={
                <ButtonLink to="/agreements?status=pending_approval" variant="link" size="sm">
                  View all
                </ButtonLink>
              }
            />
            {lg.queue.length ? (
              <>
                <div className="flex flex-wrap gap-2 border-b border-line/70 px-5 py-3">
                  <UrgencyChip tone="red" count={overdue} label="Overdue" />
                  <UrgencyChip tone="amber" count={dueSoon} label="Due this week" />
                  <UrgencyChip tone="grey" count={lg.queue.length - overdue - dueSoon} label="Later" />
                </div>
                <ul className="divide-y divide-line">
                  {lg.queue.map((q) => (
                    <li key={q.agreement.id}>
                      <Link to={`/agreements/${q.agreement.id}/legal-review`} className={cn('group flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--surface-hover)]', q.overdue && 'bg-danger-50/50 hover:bg-danger-50')}>
                        <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', q.overdue ? 'bg-danger-600' : 'bg-primary-500')} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink group-hover:text-primary-800">{q.agreement.cpName}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            <span className="font-mono">{q.agreement.id}</span> · {q.agreement.institutionCode} · {q.signedBy === 'e-sign' ? 'E-signed' : 'Signed on paper'}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {q.agreement.nonStandard ? (
                              <Badge tone="orange">Non-standard · {q.deviations} deviation{q.deviations === 1 ? '' : 's'} to check</Badge>
                            ) : (
                              <Badge tone="grey">Standard terms</Badge>
                            )}
                            {q.resubmitted && <Badge tone="blue">Corrected documents re-submitted</Badge>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn('text-xs font-semibold', q.overdue ? 'text-danger-700' : 'text-ink-soft')}>{dueLabel(q.dueDate)}</p>
                          <p className="text-xs text-subtle">waiting {q.days} day{q.days === 1 ? '' : 's'}</p>
                          <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-primary-700 group-hover:underline">
                            Review <ChevronRight className="size-3.5" aria-hidden />
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState compact icon={<CheckCircle2 />} title="Review queue is empty" description="Signed agreements come here for Legal review before Admin’s final approval." />
            )}
          </Card>

          <Card id="deviations">
            <CardHeader title="Deviations to decide" description="Non-standard terms a BD has requested on a draft, before it is signed" icon={<Scale />} />
            {lg.deviations.length ? (
              <ul className="divide-y divide-line">
                {lg.deviations.map((v) => (
                  <li key={v.agreement.id}>
                    <Link to={`/agreements/${v.agreement.id}/deviation`} className="group flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--surface-hover)]">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200 [&_svg]:size-4">
                        <Scale />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink group-hover:text-primary-800">{v.agreement.cpName}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {[v.rates && `${v.rates} rate change${v.rates === 1 ? '' : 's'}`, v.clauses && `${v.clauses} clause change${v.clauses === 1 ? '' : 's'}`].filter(Boolean).join(' · ')} · requested by {v.requestedBy}
                        </p>
                        {v.documents > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                            <Paperclip className="size-3" aria-hidden /> {v.documents} supporting document{v.documents === 1 ? '' : 's'}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-ink-soft">{v.days === 0 ? 'Today' : `${v.days} day${v.days === 1 ? '' : 's'}`}</p>
                        <p className="text-xs text-subtle">since {formatShortDate(v.since)}</p>
                        <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-primary-700 group-hover:underline">
                          Decide <ChevronRight className="size-3.5" aria-hidden />
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<Scale />} title="No deviation requests" description="When a BD asks for different rates or clause wording, it waits here for your decision." />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Documents sent back" description="You asked for corrected CP documents; follow up if they sit too long" icon={<Undo2 />} />
            {lg.docs.length ? (
              <ul className="divide-y divide-line">
                {lg.docs.map((x) => (
                  <li key={x.agreement.id}>
                    <Link to={`/agreements/${x.agreement.id}`} className="group flex items-start gap-3 px-5 py-3 hover:bg-[var(--surface-hover)]">
                      <Badge tone={DOC_STAGE[x.stage].tone} className="mt-0.5 shrink-0">
                        {DOC_STAGE[x.stage].label}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink group-hover:text-primary-800">{x.agreement.cpName}</p>
                        <p className="truncate text-xs text-muted">
                          {x.items} document{x.items === 1 ? '' : 's'} · {DOC_STAGE[x.stage].what}
                        </p>
                      </div>
                      <p className={cn('shrink-0 text-right text-xs font-semibold', x.days >= 5 ? 'text-orange-700' : 'text-ink-soft')}>
                        {x.days === 0 ? 'Today' : `${x.days} day${x.days === 1 ? '' : 's'}`}
                        <span className="block font-normal text-subtle">since {formatShortDate(x.since)}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<FileCheck2 />} title="Nothing sent back" description="Agreements you return for corrected CP documents are tracked here until they come back." />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Templates & rate cards"
              description="Set-up changes waiting for Legal approval"
              icon={<ScrollText />}
              action={
                <ButtonLink to="/admin" variant="link" size="sm">
                  Open
                </ButtonLink>
              }
            />
            {configTasks.length ? (
              <div className="divide-y divide-line">
                {configTasks.map((t) => (
                  <TaskRow key={t.id} t={t} compact />
                ))}
              </div>
            ) : (
              <EmptyState compact icon={<ScrollText />} title="Nothing to approve" description="New template and rate card versions wait here for your approval." />
            )}
          </Card>

          <Card>
            <CardHeader title="Your last 30 days" description="Decisions you made" icon={<BadgeCheck />} />
            <StatGrid>
              <MiniStat label="Approved to Admin" value={lg.last30.approved} icon={<BadgeCheck />} tone="text-green-600" />
              <MiniStat label="Returned to BD" value={lg.last30.returned} icon={<RotateCcw />} tone="text-red-500" />
              <MiniStat label="Documents requested" value={lg.last30.docsRequested} icon={<FileWarning />} tone="text-blue-500" />
              <MiniStat label="Deviations decided" value={lg.last30.deviationsDecided} icon={<Scale />} tone="text-orange-500" />
            </StatGrid>
            <Link to="/agreements?nonStandard=1" className="flex items-center gap-1.5 border-t border-line/70 px-5 py-2.5 text-xs text-muted hover:text-primary-700">
              <Hourglass className="size-3.5 text-orange-500" aria-hidden />
              {lg.nonStandardLive} live agreement{lg.nonStandardLive === 1 ? '' : 's'} on non-standard terms
              <ChevronRight className="ml-auto size-3.5" aria-hidden />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

const DOC_STAGE: Record<LegalDocsItem['stage'], { label: string; tone: 'amber' | 'blue' | 'purple'; what: string }> = {
  with_bd: { label: 'With BD', tone: 'amber', what: 'BD to send the CP an upload link' },
  sent_to_cp: { label: 'With CP', tone: 'blue', what: 'CP to upload corrected documents' },
  cp_submitted: { label: 'BD checking', tone: 'purple', what: 'CP uploaded; BD to check and send back' },
};

function dueLabel(due?: string): string {
  if (!due) return 'No due date';
  const days = daysUntil(due);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}
