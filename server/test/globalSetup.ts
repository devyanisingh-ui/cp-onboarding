import { execSync } from 'node:child_process';

/** Brings the test database up to the latest migrations once per run (it is wiped between tests). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'mysql://cp:cp_local@127.0.0.1:3306/cp_onboarding_test';
  try {
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  } catch (e) {
    const out = (e as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() || (e as { stdout?: Buffer }).stdout?.toString() || String(e);
    throw new Error(`Could not prepare the test database at ${url.replace(/:[^:@/]+@/, ':***@')}. Is MySQL running? Start it with \`npm run db:up\`.\n${out}`);
  }
}
