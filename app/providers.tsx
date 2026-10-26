'use client';

import { Suspense, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { SessionProvider } from '@/context/SessionContext';
import { ToastProvider } from '@/components/ui';

const noop = () => () => undefined;

/**
 * The data still lives in the browser (localStorage + IndexedDB), so the app renders on the
 * client only: the server sends the page shell and the browser fills it in.
 */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function Providers({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  useEffect(() => {
    // Offline app shell (production only; the dev server serves fresh code on every load).
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') void navigator.serviceWorker.register('/sw.js');
  }, []);
  if (!mounted) return null;
  return (
    <ToastProvider>
      <SessionProvider>
        <Suspense>{children}</Suspense>
      </SessionProvider>
    </ToastProvider>
  );
}
