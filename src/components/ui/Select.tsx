import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Custom dropdown with the same look as the app's menus (glass level 3, rounded items,
 * check on the selected option). Drop-in for a native <select>: it takes the same props and
 * <option> children, and keeps a hidden native select so forms (react-hook-form `register`,
 * `name`, change events) keep working unchanged.
 */

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
    if (el.type === 'option') {
      const label = textOf(el.props.children);
      out.push({ value: el.props.value != null ? String(el.props.value) : label, label, disabled: !!el.props.disabled });
    } else if (el.props.children) out.push(...readOptions(el.props.children));
  });
  return out;
}

const trigger =
  'flex w-full items-center gap-2 rounded-md border bg-white/92 text-left text-ink shadow-[inset_0_1px_2px_rgb(22_28_56/0.04)] transition-[border-color,box-shadow,background-color] duration-150 ease-out focus:outline-none focus-visible:outline-none focus:bg-white focus:ring-4 focus:ring-primary-500/15 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-sunken/80 disabled:text-muted';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'prefix'> {
  invalid?: boolean;
  /** Icon or text shown before the value (e.g. the header's building icon). */
  prefix?: ReactNode;
  size?: 'sm' | 'md';
  /** Classes for the trigger's wrapper (width etc.). */
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    className,
    wrapperClassName,
    invalid,
    children,
    value,
    defaultValue,
    onChange,
    onBlur,
    disabled,
    id,
    prefix,
    size = 'md',
    'aria-label': ariaLabel,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
    ...rest
  },
  ref,
) {
  const options = readOptions(children);
  const autoId = useId();
  const buttonId = id ?? `${autoId}-btn`;
  const listId = `${autoId}-list`;
  const native = useRef<HTMLSelectElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [inner, setInner] = useState<string>(defaultValue != null ? String(defaultValue) : (options[0]?.value ?? ''));
  const current = value != null ? String(value) : inner;
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === current));
  const selected = options[selectedIndex];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean; maxH: number } | null>(null);
  const typed = useRef({ text: '', at: 0 });

  const setRefs = (el: HTMLSelectElement | null) => {
    native.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  // Uncontrolled use (e.g. react-hook-form): pick up the value the form wrote into the native select.
  useLayoutEffect(() => {
    if (value == null && native.current && native.current.value !== inner) setInner(native.current.value);
  });

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const want = Math.min(288, options.length * 38 + 12);
    const up = below < want && above > below;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 180), up, maxH: Math.max(140, Math.min(288, up ? above : below)) });
  }, [options.length]);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex);
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !list.current?.contains(t)) close(false);
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    const t = setTimeout(() => list.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      clearTimeout(t);
    };
  }, [open, place]);

  // Keep the list inside the viewport once its natural width is known.
  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) el.style.left = `${Math.max(8, window.innerWidth - 8 - r.width)}px`;
  }, [open, pos]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  /** Writes the value into the hidden native select and fires a real change event. */
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    const el = native.current;
    if (el && el.value !== o.value) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, o.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setInner(o.value);
    close();
  };

  const step = (from: number, dir: 1 | -1) => {
    for (let n = 1; n <= options.length; n++) {
      const i = (from + dir * n + options.length) % options.length;
      if (!options[i]!.disabled) return i;
    }
    return from;
  };

  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 600 ? key : typed.current.text + key, at: now };
    const q = typed.current.text.toLowerCase();
    const start = open ? active : selectedIndex;
    const order = [...options.keys()].map((k) => (start + 1 + k) % options.length);
    const hit = order.find((i) => !options[i]!.disabled && options[i]!.label.toLowerCase().startsWith(q));
    return hit;
  };

  const onButtonKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openList();
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const hit = typeahead(e.key);
      if (hit != null) choose(hit);
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => step(a, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => step(a, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(step(-1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActive(step(options.length, -1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation(); // don't close an enclosing dialog
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const hit = typeahead(e.key);
          if (hit != null) setActive(hit);
        }
    }
  };

  return (
    <div className={cn('relative', wrapperClassName)}>
      {/* Button first: a wrapping <label> names its first labellable element. */}
      <button
        ref={button}
        id={buttonId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
        className={cn(
          trigger,
          invalid ? 'border-danger-600 bg-danger-50/40 focus:border-danger-600 focus:ring-danger-600/15' : 'border-line-strong/90 hover:border-subtle',
          open && 'border-primary-500 bg-white ring-4 ring-primary-500/15',
          size === 'sm' ? 'h-9 rounded-lg px-2.5 text-[13px]' : 'h-10 px-3 text-sm',
          className,
        )}
      >
        {prefix && <span className="flex shrink-0 text-muted [&_svg]:size-4">{prefix}</span>}
        <span className={cn('min-w-0 flex-1 truncate', size === 'sm' && 'font-medium')}>{selected?.label ?? ''}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180 text-primary-600')} aria-hidden />
      </button>
      {/* Hidden native select: carries name/value for forms and fires change events. */}
      <select
        ref={setRefs}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        value={current}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          setInner(e.target.value);
          onChange?.(e);
        }}
        onBlur={onBlur}
        // Forms focus the first invalid field via its ref (this element); hand focus to the visible trigger.
        onFocus={() => button.current?.focus()}
        {...rest}
      >
        {children}
      </select>
      {open &&
        pos &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={buttonId}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKey}
            style={{
              position: 'fixed',
              left: pos.left,
              minWidth: pos.width,
              maxWidth: Math.min(352, window.innerWidth - 16),
              maxHeight: pos.maxH,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
            className={cn('surface-raised z-[70] w-max overflow-y-auto rounded-xl p-1.5 outline-none', pos.up ? 'origin-bottom' : 'origin-top', 'animate-pop-in')}
          >
            {options.map((o, i) => {
              const isSel = o.value === current;
              return (
                <div
                  key={`${o.value}-${i}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-100',
                    i === active && !o.disabled && 'bg-[var(--surface-selected)]',
                    isSel ? 'font-semibold text-primary-700' : 'text-ink',
                    o.disabled && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {isSel && <Check className="size-4 shrink-0 text-primary-600" aria-hidden />}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
});
