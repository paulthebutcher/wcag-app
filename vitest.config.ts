import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'apps/server/**/*.test.ts',
      'apps/web/**/*.test.ts',
      'packages/contract/**/*.test.ts',
    ],
    testTimeout: 10000,
  },
});
