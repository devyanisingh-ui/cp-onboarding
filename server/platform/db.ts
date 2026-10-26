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
// rather than opening a new connection pool each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter: adapter() });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type { PrismaClient };
