import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

type Tone = 'info' | 'success' | 'warning' | 'error';

const alertTone: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-info-50/85 border-blue-200/80 text-blue-950', icon: <Info className="size-5 text-info-600" aria-hidden /> },
  success: { box: 'bg-success-50/85 border-green-200/80 text-green-950', icon: <CheckCircle2 className="size-5 text-success-600" aria-hidden /> },
  warning: { box: 'bg-warning-50/90 border-amber-200/90 text-amber-950', icon: <AlertTriangle className="size-5 text-warning-600" aria-hidden /> },
  error: { box: 'bg-danger-50/90 border-red-200/90 text-red-950', icon: <AlertCircle className="size-5 text-danger-600" aria-hidden /> },
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'} className={cn('flex animate-fade-in gap-3 rounded-xl border p-4 text-sm backdrop-blur-sm', alertTone[tone].box, className)}>
      <div className="shrink-0">{alertTone[tone].icon}</div>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
        {action && <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      {icon && (
        <div className="relative mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-b from-primary-50 to-primary-100/70 text-primary-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_8px_20px_-10px_rgb(11_100_128/0.4)] ring-1 ring-inset ring-primary-100 [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <Loader2 className="size-4 animate-spin text-primary-600" aria-hidden />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} aria-hidden />;
}

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="surface space-y-4 rounded-xl p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'We couldn’t load this' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const status = (error as { status?: number })?.status;
  const network = status === 503;
  return (
    <div role="alert" className="surface flex flex-col items-center rounded-xl px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-600 ring-1 ring-inset ring-red-100">
        {network ? <WifiOff className="size-7" aria-hidden /> : <AlertCircle className="size-7" aria-hidden />}
      </div>
      <h3 className="text-base font-semibold">{status === 404 ? 'Not found' : status === 403 ? 'No access' : title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && status !== 404 && status !== 403 && (
        <Button variant="secondary" className="mt-5" icon={<RefreshCw className="size-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
