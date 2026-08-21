import { defineConfig, type Plugin } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  // 项目主构建用的是 rolldown-vite，@vitejs/plugin-vue 的类型跟着 rolldown 走，
  // 而 vitest 内置的是 rollup 版 vite —— 运行时兼容，仅类型不一致，故显式收敛
  plugins: [tsconfigPaths(), vue() as unknown as Plugin],
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
