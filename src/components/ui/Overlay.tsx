import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Traps focus, closes on Escape, restores focus to the trigger and locks page scroll. */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelectorAll<HTMLElement>(FOCUSABLE)[1] ?? node;
    setTimeout(() => first?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const f = items[0]!;
        const l = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === f) {
          e.preventDefault();
          l.focus();
        } else if (!e.shiftKey && document.activeElement === l) {
          e.preventDefault();
          f.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useDialog(open, onClose);
  const titleId = useId();
  const descId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink/35 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'surface-raised relative flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-2xl outline-none sm:rounded-2xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-3xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close dialog" size="sm" onClick={onClose} className="-mr-1.5 -mt-1">
            <X className="size-5" />
          </IconButton>
        </div>
        {children && <div className="overflow-y-auto px-6 py-5">{children}</div>}
        {footer && <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-line/70 bg-sunken/40 px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, footer, side = 'right' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; side?: 'right' | 'bottom' }) {
  const ref = useDialog(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'surface-raised absolute flex flex-col outline-none',
          side === 'right' ? 'inset-y-0 right-0 w-full max-w-md animate-slide-in-right' : 'inset-x-0 bottom-0 max-h-[85dvh] animate-slide-up rounded-t-2xl',
        )}
      >
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="safe-bottom border-t border-line/70 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

type MenuItem =
  | { label: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean; active?: boolean }
  | 'divider'
  | { heading: string }
  /** Non-interactive information row (e.g. the signed-in user's roles). */
  | { note: ReactNode; icon?: ReactNode };

/**
 * Accessible dropdown menu (menu button pattern). The panel renders in a portal at the top of
 * the page so it is never clipped and its frosted glass blurs the real page behind it — a
 * backdrop-filter nested inside another blurred surface (like the header) can only blur that
 * surface, which made the page show through.
 */
export function Menu({
  trigger,
  items,
  align = 'right',
  label,
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-controls': string }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    const h = up ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 };
    setPos(align === 'right' ? { ...h, right: Math.max(8, window.innerWidth - r.right) } : { ...h, left: Math.max(8, r.left) });
  }, [align]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) box.current?.querySelector<HTMLElement>('button,[tabindex]')?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !panel.current?.contains(t)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const els = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
      const i = els.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
      if (e.key === 'Tab') close(false);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        els[(i + 1) % els.length]?.focus();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        els[(i - 1 + els.length) % els.length]?.focus();
      }
      if (e.key === 'Home') {
        e.preventDefault();
        els[0]?.focus();
      }
      if (e.key === 'End') {
        e.preventDefault();
        els[els.length - 1]?.focus();
      }
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      clearTimeout(t);
    };
  }, [open, place, close]);

  return (
    <div ref={box} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu', 'aria-controls': id })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label={label}
            style={{ position: 'fixed', ...pos }}
            className={cn(
              'surface-raised z-[70] w-max min-w-60 max-w-[min(20rem,calc(100vw-1rem))] animate-pop-in rounded-xl p-1.5',
              pos.bottom != null ? 'origin-bottom' : align === 'right' ? 'origin-top-right' : 'origin-top-left',
            )}
          >
            {items.map((it, i) =>
              it === 'divider' ? (
                <div key={i} className="-mx-1.5 my-1.5 border-t border-line/70" role="separator" />
              ) : 'heading' in it ? (
                <p key={i} className="truncate px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-subtle">
                  {it.heading}
                </p>
              ) : 'note' in it ? (
                <p key={i} className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-ink-soft">
                  {it.icon && <span className="text-muted [&_svg]:size-4">{it.icon}</span>}
                  <span className="min-w-0">{it.note}</span>
                </p>
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    close(false);
                    it.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors duration-100 hover:bg-[var(--surface-selected)] focus-visible:bg-[var(--surface-selected)] focus-visible:outline-none disabled:opacity-50',
                    it.danger ? 'text-danger-700 hover:bg-danger-50 focus-visible:bg-danger-50' : 'text-ink',
                    it.active && 'bg-[var(--surface-hover)] font-semibold text-primary-700',
                  )}
                >
                  {it.icon && <span className={cn('[&_svg]:size-4', it.danger ? 'text-danger-600' : 'text-muted')}>{it.icon}</span>}
                  {it.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="group/tt relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-64 -translate-x-1/2 rounded-md bg-ink/92 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-pop backdrop-blur transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
