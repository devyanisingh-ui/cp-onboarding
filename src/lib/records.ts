/**
 * Rules for the records every feature writes (audit trail, notifications). Pure, so the browser
 * mock and the server share one copy.
 */

/** Returns only the keys that changed, for before/after audit values. */
export function diff<T extends object>(before: T, after: Partial<T>, redact: string[] = []) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after) as (keyof T & string)[]) {
    const bv = before[k];
    const av = after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = redact.includes(k) ? '[redacted]' : bv;
      a[k] = redact.includes(k) ? '[redacted]' : av;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

/** PRD §9 content rule: only CP name, agreement ID, action and link. Enforced here. */
const SENSITIVE = [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/, /\b\d{9,18}\b/, /\b\d{4}\s\d{4}\s\d{4}\b/, /₹|INR\s?\d/];

export function containsSensitive(text: string): boolean {
  return SENSITIVE.some((re) => re.test(text));
}

/** Browser and OS from a user-agent string, for the audit trail's device column. */
export function deviceFrom(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : 'Linux';
  return `${browser} · ${os}`;
}
