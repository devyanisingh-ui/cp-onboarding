import { Link } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, ChevronRight, FileCheck2, FileSignature, FileWarning, Hourglass, Paperclip, RotateCcw, Scale, ScrollText, Undo2 } from 'lucide-react';
import type { Dashboard, LegalDocsItem } from '@/services/api/inbox';
import { daysUntil, formatShortDate, shiftDays, today } from '@/lib/dates';
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from '@/components/ui';
import { DuePill, TASK_TYPE_META } from '@/components/lists';
import { TASK_TYPE_LABELS } from '@/lib/links';
import { ageLabel, DashRow, MiniStat, Pill, StatGrid, TILE, UrgencyChip, WorkflowStrip } from '@/components/dashboard';

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
          { key: 'active', label: 'Active', who: 'Live', yours: false, count: lg.stages.active, to: '/agreements?status=active', icon: <CheckCircle2 />, done: true },
        ]}
      />

      {/* Both columns are flex columns whose last card stretches, so the two end on the same line. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
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
                    <DashRow
                      key={q.agreement.id}
                      to={`/agreements/${q.agreement.id}/legal-review`}
                      icon={<FileSignature />}
                      tile={q.overdue ? TILE.red : TILE.primary}
                      urgent={q.overdue}
                      title={q.agreement.cpName}
                      sub={<><span className="font-mono">{q.agreement.id}</span> · {q.agreement.institutionCode} · {q.signedBy === 'e-sign' ? 'E-signed' : 'Signed on paper'}</>}
                      badges={
                        <>
                          {q.agreement.nonStandard ? <Badge tone="orange">Non-standard · {q.deviations} deviation{q.deviations === 1 ? '' : 's'} to check</Badge> : <Badge tone="grey">Standard terms</Badge>}
                          {q.resubmitted && <Badge tone="blue">Corrected documents re-submitted</Badge>}
                        </>
                      }
                      pill={<Pill tone={q.overdue ? 'red' : q.dueDate && daysUntil(q.dueDate) <= 1 ? 'amber' : 'grey'}>{dueLabel(q.dueDate)}</Pill>}
                      when={`waiting ${q.days} day${q.days === 1 ? '' : 's'}`}
                      action="Review"
                    />
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState compact icon={<CheckCircle2 />} title="Review queue is empty" description="Signed agreements come here for Legal review. Your approval makes them Active." />
            )}
          </Card>

          <Card id="deviations">
            <CardHeader title="Deviations to decide" description="Non-standard terms a BD has requested on a draft, before it is signed" icon={<Scale />} action={<ButtonLink to="/tasks" variant="link" size="sm">View all</ButtonLink>} />
            {lg.deviations.length ? (
              <ul className="divide-y divide-line">
                {lg.deviations.map((v) => (
                  <DashRow
                    key={v.agreement.id}
                    to={`/agreements/${v.agreement.id}/deviation`}
                    icon={<Scale />}
                    tile={TILE.orange}
                    title={v.agreement.cpName}
                    sub={`${[v.rates && `${v.rates} rate change${v.rates === 1 ? '' : 's'}`, v.clauses && `${v.clauses} clause change${v.clauses === 1 ? '' : 's'}`].filter(Boolean).join(' · ')} · requested by ${v.requestedBy}`}
                    badges={
                      v.documents > 0 && (
                        <Badge tone="grey" icon={<Paperclip className="size-3" aria-hidden />}>
                          {v.documents} supporting document{v.documents === 1 ? '' : 's'}
                        </Badge>
                      )
                    }
                    pill={<Pill tone={v.days >= 3 ? 'amber' : 'grey'}>{ageLabel(v.days)}</Pill>}
                    when={`since ${formatShortDate(v.since)}`}
                    action="Decide"
                  />
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<Scale />} title="No deviation requests" description="When a BD asks for different rates or clause wording, it waits here for your decision." />
            )}
          </Card>

          <Card className="flex-1">
            <CardHeader
              title="Templates & rate cards"
              description="Set-up changes waiting for Legal approval"
              icon={<ScrollText />}
              action={
                <ButtonLink to="/admin" variant="link" size="sm">
                  View all
                </ButtonLink>
              }
            />
            {configTasks.length ? (
              <ul className="divide-y divide-line">
                {configTasks.map((t) => (
                  <DashRow
                    key={t.id}
                    to={t.link}
                    icon={TASK_TYPE_META[t.type].icon}
                    tile={TILE.indigo}
                    urgent={t.overdue}
                    title={t.title.replace(/^Approve (rate card|template): /, '')}
                    sub={<>{TASK_TYPE_LABELS[t.type]}{t.institutionCode && ` · ${t.institutionCode}`}</>}
                    pill={<DuePill t={t} />}
                    when={formatShortDate(t.dueDate)}
                    action="Approve"
                  />
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<ScrollText />} title="Nothing to approve" description="New template and rate card versions wait here for your approval." />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Your last 30 days" description="Decisions you made" icon={<BadgeCheck />} action={<ButtonLink to="/reports" variant="link" size="sm">Reports</ButtonLink>} />
            <StatGrid>
              <MiniStat label="Approved (now Active)" value={lg.last30.approved} icon={<BadgeCheck />} tone="text-green-600" />
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

          <Card className="flex flex-1 flex-col">
            <CardHeader title="Documents sent back" description="You asked for corrected CP documents; follow up if they sit too long" icon={<Undo2 />} action={<ButtonLink to="/agreements?status=docs_requested" variant="link" size="sm">View all</ButtonLink>} />
            {lg.docs.length ? (
              <ul className="divide-y divide-line">
                {lg.docs.map((x) => (
                  <DashRow
                    key={x.agreement.id}
                    to={`/agreements/${x.agreement.id}`}
                    icon={<FileWarning />}
                    tile={TILE.blue}
                    title={x.agreement.cpName}
                    sub={`${x.items} document${x.items === 1 ? '' : 's'} · ${DOC_STAGE[x.stage].what}`}
                    badges={<Badge tone={DOC_STAGE[x.stage].tone}>{DOC_STAGE[x.stage].label}</Badge>}
                    pill={<Pill tone={x.days >= 5 ? 'amber' : 'grey'}>{ageLabel(x.days)}</Pill>}
                    when={`since ${formatShortDate(x.since)}`}
                    action="Open"
                  />
                ))}
              </ul>
            ) : (
              <div className="flex flex-1 flex-col justify-center">
                <EmptyState compact icon={<FileCheck2 />} title="Nothing sent back" description="Agreements you return for corrected CP documents are tracked here until they come back." />
              </div>
            )}
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
