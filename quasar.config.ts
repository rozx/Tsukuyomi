// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app/wrappers';
import { fileURLToPath } from 'node:url';
import { PrimeVueResolver } from 'unplugin-vue-components/resolvers';
import { dynamicAIProxy } from './vite-plugins/dynamic-ai-proxy';

/**
 * 脚本自动导入的 PrimeVue 解析器：跳过运行环境已有的全局名（如 DataView、Image）。
 * 否则 `new DataView(...)` 这类二进制解析代码会被改写成导入同名组件而在运行时失败；
 * 同名组件在 .vue 中需显式 import。
 */
const primeVueScriptResolver = PrimeVueResolver();
// 配置在 Node 中执行，globalThis 没有 DOM 全局名，需补充与 PrimeVue 组件同名的那些
const DOM_GLOBALS = new Set(['Image']);
const resolvePrimeVueScript = (name: string) => {
  if (name in globalThis || DOM_GLOBALS.has(name)) return undefined;
  return typeof primeVueScriptResolver === 'function'
    ? primeVueScriptResolver(name)
    : primeVueScriptResolver.resolve(name);
};

export default defineConfig((ctx: any) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['i18n', 'axios', 'primevue', 'toast-history', 'book-commits'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['tailwind.css'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v6',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },

      typescript: {
        strict: true,
        vueShim: false,
        // extendTsConfig (tsConfig) {}
      },

      vueRouterMode: 'history', // available values: 'hash', 'history'
      // vueRouterBase,
      // vueDevtools,
      // vueOptionsAPI: false,

      // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

      // 在 Electron 模式下使用相对路径，确保 file:// 协议能正确加载资源
      publicPath:
        'pwa' in ctx.mode || 'ssr' in ctx.mode ? '/' : 'electron' in ctx.mode ? './' : '/',
      // analyze: true,
      // env: {},
      // rawDefine: {}
      // ignorePublicFolder: true,
      // minify: false,
      // polyfillModulePreload: true,
      // distDir

      extendViteConf(viteConf: any) {
        // Reduce log noise in terminal
        viteConf.logLevel = 'error';
        // Suppress large chunk size warnings
        if (!viteConf.build) viteConf.build = {};
        viteConf.build.chunkSizeWarningLimit = 2000;
        if (!viteConf.plugins) viteConf.plugins = [];

        // 配置开发服务器端口（避免与 Node.js 应用服务器冲突）
        if (!viteConf.server) viteConf.server = {};
        // 开发环境：默认端口 9000，可用 PORT 环境变量覆盖；Node.js 应用服务器在 8080
        if (!viteConf.server.port) {
          viteConf.server.port = Number(process.env.PORT) || 9000;
        }
        if (!viteConf.server.host) {
          viteConf.server.host = 'localhost';
        }
        // 禁用自动打开浏览器（因为使用 Node.js 应用服务器作为入口）
        viteConf.server.open = false;
      },
      // viteVuePluginOptions: {},

      vitePlugins: [
        // 动态 AI API 代理插件（必须在其他插件之前）
        dynamicAIProxy(),
        [
          'unplugin-vue-components/vite',
          {
            dts: 'src/auto-components.d.ts',
            resolvers: [
              PrimeVueResolver({
                importStyle: false, // PrimeVue v4 使用预设系统，不需要自动导入样式
                importIcons: false, // 图标已在 boot/primevue.ts 中全局导入
              }),
            ],
          },
        ],

        [
          'unplugin-auto-import/vite',
          {
            dts: 'src/auto-imports.d.ts',
            resolvers: [resolvePrimeVueScript],
          },
        ],
        [
          '@intlify/unplugin-vue-i18n/vite',
          {
            // if you want to use Vue I18n Legacy API, you need to set `compositionOnly: false`
            // compositionOnly: false,

            // if you want to use named tokens in your Vue I18n messages, such as 'Hello {name}',
            // you need to set `runtimeOnly: false`
            // runtimeOnly: false,

            ssr: ctx.modeName === 'ssr',

            // you need to set i18n resource including paths !
            include: [fileURLToPath(new URL('./src/i18n', import.meta.url))],
          },
        ],

        // vite-plugin-checker 仅在 dev 模式启用：为终端提供实时 vueTsc/eslint 反馈。
        // 生产构建（build:spa / build:electron）不跑它——lint 与 type-check 已由 CI 独立门禁覆盖，
        // 而在部署容器里对整棵 src 树（含 src/__tests__ 上百个测试文件）跑 vueTsc+eslint 既冗余又吃内存，
        // 会导致构建被资源限制打断（exit 1）。
        ...(ctx.dev
          ? [
              [
                'vite-plugin-checker',
                {
                  vueTsc: {
                    tsconfigPath: 'tsconfig.json',
                  },
                  eslint: {
                    lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
                    useFlatConfig: true,
                  },
                  // Turn off in-browser overlay entirely (keep terminal output)
                  overlay: false,
                },
                { server: false },
              ],
            ]
          : []),
      ],
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // https: true,
      // 禁用自动打开浏览器（因为使用 Node.js 应用服务器作为入口）
      open: false,
      // 代理配置在 extendViteConf 中设置；默认 9000，可用 PORT 环境变量覆盖
      port: Number(process.env.PORT) || 9000,
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {
        dark: true,
      },

      // iconSet: 'material-icons', // Quasar icon set
      lang: 'zh-CN', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: ['LoadingBar'],
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   pwaRegisterServiceWorker: 'src-pwa/register-service-worker',
    //   pwaServiceWorker: 'src-pwa/custom-service-worker',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    //   bexManifestFile: 'src-bex/manifest.json
    // },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
      prodPort: 3000, // The default port that the production server should use
      // (gets superseded if process.env.PORT is specified at runtime)

      middlewares: [
        'render', // keep this as last one
      ],

      // extendPackageJson (json) {},
      // extendSSRWebserverConf (esbuildConf) {},

      // manualStoreSerialization: true,
      // manualStoreSsrContextInjection: true,
      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,

      pwa: false,
      // pwaOfflineHtmlFilename: 'offline.html', // do NOT use index.html as name!

      // pwaExtendGenerateSWOptions (cfg) {},
      // pwaExtendInjectManifestOptions (cfg) {}
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
      // swFilename: 'sw.js',
      // manifestFilename: 'manifest.json',
      // extendManifestJson (json) {},
      // useCredentialsForManifestTag: true,
      // injectPwaMetaTags: false,
      // extendPWACustomSWConf (esbuildConf) {},
      // extendGenerateSWOptions (cfg) {},
      // extendInjectManifestOptions (cfg) {}
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {
      // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true,
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
    electron: {
      // 原生模块由 Node 在运行时加载，不进入 esbuild bundle。
      extendElectronMainConf(conf: { external?: string[] }) {
        conf.external = [...(conf.external ?? []), 'velopack'];
      },
      preloadScripts: ['electron-preload'],
      inspectPort: 5858,
      bundler: 'packager',
      packager: {
        // 名称决定默认 userData 位置，必须与既有 builder 产物一致。
        name: 'Tsukuyomi - Moonlit Translator',
        executableName: 'Tsukuyomi - Moonlit Translator',
        appBundleId: 'tsukuyomi',
        icon: 'src-electron/icons/icon',
        asar: { unpack: '**/*.node' },
        // Quasar 已安装生产依赖；避免另一个包管理器改写 Bun 的依赖树。
        prune: false,
        overwrite: true,
      },
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      // extendBexScriptsConf (esbuildConf) {},
      // extendBexManifestJson (json) {},

      /**
       * The list of extra scripts (js/ts) not in your bex manifest that you want to
       * compile and use in your browser extension. Maybe dynamic use them?
       *
       * Each entry in the list should be a relative filename to /src-bex/
       *
       * @example [ 'my-script.ts', 'sub-folder/my-other-script.js' ]
       */
      extraScripts: [],
    },
  };
});
