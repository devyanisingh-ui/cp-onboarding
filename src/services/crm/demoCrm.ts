import type { CrmConnector, CrmLead } from './connector';
import { shiftDays, today } from '@/lib/dates';

/**
 * Stands in for the real CRM until it is chosen and its API credentials are available. It behaves
 * like an external system: it knows partner codes and institution codes (not CP Onboarding's
 * records), produces the same leads every time, and moves them along (applied, admitted, dropped)
 * as days pass. One lead carries a partner code CP Onboarding does not know, as real CRMs do.
 */

/** Typical first-year fees by programme family (INR), for the demo's revenue. */
const PROGRAMMES: [string, number][] = [
  ['B.Tech (CSE)', 185000],
  ['B.Tech (ECE)', 175000],
  ['BBA', 140000],
  ['MBA', 220000],
  ['BA LLB', 150000],
  ['B.Des', 165000],
  ['B.Pharm', 125000],
  ['B.Sc. (Hons.)', 95000],
];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const academicYear = (iso: string) => {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

export function demoCrm(partners: { code: string; institutionCodes: string[] }[]): CrmConnector {
  return {
    id: 'demo',
    label: 'Demo CRM (sample data)',
    async fetchLeads() {
      const t = today();
      const leads: CrmLead[] = [];
      for (const p of partners) {
        for (const inst of p.institutionCodes) {
          const seed = hash(`${p.code}:${inst}`);
          const count = 4 + (seed % 9);
          for (let i = 0; i < count; i++) {
            const r = hash(`${p.code}:${inst}:${i}`);
            const created = shiftDays(t, -(5 + (r % 200)));
            const age = -Math.round((Date.parse(created) - Date.parse(t)) / 86_400_000);
            const [programme, fee] = PROGRAMMES[r % PROGRAMMES.length]!;
            // Older leads have had time to move on; about half apply, a third of those are admitted.
            const lead: CrmLead = {
              crmId: `LSQ-${inst}-${(r % 90000) + 10000}`,
              partnerCode: p.code,
              institutionCode: inst,
              programme,
              academicYear: academicYear(created),
              status: 'lead',
              createdOn: created,
              updatedAt: created,
            };
            if (age > 10 && r % 10 < 6) {
              lead.status = 'applied';
              lead.appliedOn = shiftDays(created, 7);
              lead.updatedAt = lead.appliedOn;
              if (age > 25 && r % 10 < 3) {
                lead.status = 'admitted';
                lead.admittedOn = shiftDays(created, 21);
                lead.feeInr = fee;
                lead.updatedAt = lead.admittedOn;
              } else if (age > 40 && r % 10 === 5) {
                lead.status = 'dropped';
                lead.droppedOn = shiftDays(created, 30);
                lead.updatedAt = lead.droppedOn;
              }
            }
            leads.push(lead);
          }
        }
      }
      // A lead from a partner the CRM knows but CP Onboarding doesn't.
      leads.push({ crmId: 'LSQ-ASU-99999', partnerCode: 'PARTNER-UNKNOWN', institutionCode: 'ASU', programme: 'BBA', academicYear: academicYear(t), status: 'lead', createdOn: shiftDays(t, -3), updatedAt: shiftDays(t, -3) });
      return leads;
    },
  };
}
