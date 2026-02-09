// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app/wrappers';
import { fileURLToPath } from 'node:url';
import { PrimeVueResolver } from 'unplugin-vue-components/resolvers';
import { dynamicAIProxy } from './vite-plugins/dynamic-ai-proxy';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig((ctx: any) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['i18n', 'axios', 'primevue', 'toast-history'],

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

        // 添加 Node.js polyfills 以支持 kuromojin
        if (!viteConf.plugins) viteConf.plugins = [];
        viteConf.plugins.push(
          nodePolyfills({
            // 包含 path 模块的 polyfill
            globals: {
              Buffer: true,
              global: true,
              process: true,
            },
            // 包含 path 和其他 Node.js 模块
            include: ['path', 'util', 'stream', 'buffer'],
            // 排除一些不需要的模块
            exclude: [],
          }),
        );

        // 配置开发服务器端口（避免与 Node.js 应用服务器冲突）
        if (!viteConf.server) viteConf.server = {};
        // 开发环境：使用端口 9000，Node.js 应用服务器在 8080
        if (!viteConf.server.port) {
          viteConf.server.port = 9000;
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
            resolvers: [PrimeVueResolver()],
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
      ],
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // https: true,
      // 禁用自动打开浏览器（因为使用 Node.js 应用服务器作为入口）
      open: false,
      // 代理配置在 extendViteConf 中设置
      port: 9000,
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
      // extendElectronMainConf (esbuildConf) {},
      extendElectronPreloadConf(_esbuildConf: any) {
        // 确保 preload 脚本被正确打包
        console.log('Building Electron preload script...');
      },

      // extendPackageJson (json) {},

      // Electron preload scripts (if any) from /src-electron, WITHOUT file extension
      preloadScripts: ['electron-preload'],

      // specify the debugging port to use for the Electron app when running in development mode
      inspectPort: 5858,

      bundler: 'builder', // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
        // Note: This section is ignored when bundler is set to 'builder'
        // Disable asar to ensure preload script is accessible
        asar: false,
        // Icon configuration for packager
        // Icons should be placed in src-electron/icons/
        // - macOS: icon.icns (512x512 or larger)
        // - Windows: icon.ico (256x256 or larger)
        // - Linux: icon.png (512x512 or larger)
        // icon: 'src-electron/icons/icon', // Path without extension, packager will auto-detect format
        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',
        // Windows only
        // win32metadata: { ... }
      },

      builder: {
        // https://www.electron.build/configuration/configuration
        appId: 'tsukuyomi',
        // Enable asar to avoid Windows path length issues (which cause empty builds)
        asar: true,
        // Unpack specific binaries or large files that might have issues with ASAR
        asarUnpack: [
          '**/*.node',
          '**/node_modules/puppeteer/**',
          '**/node_modules/@puppeteer/**',
          '**/node_modules/sharp/**',
        ],
        // Icon configuration for builder
        // Icons should be placed in src-electron/icons/
        mac: {
          icon: 'src-electron/icons/icon.icns',
          // Generate DMG and Zip for better distribution
          target: ['dmg', 'zip'],
          // Required for Notarization
          hardenedRuntime: true,
          gatekeeperAssess: false,
          entitlements: 'src-electron/entitlements.mac.plist',
          entitlementsInherit: 'src-electron/entitlements.mac.plist',
          // Ignore the fake chrome.app bundle in puppeteer-extra-plugin-stealth
          signIgnore: ['chrome.app'],
        },

        win: {
          icon: 'src-electron/icons/icon.ico',
          // Generate Portable executable only
          target: 'portable',
          // 禁用代码签名以避免 Windows 符号链接权限问题
          forceCodeSigning: false, // This disables the automatic signing attempt
        },
        linux: {
          icon: 'src-electron/icons/icon.png',
          // 只生成 AppImage 便携版，不生成 deb/snap 安装程序
          target: ['AppImage'],
        },
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
