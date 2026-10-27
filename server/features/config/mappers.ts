import type { Institution, MasterLists, RateCard, RateExtra, RateRow, RoutingRule, SlaSettings, TemplateContent, TemplateVersion } from '@/types';
import type { Prisma } from '../../generated/prisma/client';

/** Database rows → the app's shapes (src/types.ts), with empty columns left out as the mock does. */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined || o[k] === null) delete o[k];
  return o;
}

export const institutionInclude = { locations: { orderBy: { sortOrder: 'asc' } } } as const;
type InstitutionRow = Prisma.InstitutionGetPayload<{ include: typeof institutionInclude }>;

export function toInstitution(r: InstitutionRow): Institution {
  return compact({
    id: r.id,
    legalName: r.legalName,
    shortCode: r.shortCode,
    type: r.type,
    legalStatus: r.legalStatus,
    registeredAddress: r.registeredAddress,
    city: r.city,
    state: r.state,
    regionId: r.regionId,
    group: r.group ?? undefined,
    jurisdictionCourt: r.jurisdictionCourt,
    arbitrationSeat: r.arbitrationSeat,
    locations: r.locations.map(({ id, name, city }) => ({ id, name, city })),
    signatoryName: r.signatoryName,
    signatoryDesignation: r.signatoryDesignation,
    coordinatorName: r.coordinatorName,
    programmeGroups: r.programmeGroups as string[],
    active: r.active,
  });
}

export function toRoutingRule(r: Prisma.RoutingRuleGetPayload<object>): RoutingRule {
  return { id: r.id, institutionId: r.institutionId, condition: r.condition, approverId: r.approverId, escalateToId: r.escalateToId };
}

export function toSettings(r: Prisma.SettingGetPayload<object>) {
  return { sla: r.sla as unknown as SlaSettings, allowedDomains: r.allowedDomains as string[], masterLists: r.masterLists as unknown as MasterLists, lastDigestDate: r.lastDigestDate ?? undefined };
}

export function toRateCard(r: Prisma.RateCardGetPayload<object>): RateCard {
  return compact({
    id: r.id,
    institutionId: r.institutionId,
    version: r.version,
    effectiveFrom: r.effectiveFrom,
    status: r.status,
    applyMode: r.applyMode,
    rows: r.rows as unknown as RateRow[],
    extras: r.extras as unknown as RateExtra[],
    notes: r.notes ?? undefined,
    createdById: r.createdById,
    createdAt: r.createdAt.toISOString(),
    approvedById: r.approvedById ?? undefined,
    approvedAt: iso(r.approvedAt),
    rejectComment: r.rejectComment ?? undefined,
    publishedById: r.publishedById ?? undefined,
    publishedAt: iso(r.publishedAt),
    affectedAgreementIds: (r.affectedAgreementIds as string[] | null) ?? undefined,
  });
}

export function toTemplate(r: Prisma.TemplateVersionGetPayload<object>): TemplateVersion {
  const t = compact({
    id: r.id,
    cpType: r.cpType,
    version: r.version,
    fileName: r.fileName,
    blobKey: r.blobKey ?? undefined,
    effectiveFrom: r.effectiveFrom,
    status: r.status,
    changeNote: r.changeNote,
    uploadedById: r.uploadedById,
    uploadedAt: r.uploadedAt.toISOString(),
    approvedById: r.approvedById ?? undefined,
    approvedAt: iso(r.approvedAt),
    rejectComment: r.rejectComment ?? undefined,
    publishedById: r.publishedById ?? undefined,
    publishedAt: iso(r.publishedAt),
    content: (r.content as unknown as TemplateContent | null) ?? undefined,
    sourceDocumentId: r.sourceDocumentId ?? undefined,
  });
  // null is meaningful here (the version applies to all institutions), so it is set after compact().
  return { ...t, institutionId: r.institutionId } as TemplateVersion;
}

/** JSON columns take plain data. */
export const json = (v: unknown) => v as Prisma.InputJsonValue;
