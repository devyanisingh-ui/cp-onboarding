import type { Institution, MasterLists, Role, RoutingRule, SlaSettings, User } from '@/types';
import { emailSchema } from '@/lib/validation';
import { conflict, invalid } from '@/services/errors';
import { audit, diff } from '../../platform/audit';
import { ctx, db } from '../../platform/context';
import { nextId } from '../../platform/ids';
import { assertCan } from '../../platform/permissions';
import { loadUser, toUser, userInclude } from '../../platform/users';
import { institutionInclude, json, toInstitution, toRoutingRule, toSettings } from './mappers';

// ---------------- Shared helpers for other features ----------------

/** The settings row (SLAs, master lists, allowed domains). Created by the seed or the first deploy. */
export async function settings() {
  const row = await db().setting.findUnique({ where: { id: 1 } });
  if (!row) throw new Error('Settings are missing. Run `npx prisma db seed` (or the production set-up) first.');
  return toSettings(row);
}

/** First active user with the role, preferring one who works for the institution (same as the mock). */
export async function firstUserWithRole(role: Role, institutionId?: string): Promise<User | undefined> {
  const rows = await db().user.findMany({ where: { active: true, roles: { some: { role } } }, include: userInclude, orderBy: { id: 'asc' } });
  const users = rows.map(toUser);
  return (institutionId && users.find((u) => u.institutionIds.includes(institutionId))) || users[0];
}

/** The approval rule for an institution and condition, falling back to any rule for it (same as the mock). */
export async function routeFor(institutionId: string, nonStandard: boolean): Promise<RoutingRule | undefined> {
  const rules = await db().routingRule.findMany({ where: { institutionId } });
  const rule = rules.find((r) => r.condition === (nonStandard ? 'non_standard' : 'standard')) ?? rules[0];
  return rule ? toRoutingRule(rule) : undefined;
}

export async function getInstitution(id: string): Promise<Institution | undefined> {
  const row = await db().institution.findUnique({ where: { id }, include: institutionInclude });
  return row ? toInstitution(row) : undefined;
}

// ---------------- Lookups (any signed-in user) ----------------

export async function lookups() {
  ctx();
  const [regions, institutions, users, s] = await Promise.all([
    db().region.findMany({ orderBy: { id: 'asc' } }),
    db().institution.findMany({ include: institutionInclude, orderBy: { shortCode: 'asc' } }),
    db().user.findMany({ include: userInclude, orderBy: { id: 'asc' } }),
    settings(),
  ]);
  return {
    regions: regions.map(({ id, name }) => ({ id, name })),
    institutions: institutions.map(toInstitution),
    users: users.map(toUser),
    masterLists: s.masterLists,
    sla: s.sla,
  };
}

// ---------------- Institutions ----------------

