/**
 * How the app keeps track of the current screen, based on where it was opened:
 *  - browser: normal web server (dev / production build) — real paths like /agreements/…
 *  - hash:    single-file mobile build, or any file opened from storage — #/agreements/…
 *  - memory:  pages without a usable address (preview panes, in-app viewers, sandboxed frames:
 *             about:srcdoc, blob:, data:). The router can't build URLs from those, so the
 *             current screen is held in memory instead.
 */
export type RouterMode = 'browser' | 'hash' | 'memory';

function detect(): RouterMode {
  if (typeof window === 'undefined') return 'browser';
  const { protocol, href } = window.location;
  let usable = /^(https?|file|content):$/.test(protocol);
  if (usable) {
    try {
      new URL('/', href);
    } catch {
      usable = false;
    }
  }
  if (!usable) return 'memory';
  if (import.meta.env.MODE === 'mobile' || protocol === 'file:' || protocol === 'content:') return 'hash';
  return 'browser';
}

export const ROUTER_MODE: RouterMode = detect();

/** True when routes don't live in real URL paths (hash or memory routing). */
export const USE_HASH_ROUTES = ROUTER_MODE !== 'browser';
