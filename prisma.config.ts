import { defineConfig } from 'prisma/config';

/**
 * Prisma reads every *.prisma file under server/: the shared models in server/platform/ and each
 * feature's models in server/features/<feature>/. Migrations are one history for the whole database.
 */
export default defineConfig({
  schema: 'server',
  migrations: { path: 'server/migrations' },
  datasource: {
    // Local default matches compose.yaml; production sets DATABASE_URL.
    url: process.env.DATABASE_URL ?? 'mysql://cp:cp_local@127.0.0.1:3306/cp_onboarding',
  },
});
