import type { Institution, RateCard } from '@/types';

/**
 * Extension points for features that come later. Config cannot see agreements, so the agreements
 * feature registers here what rate card and template changes mean for agreements.
 */

export interface RateCardPublishedResult {
  /** Agreements flagged for review because they carry rate deviations. */
  flagged: number;
  /** Active agreements of the institution (they receive addendums when applyMode = addendums). */
  activeAgreementIds: string[];
}

type RateCardPublished = (rc: RateCard, institution: Institution) => Promise<RateCardPublishedResult>;
type TemplateInUse = (templateId: string) => Promise<boolean>;

const rateCardPublished: RateCardPublished[] = [];
const templateInUse: TemplateInUse[] = [];

/** Registers a handler; returns a function that removes it again. */
export function onRateCardPublished(fn: RateCardPublished): () => void {
  rateCardPublished.push(fn);
  return () => void rateCardPublished.splice(rateCardPublished.indexOf(fn), 1);
}

export function onTemplateInUse(fn: TemplateInUse): () => void {
  templateInUse.push(fn);
  return () => void templateInUse.splice(templateInUse.indexOf(fn), 1);
}

export async function runRateCardPublished(rc: RateCard, institution: Institution): Promise<RateCardPublishedResult> {
  const total: RateCardPublishedResult = { flagged: 0, activeAgreementIds: [] };
  for (const fn of rateCardPublished) {
    const r = await fn(rc, institution);
    total.flagged += r.flagged;
    total.activeAgreementIds.push(...r.activeAgreementIds);
  }
  return total;
}

export async function isTemplateInUse(templateId: string): Promise<boolean> {
  for (const fn of templateInUse) if (await fn(templateId)) return true;
  return false;
}
