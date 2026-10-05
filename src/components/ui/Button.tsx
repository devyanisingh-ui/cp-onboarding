import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'link';
type Size = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex items-center justify-center gap-2 font-semibold rounded-md select-none whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

/** Hierarchy: primary (one per view) → secondary → ghost (tertiary) → link. Danger/success for decisions. */
const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),var(--shadow-cta)] hover:from-primary-700 hover:to-primary-800 focus-visible:outline-primary-600',
  secondary:
    'bg-white/80 text-ink border border-line-strong/80 shadow-xs backdrop-blur-sm hover:bg-white hover:border-subtle/70 hover:shadow-[var(--shadow-card)]',
  ghost: 'text-ink-soft hover:bg-[var(--surface-hover)] hover:text-ink active:bg-[var(--surface-selected)]',
  danger:
    'bg-gradient-to-b from-danger-600 to-danger-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_6px_16px_-6px_rgb(220_38_38/0.5)] hover:from-danger-700 focus-visible:outline-danger-600',
  success:
    'bg-gradient-to-b from-success-600 to-success-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_6px_16px_-6px_rgb(21_128_61/0.5)] hover:from-success-700 focus-visible:outline-success-600',
  link: 'hit-area text-primary-700 hover:text-primary-800 hover:underline underline-offset-4 px-0! h-auto! active:translate-y-0',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode; block?: boolean }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  children,
  className,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'hit-area inline-flex items-center justify-center rounded-md text-ink-soft transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-ink active:bg-[var(--surface-selected)] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
