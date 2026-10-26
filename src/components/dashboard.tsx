'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { TaskType } from '@/types';
import type { TaskItem } from '@/services/api/inbox';
import type { AgreementSummary } from '@/services/api/dto';
import { daysUntil, formatShortDate } from '@/lib/dates';
import { CP_TYPE_LABELS } from '@/lib/format';
import { TASK_TYPE_LABELS } from '@/lib/links';
import { Badge, Card, CardHeader, StatusBadge } from '@/components/ui';
import { AgreementFlags, DuePill, TASK_TYPE_META } from '@/components/lists';

/** Pieces shared by the role dashboards on Home (BD Executive, Legal). */

/** A route, or `#id` to scroll to a section on this page (a real hash would clash with hash routing). */
function StepLink({ to, className, children }: { to: string; className: string; children: ReactNode }) {
  if (to.startsWith('#'))
    return (
      <button type="button" className={className} onClick={() => document.getElementById(to.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        {children}
      </button>
    );
  return (
    <Link href={to} className={className}>
      {children}
    </Link>
  );
}

export interface WorkflowStep {
  key: string;
  label: string;
  /** Who holds it: "Your move", "With Legal", "Live"… */
  who: string;
  /** Highlighted when it has items: the viewer's own step. */
  yours: boolean;
  count: number;
  /** A route, or `#section-id` on this page. */
  to: string;
  icon: ReactNode;
  done?: boolean;
}

/** The workflow as a strip of steps with counts; the viewer's own steps are highlighted. */
export function WorkflowStrip({ title, description, steps }: { title: string; description: string; steps: WorkflowStep[] }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {/* Phones 2 columns, tablets 3 (2 for four steps), one row from xl up (text beside the icon needs the width). The gap keeps every step in its own box; the arrows sit in it. */}
      <ol className={cn('grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4 xl:grid-cols-[repeat(var(--steps),minmax(0,1fr))] xl:gap-5', steps.length === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')} style={{ ['--steps' as string]: steps.length }}>
        {steps.map((s, i) => {
          const hot = s.yours && s.count > 0;
          return (
            <li key={s.key} className={cn('relative flex min-w-0 items-stretch', steps.length % 2 === 1 && 'max-sm:last:col-span-2')}>
              <StepLink
                to={s.to}
                className={cn(
                  'group flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-left ring-1 transition-colors sm:gap-3.5 sm:px-4 sm:py-3.5',
                  hot ? 'bg-primary-50 ring-primary-200 hover:bg-primary-100/70' : 'bg-white/40 ring-line/60 hover:bg-[var(--surface-hover)]',
                )}
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset sm:size-11 [&_svg]:size-[18px] sm:[&_svg]:size-5', hot ? 'bg-white text-primary-700 ring-primary-200' : s.done ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-slate-50 text-slate-500 ring-slate-200')}>
                  {s.icon}
                </span>
                <span className="min-w-0 max-w-full">
                  {/* Beside the icon: the count, then the label, which wraps inside the box so it never runs into the next step. */}
                  <span className="flex flex-col gap-1">
                    <span className="text-2xl font-semibold leading-none tabular-nums text-ink">{s.count}</span>
                    <span className="break-words text-sm font-medium leading-tight text-ink-soft">{s.label}</span>
                  </span>
                  <span className={cn('mt-1 block break-words text-xs', hot ? 'font-semibold text-primary-700' : 'text-subtle')}>{s.who}</span>
                </span>
              </StepLink>
              {/* Centred in the 20px gap to the next step; only when all steps share one row. */}
              {i < steps.length - 1 && <ChevronRight className="pointer-events-none absolute -right-[18px] top-1/2 z-10 hidden size-4 -translate-y-1/2 text-subtle xl:block" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function UrgencyChip({ tone, count, label, to }: { tone: 'red' | 'amber' | 'grey'; count: number; label: string; to?: string }) {
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
    <Link href={to} className={cn(cls, 'hover:brightness-95')}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** One number in a 2-column stat grid (wrap several in `StatGrid`). */
export function MiniStat({ label, value, to, icon, tone }: { label: string; value: number; to?: string; icon: ReactNode; tone: string }) {
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
    <Link href={to} className="flex flex-col justify-center bg-white/80 px-5 py-3.5 hover:bg-white">
      {body}
    </Link>
  ) : (
    <div className="flex flex-col justify-center bg-white/80 px-5 py-3.5">{body}</div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid auto-rows-fr grid-cols-2 gap-px bg-line/60', className)}>{children}</div>;
}

export const TILE = {
  primary: 'bg-primary-50 text-primary-700 ring-primary-200',
  red: 'bg-danger-50 text-danger-700 ring-danger-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  slate: 'bg-slate-50 text-slate-600 ring-slate-200',
};

const PILL = {
  red: 'bg-danger-50 text-danger-700 ring-danger-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  grey: 'bg-slate-50 text-slate-600 ring-slate-200',
};

export function Pill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', PILL[tone])}>{children}</span>;
}

export function ageLabel(days: number): string {
  return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
}

/** One row in any dashboard list: the same tile, text, pill, date and action on every role's Home. */
export function DashRow({ to, icon, tile, urgent, title, sub, badges, pill, when, action }: { to: string; icon: ReactNode; tile: string; urgent?: boolean; title: ReactNode; sub: ReactNode; badges?: ReactNode; pill: ReactNode; when: ReactNode; action: string }) {
  return (
    // A container query: the row follows the width of its card, not the screen, so a narrow card on a
    // wide screen gets the stacked layout too.
    <li className="@container">
      {/* Narrow: the pill, date and action drop to their own line under the text, so the title gets the full width. */}
      <Link href={to} className={cn('group flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-[var(--surface-hover)] @lg:flex-nowrap @lg:px-5', urgent && 'bg-danger-50/40 hover:bg-danger-50/70')}>
        <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset [&_svg]:size-[18px]', tile)} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink group-hover:text-primary-800 @lg:truncate">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{sub}</p>
          {/* Long badges (escalation notes) wrap inside the card instead of running out of it. */}
          {badges && <div className="mt-1.5 flex flex-wrap gap-1.5 [&>*]:max-w-full [&>*]:whitespace-normal">{badges}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2 @max-lg:basis-full @max-lg:pl-12 @lg:flex-col @lg:items-end @lg:gap-1 @lg:text-right">
          {pill}
          <p className="text-xs text-subtle">{when}</p>
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary-700 group-hover:underline @max-lg:ml-auto">
            {action} <ChevronRight className="size-3.5" aria-hidden />
          </span>
        </div>
      </Link>
    </li>
  );
}

/** What you do with each kind of task, as the row's action. */
const TASK_ACTION: Record<TaskType, string> = {
  gate1_approval: 'Review',
  deviation_review: 'Decide',
  fix_rejected: 'Fix',
  signing_upload: 'Upload',
  gate2_verification: 'Verify',
  renewal_decision: 'Decide',
  non_renewal_confirm: 'Confirm',
  termination_confirm: 'Confirm',
  rate_card_approval: 'Approve',
  template_approval: 'Approve',
  warning_override: 'Decide',
  legacy_scan_upload: 'Upload',
  rate_review: 'Review',
  cp_doc_request: 'Send link',
  cp_doc_review: 'Check',
};

/** A task as a dashboard row: its type's icon, what it is, when it's due and what to do. */
export function TaskDashRow({ t }: { t: TaskItem }) {
  return (
    <DashRow
      to={t.link}
      icon={TASK_TYPE_META[t.type].icon}
      tile={TASK_TYPE_META[t.type].tone}
      urgent={t.overdue}
      title={t.title}
      sub={
        <>
          {TASK_TYPE_LABELS[t.type]}
          {t.agreementId && <> · <span className="font-mono">{t.agreementId}</span></>}
          {t.institutionCode && ` · ${t.institutionCode}`}
        </>
      }
      badges={
        // Two short badges rather than one long one, so they wrap onto separate lines in a narrow card.
        t.escalatedToId && (
          <>
            <Badge tone="orange" icon={<AlertTriangle className="size-3" aria-hidden />}>
              {t.escalatedToMe ? 'Escalated to you' : `Escalated to ${t.escalatedToName}`}
            </Badge>
            {t.escalatedToMe && <Badge tone="grey">Assigned to {t.assigneeName}</Badge>}
          </>
        )
      }
      pill={<DuePill t={t} />}
      when={formatShortDate(t.dueDate)}
      action={TASK_ACTION[t.type]}
    />
  );
}

/** An agreement as a dashboard row. Expiring agreements show how long is left. */
export function AgreementDashRow({ a, icon, tile, pill, when, action = 'Open', owner }: { a: AgreementSummary; icon: ReactNode; tile: string; pill?: ReactNode; when?: ReactNode; action?: string; owner?: boolean }) {
  const left = a.endDate ? daysUntil(a.endDate) : undefined;
  return (
    <DashRow
      to={`/agreements/${a.id}`}
      icon={icon}
      tile={tile}
      title={a.cpName}
      sub={
        <>
          <span className="font-mono">{a.id}</span> · {a.institutionCode} · {CP_TYPE_LABELS[a.cpType]}
          {owner && ` · ${a.ownerName}`}
        </>
      }
      badges={
        <>
          <StatusBadge status={a.displayStatus} />
          <AgreementFlags a={a} />
        </>
      }
      pill={pill ?? (left !== undefined ? <Pill tone={left <= 30 ? 'red' : left <= 60 ? 'amber' : 'grey'}>{left < 0 ? 'Expired' : `Expires in ${left} day${left === 1 ? '' : 's'}`}</Pill> : <Pill tone="grey">No end date</Pill>)}
      when={when ?? (a.endDate ? formatShortDate(a.endDate) : '')}
      action={action}
    />
  );
}
