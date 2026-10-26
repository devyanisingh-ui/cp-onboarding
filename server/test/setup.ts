import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../platform/db';

/** Every test starts from an empty database. */
beforeEach(async () => {
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`;
  // FOREIGN_KEY_CHECKS is per connection: keep the whole reset on one.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${name}\``);
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
