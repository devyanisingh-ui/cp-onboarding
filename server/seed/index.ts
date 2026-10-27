/**
 * Demo data for local development and staging: `npx prisma db seed` (runs after `prisma migrate
 * reset` too). Never run against production. Built from the same seed as the browser prototype
 * (src/data/seed.ts); each feature adds its part here as it moves to MySQL.
 */
import { buildSeed, DEMO_PASSWORD } from '@/data/seed';
import { prisma } from '../platform/db';
import { hashPassword } from '../features/auth';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'yes') {
    throw new Error('Refusing to load demo data with NODE_ENV=production. Set ALLOW_DEMO_SEED=yes for a staging database.');
  }
  const seed = buildSeed();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await prisma.$transaction(async (tx) => {
    for (const u of seed.users) {
      const data = { name: u.name, email: u.email, designation: u.designation, regionId: u.regionId, managerId: u.managerId ?? null, active: u.active };
      await tx.user.upsert({ where: { id: u.id }, create: { id: u.id, ...data }, update: data });
      await tx.userRole.deleteMany({ where: { userId: u.id } });
      await tx.userRole.createMany({ data: u.roles.map((role) => ({ userId: u.id, role })) });
      // Every demo account shares the prototype's demo password; real users set theirs from an invitation.
      await tx.credential.upsert({ where: { userId: u.id }, create: { userId: u.id, passwordHash }, update: {} });
    }
  });
  console.log(`Seeded ${seed.users.length} users (password ${DEMO_PASSWORD}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
