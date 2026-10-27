import type { Database } from '@/types';
import type { Tx } from '../../platform/context';
import { json } from './mappers';

/**
 * Loads the prototype's configuration (src/data/seed.ts) into MySQL: regions, institutions and
 * campuses, staff and their roles and institutions, routing, settings, rate cards and templates.
 * Used by `prisma db seed` and by the server tests.
 */
export async function seedConfig(tx: Tx, seed: Database): Promise<void> {
  await tx.region.createMany({ data: seed.regions.map(({ id, name }) => ({ id, name })), skipDuplicates: true });
  for (const i of seed.institutions) {
    const { locations, programmeGroups, group, ...rest } = i;
    await tx.institution.upsert({ where: { id: i.id }, create: { ...rest, group: group ?? null, programmeGroups: json(programmeGroups) }, update: {} });
    for (const [n, l] of locations.entries()) await tx.location.upsert({ where: { id: l.id }, create: { id: l.id, institutionId: i.id, name: l.name, city: l.city, sortOrder: n }, update: {} });
  }
  for (const u of seed.users) {
    const data = { name: u.name, email: u.email, designation: u.designation, regionId: u.regionId, managerId: u.managerId ?? null, active: u.active };
    await tx.user.upsert({ where: { id: u.id }, create: { id: u.id, ...data }, update: data });
    await tx.userRole.createMany({ data: u.roles.map((role) => ({ userId: u.id, role })), skipDuplicates: true });
    await tx.userInstitution.createMany({ data: u.institutionIds.map((institutionId) => ({ userId: u.id, institutionId })), skipDuplicates: true });
  }
  await tx.routingRule.createMany({ data: seed.routing, skipDuplicates: true });
  await tx.setting.upsert({
    where: { id: 1 },
    create: { id: 1, sla: json(seed.settings.sla), allowedDomains: json(seed.settings.allowedDomains), masterLists: json(seed.masterLists), lastDigestDate: seed.settings.lastDigestDate ?? null },
    update: {},
  });
  for (const rc of seed.rateCards) {
    const { rows, extras, affectedAgreementIds, createdAt, approvedAt, publishedAt, ...rest } = rc;
    await tx.rateCard.upsert({
      where: { id: rc.id },
      create: { ...rest, rows: json(rows), extras: json(extras), affectedAgreementIds: affectedAgreementIds ? json(affectedAgreementIds) : undefined, createdAt: new Date(createdAt), approvedAt: approvedAt ? new Date(approvedAt) : null, publishedAt: publishedAt ? new Date(publishedAt) : null },
      update: {},
    });
  }
  for (const t of seed.templates) {
    const { content, uploadedAt, approvedAt, publishedAt, ...rest } = t;
    await tx.templateVersion.upsert({
      where: { id: t.id },
      create: { ...rest, content: content ? json(content) : undefined, uploadedAt: new Date(uploadedAt), approvedAt: approvedAt ? new Date(approvedAt) : null, publishedAt: publishedAt ? new Date(publishedAt) : null },
      update: {},
    });
  }
  // Readable IDs continue after the seeded ones.
  for (const [key, value] of Object.entries(seed.counters)) await tx.counter.upsert({ where: { key }, create: { key, value }, update: {} });
}
