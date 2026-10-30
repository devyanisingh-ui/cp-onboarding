'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ChevronDown, FilePen, FileSignature, FileWarning, Hourglass, PenLine, Plus, RefreshCcw, Scale, ShieldCheck, Sparkles, UserCheck, Users, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { TaskType } from '@/types';
import type { Dashboard, TaskItem, WaitingOn } from '@/services/api/inbox';
import { cn } from '@/lib/cn';
import { formatShortDate } from '@/lib/dates';
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from '@/components/ui';
import { ageLabel, AgreementDashRow, DashRow, MiniStat, Pill, StatGrid, TaskDashRow, TILE, UrgencyChip, WorkflowStrip } from '@/components/dashboard';

const COLLAPSED_KEY = 'cp-onboarding:bd-home-collapsed';

/**
 * Home for a BD Executive: their agreements laid out along the workflow, what needs them (grouped by
 * the kind of work), what they are waiting on, and how their portfolio is doing.
 */
export function HomeBd({ data, greeting, firstName }: { data: Dashboard; greeting: string; firstName: string }) {
  const bd = data.bd!;
  const tasks = data.pendingTasks;
  const dueSoon = tasks.filter((t) => !t.overdue && t.daysLeft <= 7).length;
  const later = tasks.length - data.overdueCount - dueSoon;
  const groups = groupTasks(tasks);
  // Which "Needs your action" groups are collapsed; remembered in this browser (best effort).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const save = (next: Set<string>) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      /* storage blocked: still works for this visit */
    }
  };
  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    save(next);
  };
  const setAll = (close: boolean) => save(close ? new Set(groups.map((g) => g.key)) : new Set());

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

      <WorkflowStrip
        title="My agreements pipeline"
        description="Where each of your agreements is in the workflow. Highlighted steps are your move."
        steps={[
          { key: 'draft', label: 'Draft', who: 'Your move', yours: true, count: bd.stages.draft, to: '/agreements?status=draft&mine=1', icon: <FilePen /> },
          { key: 'signing', label: 'Ready for signing', who: 'Your move', yours: true, count: bd.stages.signing, to: '/agreements?status=approved_for_signing&mine=1', icon: <FileSignature /> },
          { key: 'legal', label: 'Legal review', who: 'With Legal', yours: false, count: bd.stages.legal, to: '/agreements?status=pending_approval&mine=1', icon: <Scale /> },
          { key: 'active', label: 'Active', who: 'Live', yours: false, count: bd.stages.active, to: '/agreements?status=active&mine=1', icon: <CheckCircle2 />, done: true },
        ]}
      />

      {data.wizardDrafts > 0 && (
        <Link href="/agreements/new" className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-5 py-3.5 text-sm hover:bg-primary-100/60">
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
                {groups.length > 1 && (
                  <button type="button" onClick={() => setAll(collapsed.size < groups.length)} className="hit-area ml-auto text-xs font-semibold text-primary-700 hover:underline">
                    {collapsed.size < groups.length ? 'Collapse all' : 'Expand all'}
                  </button>
                )}
              </div>
              <div className="divide-y divide-line">
                {groups.map((g) => {
                  const open = !collapsed.has(g.key);
                  return (
                    <section key={g.key} aria-label={g.label}>
                      <h3>
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={`bd-group-${g.key}`}
                          onClick={() => toggle(g.key)}
                          className="group flex w-full items-center gap-2 bg-canvas/50 px-5 py-2 text-left transition-colors hover:bg-canvas"
                        >
                          <ChevronDown className={cn('size-4 shrink-0 text-subtle transition-transform duration-200', !open && '-rotate-90')} aria-hidden />
                          <span className="text-subtle [&_svg]:size-4">{g.icon}</span>
                          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{g.label}</span>
                          <span className="rounded-full bg-white px-1.5 text-xs font-semibold tabular-nums text-ink-soft ring-1 ring-line">{g.items.length}</span>
                          {!open && g.items.some((t) => t.overdue) && <span className="rounded-full bg-danger-50 px-1.5 text-[11px] font-semibold text-danger-700 ring-1 ring-inset ring-danger-200">overdue</span>}
                          <span className="ml-auto hidden text-xs font-normal normal-case text-muted sm:inline">{g.hint}</span>
                        </button>
                      </h3>
                      {open && (
                        <ul id={`bd-group-${g.key}`} className="divide-y divide-line/70">
                          {g.items.map((t) => (
                            <TaskDashRow key={t.id} t={t} />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
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

        {/* The last card stretches so this column ends level with "Needs your action". */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Waiting on others" description="Follow up if anything sits too long" icon={<Hourglass />} />
            {bd.waiting.length ? (
              <ul className="divide-y divide-line">
                {bd.waiting.slice(0, 6).map((w) => (
                  <DashRow
                    key={w.agreement.id}
                    to={`/agreements/${w.agreement.id}`}
                    icon={WAITING_META[w.on].icon}
                    tile={TILE[WAITING_META[w.on].tone]}
                    title={w.agreement.cpName}
                    sub={<>{w.what} · <span className="font-mono">{w.agreement.id}</span></>}
                    badges={<Badge tone={WAITING_META[w.on].tone}>With {WAITING_META[w.on].label}</Badge>}
                    pill={<Pill tone={w.days >= 5 ? 'amber' : 'grey'}>{ageLabel(w.days)}</Pill>}
                    when={`since ${formatShortDate(w.since)}`}
                    action="Open"
                  />
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<UserCheck />} title="Nothing waiting on others" description="Agreements with Legal, the CP or signers appear here with how long they have waited." />
            )}
          </Card>

          <Card className="flex-1 overflow-hidden">
            <CardHeader title="My portfolio" description="Your agreements across institutions" icon={<Users />} />
            <StatGrid>
              <MiniStat label="Active agreements" value={bd.stats.active} to="/agreements?status=active&mine=1" icon={<ShieldCheck />} tone="text-green-600" />
              <MiniStat label="Expiring in 60 days" value={bd.stats.expiring} to="/agreements?status=expiring&mine=1" icon={<CalendarClock />} tone="text-orange-500" />
              <MiniStat label="Activated in last 30 days" value={bd.stats.activated30d} icon={<Sparkles />} tone="text-primary-500" />
              <MiniStat label="CPs onboarded" value={bd.stats.cps} to="/cps" icon={<Users />} tone="text-purple-500" />
            </StatGrid>
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
          <ul className="divide-y divide-line" aria-label="Expiring agreements">
            {bd.expiring.slice(0, 5).map((a) => (
              <AgreementDashRow key={a.id} a={a} icon={<RefreshCcw />} tile={TILE.teal} action="Open" />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={<CalendarClock />} title="No renewals coming up" description="Your agreements appear here 60 days before they expire." />
        )}
      </Card>
    </div>
  );
}

function summaryLine(tasks: number, overdue: number, waiting: number): string {
  const others = waiting ? `${waiting} agreement${waiting === 1 ? ' is' : 's are'} with Legal or the CP` : '';
  if (!tasks) return `You’re all caught up: nothing needs you right now.${others ? ` ${others}.` : ''}`;
  const todo = `You have ${tasks} task${tasks === 1 ? '' : 's'} to work on`;
  if (overdue) return `${todo}, and ${overdue} ${overdue === 1 ? 'is' : 'are'} overdue.${others ? ` ${others}.` : ''}`;
  return others ? `${todo}, and ${others}.` : `${todo}.`;
}

// ---------- Needs your action ----------

const GROUPS: { key: string; label: string; hint: string; icon: ReactNode; types: TaskType[] }[] = [
  { key: 'fix', label: 'Fix and resubmit', hint: 'Returned by Legal or Admin', icon: <Wrench />, types: ['fix_rejected'] },
  { key: 'sign', label: 'Get signed and upload', hint: 'Print, sign on stamp paper, then upload', icon: <FileSignature />, types: ['signing_upload', 'legacy_scan_upload'] },
  { key: 'docs', label: 'CP details sent back', hint: 'Correct what Legal flagged, send back to Legal', icon: <FileWarning />, types: ['cp_doc_request'] },
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

// ---------- Waiting on others / portfolio ----------

const WAITING_META: Record<WaitingOn, { label: string; tone: 'amber' | 'purple' | 'blue' | 'orange'; icon: ReactNode }> = {
  legal: { label: 'Legal', tone: 'amber', icon: <Scale /> },
  deviation: { label: 'Legal', tone: 'orange', icon: <Scale /> },
  cp: { label: 'CP', tone: 'blue', icon: <Users /> },
  signers: { label: 'Signers', tone: 'purple', icon: <FileSignature /> },
}
