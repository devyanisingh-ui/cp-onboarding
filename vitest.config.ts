import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

/**
 * Two test projects:
 *  - app: the browser app and the mock API (no database). `npm test`.
 *  - db:  server code against a real MySQL (`npm run db:up` first). `npm run test:db`.
 */
export default defineConfig({
  test: {
    // The db project shares one database, so test files take turns (a per-project setting is not allowed).
    fileParallelism: false,
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'app',
          include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
          exclude: ['server/**/*.db.test.ts', '**/node_modules/**'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: ['server/**/*.db.test.ts'],
          environment: 'node',
          globals: true,
          env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://cp:cp_local@127.0.0.1:3306/cp_onboarding_test' },
          globalSetup: ['./server/test/globalSetup.ts'],
          setupFiles: ['./server/test/setup.ts'],
        },
      },
    ],
  },
});