export async function saveInstitution(input: Institution): Promise<Institution> {
  const user = ctx();
  assertCan(user, 'config.manage');
  if (!input.legalName.trim() || !input.shortCode.trim()) throw invalid('Legal name and short code are required.');
  if (!/^[A-Z]{2,6}$/.test(input.shortCode)) throw invalid('Short code must be 2–6 capital letters.', { shortCode: '2–6 capital letters' });
  if (!input.locations.length) throw invalid('Add at least one location or campus.');
  const clash = await db().institution.findUnique({ where: { shortCode: input.shortCode } });
  if (clash && clash.id !== input.id) throw conflict('That short code is already used.');
  const existing = input.id ? await getInstitution(input.id) : undefined;
  const id = existing?.id ?? `inst-${input.shortCode.toLowerCase()}`;
  const data = {
    legalName: input.legalName,
    shortCode: input.shortCode,
    type: input.type,
    legalStatus: input.legalStatus,
    registeredAddress: input.registeredAddress,
    city: input.city,
    state: input.state,
    regionId: input.regionId,
    group: input.group ?? null,
    jurisdictionCourt: input.jurisdictionCourt,
    arbitrationSeat: input.arbitrationSeat,
    signatoryName: input.signatoryName,
    signatoryDesignation: input.signatoryDesignation,
    coordinatorName: input.coordinatorName,
    programmeGroups: json(input.programmeGroups),
    active: input.active,
  };
  if (!(await db().region.findUnique({ where: { id: input.regionId } }))) throw invalid('Choose a region.', { regionId: 'Required' });
  if (existing) await db().institution.update({ where: { id }, data });
  else await db().institution.create({ data: { id, ...data } });
  // Campuses: keep IDs (agreements point at them), add new ones, drop removed ones.
  const keep = input.locations.filter((l) => l.id).map((l) => l.id);
  await db().location.deleteMany({ where: { institutionId: id, id: { notIn: keep } } });
  for (const [i, l] of input.locations.entries()) {
    const locId = l.id || (await nextId('location', `loc-${input.shortCode.toLowerCase()}-`));
    await db().location.upsert({ where: { id: locId }, create: { id: locId, institutionId: id, name: l.name, city: l.city, sortOrder: i }, update: { name: l.name, city: l.city, sortOrder: i } });
  }
  const saved = (await getInstitution(id))!;
  if (existing) {
    const ch = diff(existing, saved);
    await audit(user, 'config_change', 'institution', id, `Updated institution ${saved.shortCode} (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
  } else {
    await audit(user, 'config_change', 'institution', id, `Added institution ${saved.shortCode}`, undefined, { legalName: saved.legalName });
  }
  return saved;
}

// ---------------- Users ----------------

export async function saveUser(input: User): Promise<User> {
  const actor = ctx();
  assertCan(actor, 'config.manage');
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw invalid('Enter a valid email.', { email: 'Invalid email' });
  const domain = input.email.split('@')[1]!.toLowerCase();
  const { allowedDomains } = await settings();
  if (!allowedDomains.some((x) => domain === x || domain.endsWith(`.${x}`))) throw invalid(`${domain} is not an allowed sign-in domain.`, { email: 'Domain not allowed' });
  if (!input.roles.length) throw invalid('Assign at least one role.', { roles: 'Required' });
  if (!input.institutionIds.length) throw invalid('Assign at least one institution.', { institutionIds: 'Required' });
  const known = await db().institution.count({ where: { id: { in: input.institutionIds } } });
  if (known !== new Set(input.institutionIds).size) throw invalid('One of the institutions no longer exists.', { institutionIds: 'Unknown institution' });
  const sameEmail = await db().user.findUnique({ where: { email: input.email } });
  if (sameEmail && sameEmail.id !== input.id) throw conflict('A user with this email already exists.');
  const existing = input.id ? await loadUser(input.id) : null;
  if (existing && existing.id === actor.id && !input.roles.includes('admin')) throw conflict('You cannot remove your own Admin role.');
  const id = existing?.id ?? (await nextId('user', 'u-'));
  const data = { name: input.name, email: input.email, designation: input.designation, regionId: input.regionId, managerId: input.managerId ?? null, active: input.active };
  if (existing) await db().user.update({ where: { id }, data });
  else await db().user.create({ data: { id, ...data } });
  await db().userRole.deleteMany({ where: { userId: id } });
  await db().userRole.createMany({ data: [...new Set(input.roles)].map((role) => ({ userId: id, role })) });
  await db().userInstitution.deleteMany({ where: { userId: id } });
  await db().userInstitution.createMany({ data: [...new Set(input.institutionIds)].map((institutionId) => ({ userId: id, institutionId })) });
  const saved = (await loadUser(id))!;
  if (existing) {
    const ch = diff(existing, saved);
    await audit(actor, 'config_change', 'user', id, `Updated user ${saved.name} (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
  } else {
    await audit(actor, 'config_change', 'user', id, `Added user ${saved.name}`, undefined, { roles: saved.roles, institutionIds: saved.institutionIds });
  }
  return saved;
}

// ---------------- Routing, SLAs, lists, domains ----------------

export async function listRouting(): Promise<RoutingRule[]> {
  assertCan(ctx(), 'config.view');
  return (await db().routingRule.findMany({ orderBy: [{ institutionId: 'asc' }, { condition: 'asc' }] })).map(toRoutingRule);
}

export async function saveRouting(rules: RoutingRule[]): Promise<void> {
  const user = ctx();
  assertCan(user, 'config.manage');
  const seen = new Set<string>();
  for (const r of rules) {
    if (!r.approverId || !r.escalateToId) throw invalid('Every rule needs an approver and an escalation contact.');
    if (r.approverId === r.escalateToId) throw invalid('Escalation must go to a different person than the approver.');
    const key = `${r.institutionId}:${r.condition}`;
    if (seen.has(key)) throw invalid('Each institution can have only one rule per condition.');
    seen.add(key);
  }
  const people = new Set(rules.flatMap((r) => [r.approverId, r.escalateToId]));
  if ((await db().user.count({ where: { id: { in: [...people] } } })) !== people.size) throw invalid('One of the chosen people no longer exists.');
  const before = await listRouting();
  const saved: RoutingRule[] = [];
  for (const r of rules) saved.push({ ...r, id: r.id || (await nextId('route', 'RR-')) });
  await db().routingRule.deleteMany({});
  await db().routingRule.createMany({ data: saved });
  await audit(user, 'config_change', 'routing', 'routing', 'Updated approval routing rules', { rules: before }, { rules: saved });
}

export async function getSettings() {
  assertCan(ctx(), 'config.view');
  const s = await settings();
  // simulateErrors only exists in the browser prototype.
  return { sla: s.sla, allowedDomains: s.allowedDomains, masterLists: s.masterLists, simulateErrors: false };
}

export async function saveSla(sla: SlaSettings): Promise<void> {
  const user = ctx();
  assertCan(user, 'config.manage');
  for (const [k, v] of Object.entries(sla)) if (!Number.isInteger(v) || v < 0 || v > 120) throw invalid(`${k} must be a whole number between 0 and 120.`);
  if (sla.renewalEscalationDays >= sla.renewalLeadDays) throw invalid('Renewal escalation must be fewer days before expiry than the renewal reminder.');
  const before = (await settings()).sla;
  const ch = diff(before, sla);
  await db().setting.update({ where: { id: 1 }, data: { sla: json({ ...sla }) } });
  await audit(user, 'config_change', 'sla', 'sla', `Updated SLAs (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
}

export async function saveMasterLists(lists: MasterLists): Promise<void> {
  const user = ctx();
  assertCan(user, 'config.manage');
  if (!lists.terminationReasons.length || !lists.nonRenewalReasons.length) throw invalid('Reason lists cannot be empty.');
  const before = (await settings()).masterLists;
  const ch = diff(before, lists);
  await db().setting.update({ where: { id: 1 }, data: { masterLists: json(lists) } });
  await audit(user, 'config_change', 'master_lists', 'master_lists', `Updated master lists (${ch.changed.join(', ') || 'no changes'})`, ch.before, ch.after);
}

export async function saveDomains(domains: string[]): Promise<void> {
  const user = ctx();
  assertCan(user, 'config.manage');
  const clean = [...new Set(domains.map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (!clean.length) throw invalid('Keep at least one allowed domain, or nobody can sign in.');
  if (clean.some((x) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x))) throw invalid('Enter domains like apeejay.edu (no @ or spaces).');
  const before = (await settings()).allowedDomains;
  await db().setting.update({ where: { id: 1 }, data: { allowedDomains: json(clean) } });
  await audit(user, 'config_change', 'domains', 'domains', 'Updated allowed sign-in domains', { domains: before }, { domains: clean });
}
