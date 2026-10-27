/**
 * Demo data for local development and staging: `npx prisma db seed` (also run by `prisma migrate
 * reset`). Never run against production. Built from the same seed as the browser prototype
 * (src/data/seed.ts); each feature loads its own part as it moves to MySQL.
 */
import { buildSeed, DEMO_PASSWORD } from '@/data/seed';
import { prisma } from '../platform/db';
import { seedConfig } from '../features/config';
import { seedAuth } from '../features/auth';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'yes') {
    throw new Error('Refusing to load demo data with NODE_ENV=production. Set ALLOW_DEMO_SEED=yes for a staging database.');
  }
  const seed = buildSeed();
  await prisma.$transaction(
    async (tx) => {
      await seedConfig(tx, seed);
      await seedAuth(tx, seed, DEMO_PASSWORD);
    },
    { timeout: 60_000 },
  );
  console.log(`Seeded ${seed.institutions.length} institutions, ${seed.users.length} users (password ${DEMO_PASSWORD}), ${seed.rateCards.length} rate cards, ${seed.templates.length} templates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
