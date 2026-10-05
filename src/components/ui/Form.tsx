import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/* Inputs stay (near-)solid on purpose: glass behind typed text hurts legibility. */
const control =
  'block w-full rounded-md border bg-white/92 text-ink placeholder:text-subtle shadow-[inset_0_1px_2px_rgb(22_28_56/0.04)] transition-[border-color,box-shadow,background-color] duration-150 ease-out focus:outline-none focus:bg-white focus:ring-4 focus:ring-primary-500/15 focus:border-primary-500 disabled:bg-sunken/80 disabled:text-muted disabled:cursor-not-allowed read-only:bg-sunken/60 read-only:focus:ring-0';
const controlOk = 'border-line-strong/90 hover:border-subtle';
const controlErr = 'border-danger-600 bg-danger-50/40 focus:border-danger-600 focus:ring-danger-600/15';

/**
 * Label + control + hint + inline error. Wires up id, aria-invalid and aria-describedby
 * on its child control automatically.
 */
export function Field({
  label,
  hint,
  error,
  required,
  optional,
  children,
  className,
  labelAction,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactElement;
  className?: string;
  labelAction?: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
        invalid: error ? true : undefined,
      })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="text-danger-600 ml-0.5" aria-hidden>
              *
            </span>
          )}
          {optional && <span className="ml-1.5 text-xs font-normal text-muted">(optional)</span>}
        </label>
        {labelAction}
      </div>
      {child}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="flex items-start gap-1 text-xs font-medium text-danger-700" role="alert">
          <AlertCircle className="size-3.5 mt-px shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

type WithInvalid<T> = T & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, WithInvalid<InputHTMLAttributes<HTMLInputElement>> & { prefix?: ReactNode }>(
  function Input({ className, invalid, prefix, ...rest }, ref) {
    if (prefix)
      return (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{prefix}</span>
          <input ref={ref} className={cn(control, invalid ? controlErr : controlOk, 'h-10 pl-9 pr-3 text-sm', className)} {...rest} />
        </div>
      );
    return <input ref={ref} className={cn(control, invalid ? controlErr : controlOk, 'h-10 px-3 text-sm', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, WithInvalid<TextareaHTMLAttributes<HTMLTextAreaElement>>>(function Textarea(
  { className, invalid, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, invalid ? controlErr : controlOk, 'px-3 py-2 text-sm leading-relaxed', className)} {...rest} />;
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode; invalid?: boolean }>(
  function Checkbox({ label, description, className, invalid, id, ...rest }, ref) {
    const auto = useId();
    const cid = id ?? auto;
    return (
      <div className={cn('flex items-start gap-3', className)}>
        <input
          ref={ref}
          id={cid}
          type="checkbox"
          className={cn('mt-0.5 size-[18px] shrink-0 cursor-pointer rounded border-line-strong accent-primary-600', invalid && 'outline-2 outline-danger-600')}
          {...rest}
        />
        <label htmlFor={cid} className="cursor-pointer text-sm leading-snug">
          <span className="font-medium text-ink">{label}</span>
          {description && <span className="mt-0.5 block text-muted">{description}</span>}
        </label>
      </div>
    );
  },
);

export function RadioGroup<T extends string>({
  name,
  value,
  onChange,
  options,
  legend,
  error,
  layout = 'stack',
  required,
}: {
  name: string;
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean; icon?: ReactNode }[];
  legend: ReactNode;
  error?: string;
  layout?: 'stack' | 'cards';
  required?: boolean;
}) {
  const errId = useId();
  return (
    <fieldset aria-describedby={error ? errId : undefined}>
      <legend className="mb-2 text-sm font-medium text-ink">
        {legend}
        {required && <span className="ml-0.5 text-danger-600" aria-hidden>*</span>}
      </legend>
      <div className={cn(layout === 'cards' ? 'grid gap-3 sm:grid-cols-2' : 'flex flex-col gap-2')}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                'relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-[border-color,background-color,box-shadow] duration-150 ease-out',
                checked
                  ? 'border-primary-500 bg-primary-50/80 shadow-[0_0_0_1px_var(--color-primary-500),0_6px_18px_-10px_rgb(11_100_128/0.4)]'
                  : 'border-line bg-white/70 hover:border-primary-200 hover:bg-white',
                o.disabled && 'cursor-not-allowed opacity-55',
                layout === 'stack' && 'p-2.5',
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="mt-0.5 size-4 shrink-0 accent-primary-600"
              />
              {o.icon && <span className="text-primary-700">{o.icon}</span>}
              <span className="text-sm">
                <span className="font-medium text-ink">{o.label}</span>
                {o.description && <span className="mt-0.5 block text-muted">{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errId} role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger-700">
          <AlertCircle className="size-3.5" aria-hidden />
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-sm">
        <label htmlFor={id} className="font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'hit-area inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-primary-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.15)]' : 'bg-line-strong shadow-[inset_0_1px_2px_rgb(22_28_56/0.12)]',
        )}
      >
        <span className={cn('inline-block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(22_28_56/0.25)] transition-transform duration-200 ease-out', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(control, controlOk, 'h-10 pl-9 pr-9 text-sm [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted hover:bg-[var(--surface-hover)] hover:text-ink"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
