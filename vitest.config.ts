import { defineConfig, type Plugin } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  // 项目主构建用的是 rolldown-vite，@vitejs/plugin-vue 的类型跟着 rolldown 走，
  // 而 vitest 内置的是 rollup 版 vite —— 运行时兼容，仅类型不一致，故显式收敛
  plugins: [tsconfigPaths(), vue() as unknown as Plugin],
  resolve: {
    alias: [
      { find: 'bun:test', replacement: path.resolve(__dirname, 'src/__tests__/bun-test-shim.ts') },
      // 只替换 `#q-app` 本身；`#q-app/electron/main` 等子路径不走这个桩
      {
        find: /^#q-app$/,
        replacement: path.resolve(__dirname, 'src/__tests__/quasar-wrappers-stub.ts'),
      },
      // 主进程用的路径辅助函数：tsconfig 里只映射到类型声明，这里指向真正的实现，
      // 覆盖率收集转换 src-electron/electron-main.ts 时才解析得到
      {
        find: /^#q-app\/electron\/main$/,
        replacement: path.resolve(
          __dirname,
          'node_modules/@quasar/app-vite/exports/electron/main-runtime.js',
        ),
      },
    ],
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
      // Electron 主进程的代码也有测试：不收集的话，质量检查只能按估计的覆盖率给它们打分
      include: ['src/**/*.ts', 'src-electron/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**', 'src/auto-*.d.ts', 'src/**/*.d.ts'],
    },
  },
});
