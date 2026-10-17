import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    clearMocks: true,
    coverage: {
      provider: 'v8',
      thresholds: { lines: 90, statements: 90, branches: 85, functions: 85 },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.tsx',
        'src/**/testFixtures.ts',
        'src/test-setup.ts',
        'src/main.tsx',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
