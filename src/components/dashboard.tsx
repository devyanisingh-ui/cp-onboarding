import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
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
      <CardHeader title={title} description={description} icon={<ArrowRight />} />
      {/* Phones 2 columns, tablets 3, one row from lg up. The gap keeps every step in its own box; the arrows sit in it. */}
      <ol className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4 lg:grid-cols-[repeat(var(--steps),minmax(0,1fr))] lg:gap-5" style={{ ['--steps' as string]: steps.length }}>
        {steps.map((s, i) => {
          const hot = s.yours && s.count > 0;
          return (
            <li key={s.key} className={cn('relative flex min-w-0 items-stretch', steps.length % 2 === 1 && 'max-sm:last:col-span-2')}>
              <StepLink
                to={s.to}
                className={cn(
                  'group flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-left ring-1 transition-colors sm:flex-col sm:items-start sm:gap-2 sm:px-3.5',
                  hot ? 'bg-primary-50 ring-primary-200 hover:bg-primary-100/70' : 'bg-white/40 ring-line/60 hover:bg-[var(--surface-hover)]',
                )}
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset [&_svg]:size-[18px]', hot ? 'bg-white text-primary-700 ring-primary-200' : s.done ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-slate-50 text-slate-500 ring-slate-200')}>
                  {s.icon}
                </span>
                <span className="min-w-0 max-w-full">
                  {/* The label sits under the count and wraps inside the box, so it never runs into the next step. */}
                  <span className="flex flex-col gap-1">
                    <span className="text-2xl font-semibold leading-none tabular-nums text-ink">{s.count}</span>
                    <span className="break-words text-sm font-medium leading-tight text-ink-soft">{s.label}</span>
                  </span>
                  <span className={cn('mt-1 block break-words text-xs', hot ? 'font-semibold text-primary-700' : 'text-subtle')}>{s.who}</span>
                </span>
              </StepLink>
              {/* Centred in the 20px gap to the next step; only when all steps share one row. */}
              {i < steps.length - 1 && <ChevronRight className="pointer-events-none absolute -right-[18px] top-1/2 z-10 hidden size-4 -translate-y-1/2 text-subtle lg:block" aria-hidden />}
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
