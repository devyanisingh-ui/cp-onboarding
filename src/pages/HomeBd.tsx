import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CheckCircle2, ChevronRight, FilePen, FileSignature, FileWarning, Hourglass, PenLine, Plus, RefreshCcw, Scale, ShieldCheck, Sparkles, UserCheck, Users, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TaskType } from '@/types';
import type { Dashboard, TaskItem, WaitingOn } from '@/services/api/inbox';
import { cn } from '@/lib/cn';
import { formatShortDate } from '@/lib/dates';
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from '@/components/ui';
import { AgreementTable, TaskRow } from '@/components/lists';

/**
 * Home for a BD Executive: their agreements laid out along the workflow, what needs them (grouped by
 * the kind of work), what they are waiting on, and how their portfolio is doing.
 */
export function HomeBd({ data, greeting, firstName }: { data: Dashboard; greeting: string; firstName: string }) {
  const bd = data.bd!;
  const tasks = data.pendingTasks;
  const dueSoon = tasks.filter((t) => !t.overdue && t.daysLeft <= 7).length;
  const later = tasks.length - data.overdueCount - dueSoon;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-eyebrow text-primary-700">BD Executive</p>
          <h1 className="text-display mt-1.5">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted">{summaryLine(tasks.length, data.overdueCount, bd.waiting.length)}</p>
        </div>
        <ButtonLink to="/agreements/new" size="lg" icon={<Plus className="size-4 sm:size-5" />} className="w-full max-sm:h-10 max-sm:px-4 max-sm:text-sm sm:w-auto">
          New CP agreement
        </ButtonLink>
      </div>

      <Pipeline stages={bd.stages} />

      {data.wizardDrafts > 0 && (
        <Link to="/agreements/new" className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-5 py-3.5 text-sm hover:bg-primary-100/60">
          <span>
            <span className="font-semibold text-primary-900">You have {data.wizardDrafts} unfinished agreement{data.wizardDrafts === 1 ? '' : 's'}.</span>
            <span className="text-primary-800"> Pick up where you left off.</span>
          </span>
          <ArrowRight className="size-4 text-primary-700" aria-hidden />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader
            title="Needs your action"
            description="Grouped by what you need to do, most urgent first"
            icon={<PenLine />}
            action={
              <ButtonLink to="/tasks" variant="link" size="sm">
                All tasks
              </ButtonLink>
            }
          />
          {tasks.length ? (
            <>
              <div className="flex flex-wrap gap-2 border-b border-line/70 px-5 py-3">
                <UrgencyChip tone="red" count={data.overdueCount} label="Overdue" to="/tasks?overdue=1" />
                <UrgencyChip tone="amber" count={dueSoon} label="Due this week" />
                <UrgencyChip tone="grey" count={later} label="Later" />
              </div>
              <div className="divide-y divide-line">
                {groupTasks(tasks).map((g) => (
                  <section key={g.key} aria-label={g.label}>
                    <div className="flex items-center gap-2 bg-canvas/50 px-5 py-2">
                      <span className="text-subtle [&_svg]:size-4">{g.icon}</span>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{g.label}</h3>
                      <span className="rounded-full bg-white px-1.5 text-xs font-semibold tabular-nums text-ink-soft ring-1 ring-line">{g.items.length}</span>
                      <span className="ml-auto hidden text-xs text-muted sm:inline">{g.hint}</span>
                    </div>
                    <div className="divide-y divide-line/70">
                      {g.items.map((t) => (
                        <TaskRow key={t.id} t={t} compact />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              compact
              icon={<CheckCircle2 />}
              title="Nothing needs you right now"
              description="When an agreement comes back to you — to fix, get signed or collect documents — it shows up here."
              action={
                <ButtonLink to="/agreements/new" icon={<Plus className="size-4" />}>
                  New CP agreement
                </ButtonLink>
              }
            />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Waiting on others" description="Follow up if anything sits too long" icon={<Hourglass />} />
            {bd.waiting.length ? (
              <ul className="divide-y divide-line">
                {bd.waiting.slice(0, 6).map((w) => (
                  <li key={w.agreement.id}>
                    <Link to={`/agreements/${w.agreement.id}`} className="group flex items-start gap-3 px-5 py-3 hover:bg-[var(--surface-hover)]">
                      <Badge tone={WAITING_META[w.on].tone} className="mt-0.5 shrink-0">
                        {WAITING_META[w.on].label}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink group-hover:text-primary-800">{w.agreement.cpName}</p>
                        <p className="truncate text-xs text-muted">
                          {w.what} · <span className="font-mono">{w.agreement.id}</span>
                        </p>
                      </div>
                      <p className={cn('shrink-0 text-right text-xs font-semibold', w.days >= 5 ? 'text-orange-700' : 'text-ink-soft')}>
                        {w.days === 0 ? 'Today' : `${w.days} day${w.days === 1 ? '' : 's'}`}
                        <span className="block font-normal text-subtle">since {formatShortDate(w.since)}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<UserCheck />} title="Nothing waiting on others" description="Agreements with Legal, Admin, the CP or signers appear here with how long they have waited." />
            )}
          </Card>

          <Card>
            <CardHeader title="My portfolio" description="Your agreements across institutions" icon={<Users />} />
            <div className="grid grid-cols-2 gap-px bg-line/60">
              <Stat label="Active agreements" value={bd.stats.active} to="/agreements?status=active&mine=1" icon={<ShieldCheck />} tone="text-green-600" />
              <Stat label="Expiring in 60 days" value={bd.stats.expiring} to="/agreements?status=expiring&mine=1" icon={<CalendarClock />} tone="text-orange-500" />
              <Stat label="Activated in last 30 days" value={bd.stats.activated30d} icon={<Sparkles />} tone="text-primary-500" />
              <Stat label="CPs onboarded" value={bd.stats.cps} to="/cps" icon={<Users />} tone="text-purple-500" />
            </div>
            {bd.stats.nonStandard > 0 && (
              <p className="flex items-center gap-1.5 border-t border-line/70 px-5 py-2.5 text-xs text-muted">
                <Scale className="size-3.5 text-orange-500" aria-hidden />
                {bd.stats.nonStandard} of your live agreements {bd.stats.nonStandard === 1 ? 'has' : 'have'} non-standard terms
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Renewals coming up"
          description="Your agreements expiring within 60 days. Decide renew or not 30 days before expiry."
          icon={<RefreshCcw />}
          action={
            <ButtonLink to="/agreements?status=expiring&mine=1" variant="link" size="sm">
              View all
            </ButtonLink>
          }
        />
        {bd.expiring.length ? (
          <AgreementTable items={bd.expiring.slice(0, 5)} caption="Expiring agreements" showOwner={false} compact />
        ) : (
          <EmptyState compact icon={<CalendarClock />} title="No renewals coming up" description="Your agreements appear here 60 days before they expire." />
        )}
      </Card>
    </div>
  );
}

function summaryLine(tasks: number, overdue: number, waiting: number): string {
  const parts: string[] = [];
  parts.push(tasks ? `${tasks} thing${tasks === 1 ? '' : 's'} need${tasks === 1 ? 's' : ''} you${overdue ? `, ${overdue} overdue` : ''}` : 'Nothing needs you right now');
  if (waiting) parts.push(`${waiting} waiting on others`);
  return `${parts.join(' · ')}.`;
}

// ---------- Pipeline ----------

const STAGES: { key: keyof NonNullable<Dashboard['bd']>['stages']; label: string; who: string; yours: boolean; to: string; icon: ReactNode }[] = [
  { key: 'draft', label: 'Draft', who: 'Your move', yours: true, to: '/agreements?status=draft&mine=1', icon: <FilePen /> },
  { key: 'signing', label: 'Ready for signing', who: 'Your move', yours: true, to: '/agreements?status=approved_for_signing&mine=1', icon: <FileSignature /> },
  { key: 'legal', label: 'Legal review', who: 'With Legal', yours: false, to: '/agreements?status=pending_approval&mine=1', icon: <Scale /> },
  { key: 'admin', label: 'Admin approval', who: 'With Admin', yours: false, to: '/agreements?status=pending_admin_approval&mine=1', icon: <ShieldCheck /> },
  { key: 'active', label: 'Active', who: 'Live', yours: false, to: '/agreements?status=active&mine=1', icon: <CheckCircle2 /> },
];

function Pipeline({ stages }: { stages: NonNullable<Dashboard['bd']>['stages'] }) {
  return (
    <Card>
      <CardHeader title="My agreements pipeline" description="Where each of your agreements is in the workflow. Highlighted steps are your move." icon={<ArrowRight />} />
      <ol className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5 sm:gap-0 sm:p-4">
        {STAGES.map((s, i) => {
          const n = stages[s.key];
          const hot = s.yours && n > 0;
          return (
            <li key={s.key} className="relative flex items-stretch max-sm:last:col-span-2">
              <Link
                to={s.to}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors sm:flex-col sm:items-start sm:gap-2 sm:px-4',
                  hot ? 'bg-primary-50 ring-1 ring-primary-200 hover:bg-primary-100/70' : 'hover:bg-[var(--surface-hover)]',
                )}
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset [&_svg]:size-[18px]', hot ? 'bg-white text-primary-700 ring-primary-200' : s.key === 'active' ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-slate-50 text-slate-500 ring-slate-200')}>
                  {s.icon}
                </span>
                <span className="min-w-0">
                  {/* Phones: the label sits under the count so it is never cut off. */}
                  <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="text-2xl font-semibold leading-none tabular-nums text-ink">{n}</span>
                    <span className="text-sm font-medium leading-tight text-ink-soft sm:truncate">{s.label}</span>
                  </span>
                  <span className={cn('mt-1 block text-xs', hot ? 'font-semibold text-primary-700' : 'text-subtle')}>{s.who}</span>
                </span>
              </Link>
              {i < STAGES.length - 1 && <ChevronRight className="pointer-events-none absolute -right-2 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-subtle sm:block" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---------- Needs your action ----------

const GROUPS: { key: string; label: string; hint: string; icon: ReactNode; types: TaskType[] }[] = [
  { key: 'fix', label: 'Fix and resubmit', hint: 'Returned by Legal or Admin', icon: <Wrench />, types: ['fix_rejected'] },
  { key: 'sign', label: 'Get signed and upload', hint: 'E-sign, or print, sign and upload', icon: <FileSignature />, types: ['signing_upload', 'legacy_scan_upload'] },
  { key: 'docs', label: 'CP documents', hint: 'Send the link, then check uploads', icon: <FileWarning />, types: ['cp_doc_request', 'cp_doc_review'] },
  { key: 'renew', label: 'Renewal decisions', hint: 'Renew or not, 30 days before expiry', icon: <RefreshCcw />, types: ['renewal_decision'] },
];

function groupTasks(tasks: TaskItem[]) {
  const known = new Set(GROUPS.flatMap((g) => g.types));
  const groups = [...GROUPS, { key: 'other', label: 'Other', hint: '', icon: <PenLine />, types: [] as TaskType[] }].map((g) => ({
    ...g,
    items: tasks.filter((t) => (g.key === 'other' ? !known.has(t.type) : g.types.includes(t.type))),
  }));
  // Groups with an overdue task first, then by the earliest due date; empty groups are hidden.
  return groups
    .filter((g) => g.items.length)
    .sort((a, b) => Number(b.items.some((t) => t.overdue)) - Number(a.items.some((t) => t.overdue)) || a.items[0]!.dueDate.localeCompare(b.items[0]!.dueDate));
}

function UrgencyChip({ tone, count, label, to }: { tone: 'red' | 'amber' | 'grey'; count: number; label: string; to?: string }) {
  const cls = cn(
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
    count === 0 ? 'bg-white text-subtle ring-line' : tone === 'red' ? 'bg-danger-50 text-danger-700 ring-danger-200' : tone === 'amber' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-50 text-slate-700 ring-slate-200',
  );
  const body = (
    <>
      <span className="font-semibold tabular-nums">{count}</span> {label}
    </>
  );
  return to && count ? (
    <Link to={to} className={cn(cls, 'hover:brightness-95')}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

// ---------- Waiting on others / portfolio ----------

const WAITING_META: Record<WaitingOn, { label: string; tone: 'amber' | 'purple' | 'blue' | 'orange' }> = {
  legal: { label: 'Legal', tone: 'amber' },
  deviation: { label: 'Legal', tone: 'orange' },
  admin: { label: 'Admin', tone: 'purple' },
  cp: { label: 'CP', tone: 'blue' },
  signers: { label: 'Signers', tone: 'blue' },
};

function Stat({ label, value, to, icon, tone }: { label: string; value: number; to?: string; icon: ReactNode; tone: string }) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span className={cn('[&_svg]:size-3.5', tone)}>{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
    </>
  );
  return to ? (
    <Link to={to} className="block bg-white/80 px-5 py-3.5 hover:bg-white">
      {body}
    </Link>
  ) : (
    <div className="bg-white/80 px-5 py-3.5">{body}</div>
  );
}
