import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = Date.now() + Math.random();
      setItems((l) => [...l.slice(-3), { id, tone, title, body }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({ success: (t, b) => push('success', t, b), error: (t, b) => push('error', t, b), info: (t, b) => push('info', t, b) }),
    [push],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'surface-raised pointer-events-auto relative flex w-full max-w-sm animate-toast-in items-start gap-3 overflow-hidden rounded-xl p-3.5 pl-4',
              "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
              t.tone === 'success' && 'before:bg-success-600',
              t.tone === 'error' && 'before:bg-danger-600',
              t.tone === 'info' && 'before:bg-primary-600',
            )}
          >
            {t.tone === 'success' && <CheckCircle2 className="size-5 shrink-0 text-success-600" aria-hidden />}
            {t.tone === 'error' && <AlertCircle className="size-5 shrink-0 text-danger-600" aria-hidden />}
            {t.tone === 'info' && <Info className="size-5 shrink-0 text-primary-600" aria-hidden />}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-muted">{t.body}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="hit-area rounded p-0.5 text-subtle hover:bg-[var(--surface-hover)] hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside ToastProvider');
  return c;
}
