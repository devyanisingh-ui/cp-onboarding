import { cn } from '@/lib/cn';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('size-8', className)} aria-hidden>
      <rect width="40" height="40" rx="10" fill="var(--color-primary-600)" />
      <path d="M12 20.5a8 8 0 0 1 13.7-5.6l-3.4 3.2a3.4 3.4 0 1 0 0 4.8l3.4 3.2A8 8 0 0 1 12 20.5Z" fill="#fff" />
      <circle cx="28.5" cy="26.5" r="3" fill="#fbbf24" />
    </svg>
  );
}

export function BrandName({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-ink">CP Onboarding</span>
          <span className="block text-2xs font-medium uppercase tracking-wider text-muted">Apeejay Education</span>
        </span>
      )}
    </span>
  );
}
