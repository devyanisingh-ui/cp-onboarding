import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

/** The connection string; compose.yaml's local database when DATABASE_URL is not set. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'mysql://cp:cp_local@127.0.0.1:3306/cp_onboarding';
}

/**
 * MySQL 8 signs users in with caching_sha2_password; over a connection without TLS (local Docker)
 * the driver must be allowed to fetch the server's public key. RDS connections use TLS instead.
 */
function adapter() {
  const url = new URL(databaseUrl());
  if (!url.searchParams.has('allowPublicKeyRetrieval')) url.searchParams.set('allowPublicKeyRetrieval', 'true');
  return new PrismaMariaDb(url.toString());
}

// One client per process. Next.js dev reloads modules on every edit, so keep it on globalThis
// rather than opening a new connection pool each time — unless the generated client itself was
// rebuilt (`npm run db:migrate` while the dev server runs): then the cached one no longer knows
// the new tables, so replace it.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const cached = globalForPrisma.prisma;
if (cached && !(cached instanceof PrismaClient)) void (cached as PrismaClient).$disconnect();

export const prisma: PrismaClient = cached instanceof PrismaClient ? cached : new PrismaClient({ adapter: adapter() });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type { PrismaClient };
