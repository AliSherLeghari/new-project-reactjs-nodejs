import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: { lines: 90, statements: 90, branches: 85, functions: 85 },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
