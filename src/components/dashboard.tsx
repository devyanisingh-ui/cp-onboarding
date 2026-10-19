import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui';

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
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export interface WorkflowStep {
  key: string;
  label: string;
  /** Who holds it: "Your move", "With Legal", "Live"… */
  who: string;
  /** The viewer's own step: drawn with the brand gradient. */
  yours: boolean;
  count: number;
  /** A route, or `#section-id` on this page. */
  to: string;
  icon: ReactNode;
  done?: boolean;
  /** Colour of a step held by someone else (Legal amber, Admin purple, BD/CP blue). */
  tone?: StepTone;
}

type StepTone = 'amber' | 'purple' | 'blue' | 'grey';

const STEP_TONES: Record<StepTone | 'you' | 'done', { circle: string; pill: string; bar: string }> = {
  you: {
    circle: 'bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 text-white shadow-[0_8px_20px_-8px_rgb(18_122_153/0.7)] ring-4 ring-primary-100',
    pill: 'bg-gradient-to-r from-primary-600 to-accent-500 text-white',
    bar: 'bg-gradient-to-r from-primary-500 to-accent-500',
  },
  amber: { circle: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', pill: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200', bar: 'bg-amber-400' },
  purple: { circle: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', pill: 'bg-purple-50 text-purple-800 ring-1 ring-inset ring-purple-200', bar: 'bg-purple-400' },
  blue: { circle: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200', pill: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200', bar: 'bg-sky-400' },
  grey: { circle: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200', pill: 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200', bar: 'bg-slate-300' },
  done: { circle: 'bg-green-50 text-green-700 ring-1 ring-green-200', pill: 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-200', bar: 'bg-green-500' },
};

const toneOf = (s: WorkflowStep) => (s.yours ? 'you' : s.done ? 'done' : (s.tone ?? 'grey'));

/**
 * The workflow as a connected stepper: icon circles joined by a line (vertical on phones and tablets,
 * one row from lg up), each with its count, label and who holds it; the viewer's own steps carry the
 * brand gradient. Underneath, a bar shows how the agreements split across the steps.
 */
export function WorkflowStrip({ title, description, steps }: { title: string; description: string; steps: WorkflowStep[] }) {
  const total = steps.reduce((n, s) => n + s.count, 0);
  const yours = steps.filter((s) => s.yours).reduce((n, s) => n + s.count, 0);
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <ol className="px-3 pt-4 sm:px-5 lg:grid lg:grid-cols-[repeat(var(--steps),minmax(0,1fr))] lg:pt-6" style={{ ['--steps' as string]: steps.length }}>
        {steps.map((s, i) => {
          const tone = STEP_TONES[toneOf(s)];
          const quiet = s.yours && s.count === 0;
          return (
            <li key={s.key} className="relative min-w-0 pb-2 lg:pb-0">
              {/* Connector to the next step: down the left on narrow screens, across from lg up. */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-[31px] top-[60px] bottom-0 w-0.5 rounded-full lg:bottom-auto lg:left-[calc(50%+34px)] lg:top-[31px] lg:h-0.5 lg:w-[calc(100%-68px)]',
                    s.yours && steps[i + 1]!.yours ? 'bg-gradient-to-b from-primary-400 to-accent-400 lg:bg-gradient-to-r' : 'bg-line-strong/70',
                  )}
                />
              )}
              <StepLink
                to={s.to}
                className="group relative flex w-full min-w-0 items-start gap-4 rounded-xl p-2 text-left transition-colors hover:bg-[var(--surface-hover)] lg:flex-col lg:items-center lg:gap-3 lg:pb-4 lg:text-center"
              >
                <span
                  className={cn(
                    'relative flex size-12 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:-translate-y-0.5 [&_svg]:size-5',
                    quiet ? 'bg-white text-primary-600 ring-2 ring-primary-200' : tone.circle,
                  )}
                >
                  {s.icon}
                  <span aria-hidden className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-bold tabular-nums text-ink-soft shadow-sm ring-1 ring-line">{i + 1}</span>
                </span>
                <span className="min-w-0 flex-1 lg:flex-none">
                  <span className="flex items-baseline gap-2 lg:flex-col lg:items-center lg:gap-1">
                    <span className="text-2xl font-semibold leading-none tabular-nums text-ink lg:text-[28px]">{s.count}</span>
                    <span className="break-words text-sm font-medium leading-tight text-ink-soft">{s.label}</span>
                  </span>
                  <span className={cn('mt-1.5 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', quiet ? 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200' : tone.pill)}>{s.who}</span>
                </span>
                <ChevronRight className="mt-3 size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600 lg:hidden" aria-hidden />
              </StepLink>
            </li>
          );
        })}
      </ol>
      {/* How the agreements split across the steps. */}
      <div className="border-t border-line/70 px-5 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            <span className="font-semibold text-ink">{total}</span> agreement{total === 1 ? '' : 's'} across the workflow
          </span>
          <span>
            <span className="font-semibold text-primary-700">{yours}</span> waiting on you
          </span>
        </div>
        <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {total > 0 &&
            steps
              .filter((s) => s.count > 0)
              .map((s) => <span key={s.key} title={`${s.label}: ${s.count}`} className={cn('h-full first:rounded-l-full last:rounded-r-full', STEP_TONES[toneOf(s)].bar)} style={{ width: `${(s.count / total) * 100}%` }} />)}
        </div>
      </div>
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
    <Link to={to} className={cn(cls, 'hover:brightness-95')}>
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
    <Link to={to} className="block bg-white/80 px-5 py-3.5 hover:bg-white">
      {body}
    </Link>
  ) : (
    <div className="bg-white/80 px-5 py-3.5">{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-px bg-line/60">{children}</div>;
}
