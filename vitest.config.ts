import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      'bun:test': path.resolve(__dirname, 'src/__tests__/bun-test-shim.ts'),
      '#q-app/wrappers': path.resolve(__dirname, 'src/__tests__/quasar-wrappers-stub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['src/__tests__/vitest-setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**'],
    globals: false,
    coverage: {
      provider: 'istanbul',
      reporter: ['json', 'text-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**', 'src/auto-*.d.ts', 'src/**/*.d.ts'],
    },
  },
});
