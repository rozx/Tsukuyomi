import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import pluginQuasar from '@quasar/app-vite/eslint';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import prettierSkipFormatting from '@vue/eslint-config-prettier/skip-formatting';

export default defineConfigWithVueTs(
  {
    /**
     * Ignore the following files.
     * Please note that pluginQuasar.configs.recommended() already ignores
     * the "node_modules" folder for you (and all other Quasar project
     * relevant folders and files).
     *
     * ESLint requires "ignores" key to be the only one in this object
     */
    // `.kilo/worktrees/*` 和 `.claude/worktrees/*` 下是被各自代理维护的工作树副本，
    // 各自带独立的 .git。其中的 .ts/.vue 文件未被项目 tsconfig 包含，启用 type-checked
    // lint 会报 "parserOptions.project" 错误——整目录忽略即可。
    ignores: ['.kilo/**', '.claude/**'],
  },

  pluginQuasar.configs.recommended(),
  js.configs.recommended,

  /**
   * https://eslint.vuejs.org
   *
   * pluginVue.configs.base
   *   -> Settings and rules to enable correct ESLint parsing.
   * pluginVue.configs[ 'flat/essential']
   *   -> base, plus rules to prevent errors or unintended behavior.
   * pluginVue.configs["flat/strongly-recommended"]
   *   -> Above, plus rules to considerably improve code readability and/or dev experience.
   * pluginVue.configs["flat/recommended"]
   *   -> Above, plus rules to enforce subjective community defaults to ensure consistency.
   */
  pluginVue.configs['flat/essential'],

  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // 禁止 services/ai 和 services/scraper 的内部文件从自身 barrel 导入,
  // 以避免 "barrel ↔ 子文件" 形式的循环依赖。外部消费者仍可使用 barrel。
  {
    files: ['src/services/ai/**/*.ts', 'src/services/scraper/**/*.ts'],
    ignores: ['src/services/ai/index.ts', 'src/services/scraper/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'src/services/ai',
              message:
                '在 services/ai 子目录内请使用具体文件路径（例如 src/services/ai/ai-service-factory），不要从 barrel 导入（防止循环依赖）。',
            },
            {
              name: 'src/services/scraper',
              message:
                '在 services/scraper 子目录内请使用具体文件路径，不要从 barrel 导入（防止循环依赖）。',
            },
          ],
          patterns: [
            {
              group: ['**/index', '../index', '../../index', '../../../index'],
              message: '不要从 "./index" 或 "../index" 等 barrel 导入，请使用具体文件路径。',
            },
          ],
        },
      ],
    },
  },
  // https://github.com/vuejs/eslint-config-typescript
  vueTsConfigs.recommendedTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.browser,
        ...globals.node, // SSR, Electron, config files
        process: 'readonly', // process.env.*
        ga: 'readonly', // Google Analytics
        cordova: 'readonly',
        Capacitor: 'readonly',
        chrome: 'readonly', // BEX related
        browser: 'readonly', // BEX related
      },
    },

    // add your custom rules here
    rules: {
      'prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'off',
      // allow debugger during development only
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    },
  },

  {
    files: ['src-pwa/custom-service-worker.ts'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },

  prettierSkipFormatting,
);
