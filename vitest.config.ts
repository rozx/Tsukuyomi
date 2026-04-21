import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      'bun:test': path.resolve(__dirname, 'src/__tests__/bun-test-shim.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'src/__tests__/chapter-service.test.ts',
      'src/__tests__/cross-check-missing-with-db.test.ts',
      'src/__tests__/gist-sync-service.test.ts',
      'src/__tests__/kakuyomu-scraper.test.ts',
      'src/__tests__/local-embedding.test.ts',
      'src/__tests__/ncode-scraper.test.ts',
      'src/__tests__/novel-utils.test.ts',
      'src/__tests__/novel18-scraper.test.ts',
      'src/__tests__/overlay-close-stack.test.ts',
      'src/__tests__/quick-start-guide.test.ts',
      'src/__tests__/settings-store.persistence.test.ts',
      'src/__tests__/syosetu-scraper.test.ts',
      'src/__tests__/todo-list-service.test.ts',
      'src/__tests__/todo-list-tools.test.ts',
      'src/__tests__/todo-workflow.test.ts',
      'src/__tests__/translation-normalizer.test.ts',
      'src/__tests__/translation-service.workflow-status.test.ts',
      'src/__tests__/ui-store.mobile-workspace.test.ts',
      'src/__tests__/use-action-info-toast.test.ts',
      'src/__tests__/use-chapter-drag-drop.test.ts',
      'src/__tests__/use-chapter-export.test.ts',
      'src/__tests__/use-chapter-translation.chapter-switch-writeback.test.ts',
      'src/__tests__/use-chapter-translation.test.ts',
      'src/__tests__/use-edit-mode.test.ts',
      'src/services/ai/tools/tools.test.ts',
    ],
    globals: false,
    coverage: {
      provider: 'istanbul',
      reporter: ['json', 'text-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/__tests__/**',
        'src/auto-*.d.ts',
        'src/**/*.d.ts',
      ],
    },
  },
});
