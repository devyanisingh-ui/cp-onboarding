import { useEffect, useRef, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · CP Onboarding` : 'CP Onboarding · Apeejay';
  }, [title]);
}

/** Calls onWarn shortly before, and onIdle after, `ms` of no user activity. */
export function useIdleTimer(ms: number, warnBeforeMs: number, onWarn: () => void, onIdle: () => void, enabled: boolean) {
  const cb = useRef({ onWarn, onIdle });
  cb.current = { onWarn, onIdle };
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    let warned = false;
    const bump = () => {
      last = Date.now();
      warned = false;
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = setInterval(() => {
      const idle = Date.now() - last;
      if (idle >= ms) cb.current.onIdle();
      else if (idle >= ms - warnBeforeMs && !warned) {
        warned = true;
        cb.current.onWarn();
      }
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(iv);
    };
  }, [ms, warnBeforeMs, enabled]);
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** True once the page has scrolled past `threshold` px (passive listener, updates only on change). */
export function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return scrolled;
}
