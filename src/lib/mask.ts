/** PRD §8 UI rules: PAN shows as ABCDE••••F, bank account as ••••1234. */
export function maskPan(pan?: string): string {
  if (!pan) return '—';
  if (pan.length !== 10) return '••••••••••';
  return `${pan.slice(0, 5)}••••${pan.slice(9)}`;
}

export function maskAccount(acc?: string): string {
  if (!acc) return '—';
  return `••••${acc.slice(-4)}`;
}

export function maskAadhaar(last4?: string): string {
  if (!last4) return '—';
  return `•••• •••• ${last4}`;
}

/** GSTIN embeds the PAN in characters 3–12, so it is masked the same way. */
export function maskGstin(g?: string): string {
  if (!g) return '—';
  return `${g.slice(0, 7)}••••${g.slice(11)}`;
}

export function isMasked(v?: string): boolean {
  return !!v && v.includes('•');
}
