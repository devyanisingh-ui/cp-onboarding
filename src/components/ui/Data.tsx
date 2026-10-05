import { useId, useRef, type KeyboardEvent, type ReactNode, type ThHTMLAttributes, type TdHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { STATUS_META, TONE_CLASSES, type StatusTone } from '@/lib/status';
import type { DisplayStatus } from '@/types';

// ---------- Card ----------

/** Default content container: glass level 2. `interactive` adds a hover lift for clickable cards. */
export function Card({ children, className, interactive, as: As = 'section', ...rest }: { children: ReactNode; className?: string; interactive?: boolean; as?: 'section' | 'div' | 'article' } & Record<string, unknown>) {
  return (
    <As className={cn('surface min-w-0 rounded-xl', interactive && 'surface-interactive', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, description, action, className, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line/70 px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100 [&_svg]:size-4">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-8">{title}</h2>
          {description && <p className="-mt-1 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

// ---------- Badges ----------

export function Badge({ tone = 'grey', children, className, icon }: { tone?: StatusTone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-4 ring-1 ring-inset', TONE_CLASSES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} className={className}>
      <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {m.label}
    </Badge>
  );
}

// ---------- Table ----------

export function Table({ children, caption, className }: { children: ReactNode; caption?: string; className?: string }) {
  return (
    <div className={cn('scroll-shadows relative overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function TH({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn('border-b border-line/80 bg-sunken/50 px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-muted first:pl-5 last:pr-5', className)} {...rest}>
      {children}
    </th>
  );
}

export function TD({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('border-b border-line/70 px-4 py-3.5 align-middle first:pl-5 last:pr-5', className)} {...rest}>
      {children}
    </td>
  );
}

export function TR({ children, className, onClick, href }: { children: ReactNode; className?: string; onClick?: () => void; href?: string }) {
  return (
    <tr className={cn('group transition-colors duration-150 last:[&>td]:border-b-0', (onClick || href) && 'cursor-pointer hover:bg-[var(--surface-hover)]', className)} onClick={onClick}>
      {children}
    </tr>
  );
}

// ---------- Description list ----------

export function DL({ items, cols = 2 }: { items: { label: string; value: ReactNode; full?: boolean }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map((it) => (
        <div key={it.label} className={cn('min-w-0', it.full && 'sm:col-span-full')}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{it.label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{it.value || <span className="text-subtle">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Tabs (WAI-ARIA tabs with arrow-key navigation) ----------

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = tabs.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next]!.id);
  };
  return (
    <div role="tablist" aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-line/80 [scrollbar-width:none]">
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${base}-${t.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2.5 text-sm transition-colors duration-150',
              selected ? 'border-primary-600 font-semibold text-primary-700' : 'border-transparent font-medium text-muted hover:border-line-strong hover:bg-[var(--surface-hover)] hover:text-ink',
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cn('min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums', selected ? 'bg-primary-600 text-white' : 'bg-ink/[0.06] text-muted')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Breadcrumbs ----------

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1.5">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-subtle" aria-hidden />}
            {it.to ? (
              <Link to={it.to} className="hit-area rounded transition-colors hover:text-primary-700">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink-soft">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ---------- Pagination ----------

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line/70 px-5 py-3 text-sm">
      <p className="text-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button type="button" className="hit-area rounded-md border border-line bg-white/70 p-1.5 text-ink-soft transition-colors hover:border-line-strong hover:bg-white disabled:pointer-events-none disabled:opacity-40" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 text-ink-soft">
          Page {page} of {pages}
        </span>
        <button type="button" className="hit-area rounded-md border border-line bg-white/70 p-1.5 text-ink-soft transition-colors hover:border-line-strong hover:bg-white disabled:pointer-events-none disabled:opacity-40" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

// ---------- Avatar ----------

const AVATAR_TONES = ['bg-primary-100 text-primary-800', 'bg-amber-100 text-amber-900', 'bg-blue-100 text-blue-900', 'bg-purple-100 text-purple-900', 'bg-rose-100 text-rose-900'];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const tone = AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', tone, size === 'sm' ? 'size-7 text-[11px]' : size === 'lg' ? 'size-12 text-base' : 'size-9 text-xs')}
    >
      {initials(name)}
    </span>
  );
}

// ---------- Progress steps (wizard) ----------

export function ProgressSteps({ steps, current, onStepClick, maxReached }: { steps: string[]; current: number; onStepClick?: (i: number) => void; maxReached: number }) {
  return (
    <nav aria-label="Progress">
      <div className="mb-3 flex items-center justify-between text-sm sm:hidden">
        <span className="font-semibold text-ink">
          Step {current + 1} of {steps.length}: {steps[current]}
        </span>
        <span className="text-muted">{Math.round(((current + 1) / steps.length) * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07] sm:hidden" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current + 1}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-[width] duration-300 ease-out" style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
      </div>
      <ol className="hidden items-center sm:flex">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = onStepClick && i <= maxReached && i !== current;
          return (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepClick?.(i)}
                aria-current={active ? 'step' : undefined}
                className={cn('group flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2.5 text-left transition-colors', reachable && 'cursor-pointer hover:bg-[var(--surface-hover)]')}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-200',
                    done && 'bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-[var(--shadow-cta)]',
                    active && 'bg-white text-primary-700 ring-2 ring-primary-600 shadow-[0_0_0_5px_rgb(11_100_128/0.12)]',
                    !done && !active && 'bg-white/80 text-subtle ring-1 ring-line-strong',
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className={cn('hidden text-sm lg:inline', active ? 'font-semibold text-ink' : done ? 'text-ink-soft' : 'text-muted')}>{s}</span>
                <span className="sr-only">{done ? '(completed)' : active ? '(current)' : ''}</span>
              </button>
              {i < steps.length - 1 && <span className={cn('mx-2 h-0.5 flex-1 rounded-full transition-colors duration-300', i < current ? 'bg-primary-500' : 'bg-line-strong/60')} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StatTile({ label, value, icon, tone = 'accent', to, hint, hintTone = 'muted' }: { label: string; value: ReactNode; icon: ReactNode; tone?: StatusTone; to?: string; hint?: string; hintTone?: 'muted' | 'danger' }) {
  const inner = (
    <>
      <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset [&_svg]:size-5', TONE_CLASSES[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-ink">{value}</p>
        <p className="mt-1.5 text-sm leading-snug text-muted">{label}</p>
        {hint && <p className={cn('mt-0.5 text-xs font-medium', hintTone === 'danger' ? 'text-danger-700' : 'text-subtle')}>{hint}</p>}
      </div>
      {to && <ChevronRight className="hidden size-4 shrink-0 text-subtle opacity-0 sm:block transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />}
    </>
  );
  const cls = 'surface group flex flex-col items-start gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:gap-4';
  return to ? (
    <Link to={to} className={cn(cls, 'surface-interactive')}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
