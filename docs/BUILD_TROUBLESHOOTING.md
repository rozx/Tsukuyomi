# 桌面构建、更新与故障排查

桌面构建使用 `Quasar → @electron/packager → Velopack`。前两步生成包含 Electron 运行时的应用目录，最后一步生成便携分发包和更新包。应用运行不需要用户安装 Bun 或 .NET SDK。

## 构建

构建机需要 Bun、Node（`@quasar/app-vite` 3 要求 22.22 及以上，版本见 `.nvmrc`）和 .NET SDK 10。`velopack` npm 包与 `vpk` CLI 固定为同一版本（目前 1.2.158）。

```bash
bun install --frozen-lockfile
bun run build:electron       # 应用目录 + 便携分发包 + 更新包
bun run build:electron:app   # 只组装应用，供本地调试
bun run pack:electron        # 从已有应用目录制作 Velopack 包
```

产物位于 `dist/electron/Releases/`：Windows 为 Portable ZIP，macOS 为包含 `.app` 的 Portable ZIP，Linux 为 AppImage；同时生成 `.nupkg` 和 `releases.<平台-架构>.json`。请勿在生成后重命名文件，也不要仅上传便携包而遗漏更新包与清单。

CI 支持 win-x64、linux-x64、osx-arm64、osx-x64。平台和架构进入通道名，避免不同矩阵互相覆盖。正式版本取 `package.json` 的三段版本；`APP_VERSION` 也只存三段，界面显示的提交数和短 SHA 由 `vite-plugins/build-info.ts` 在构建时注入（构建任务需完整 checkout 才有提交数）。每次正式发布都必须递增三段版本，不覆盖已公开的 tag。

`TSUKUYOMI_VPK` 可指定本地已安装的同版本 vpk 可执行文件；默认通过 `dnx` 获取固定版本。构建本身不发布任何文件。GitHub Actions 先创建 draft，各平台构建成功后统一校验、上传，再公开为 latest；某个平台失败时 draft 不公开。

## macOS 无 Apple Developer 证书构建

默认使用 **ad-hoc 签名**，不执行 Apple 公证，不创建或导入 Developer ID keychain，不读取旧的 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID` 等 secrets。现有 secrets 可以保留，但这条构建流程不会使用它们。

旧流程中的 `security set-key-partition-list` / `SecKeychainUnlock` 错误来自临时证书 keychain；新流程不进入该路径。日志中的其他平台 optional dependencies 缺失不等于本机依赖缺失，也不是这个 keychain 错误的原因。

ad-hoc 签名不会让 Apple 验证开发者身份，也不会消除 Gatekeeper 提示。用户从发布页下载、解压应用，首次尝试打开后，可以按 Apple 的说明进入 **系统设置 → 隐私与安全 → 仍要打开**。不需要关闭整台 Mac 的 Gatekeeper。

- [Apple：打开未公证或未知开发者的应用](https://support.apple.com/en-au/102445)
- [Velopack macOS 分发说明](https://docs.velopack.io/packaging/operating-systems/macos)

签名和本地启动成功不能证明经浏览器下载隔离后的更新一定可用。无 Developer ID 的自动更新兼容性需要真实 N → N+1 验收；尚未验收的平台不得对外宣称已验证。若更新失败，用户仍可从发布页手动下载替换应用，保留原用户数据目录。

将来启用正式 Developer ID 签名和公证，应在 Velopack 打包阶段配置证书与 notary profile，并同时签署其更新组件；不要恢复旧 electron-builder 的环境变量流程。

## 首次迁移与更新行为

旧版本没有更新模块，用户需要手动下载一次迁移后的版本。Windows 从单文件 EXE 改为 ZIP 解压目录，请保留整个目录，包括更新组件；不要只复制其中一个 EXE。应用名称及默认 Electron userData 位置保持原值，书库继续使用原 IndexedDB。

启动 30 秒后检查正式版本，此后每六小时检查；用户也可在“设置 → 关于”检查。新版自动下载，完成后用户选择“重启并更新”。普通关闭或下次启动不会绕过确认自动安装。

翻译、导入、同步、书籍执行锁或未完成保存会阻止重启。重启前请保存尚未提交的编辑；准备失败或超时会恢复交互。开发模式及尚未经过 Velopack 分发的原始 packager 目录会显示自动更新不可用。

## 发布验收

1. 安装或解压版本 N，创建测试书籍、章节、译文及设置，记录 app.getPath('userData')。
2. 向隔离的测试 feed 提供同平台架构的 N+1；真实生产客户端的更新源固定为官方 GitHub 仓库，不能由 renderer 改写。
3. 验证无更新、断网、重复检查、下载失败重试、包校验失败均不会安装。
4. 下载后保持翻译/同步任务运行，确认更新不能强制重启；任务完成后确认更新，验证版本与原数据。
5. Windows 检查 ZIP 便携目录，Linux 检查 AppImage 与不可写目录，macOS 分别检查本地签名包和经浏览器下载带隔离标记的包。
6. 对四个发布通道分别记录结果。仅有单元测试或 CI 打包成功不能代替真实升级验收。

## Windows 启动没有主窗口

从 PowerShell 运行解压目录中的启动 EXE，检查 `[Electron]` 日志和 Puppeteer 初始化输出。保留整个便携目录，确认杀毒软件没有隔离更新组件或原生模块；不要使用历史单文件 portable 的文件布局替换新目录。

## 依赖放在哪里

`@quasar/app-vite` 3 要求各模式的依赖放在各自的 `/src-<mode>` 目录。本项目把根目录与 `src-electron` 组成同一个 Bun workspace：

- **根 `package.json`**：渲染进程（`src/`）与构建工具的依赖。渲染进程的依赖由 Vite 打进 bundle，不会安装到打包后的应用里。
- **`src-electron/package.json`**：`dependencies` 是主进程在运行时 `import` 的包（puppeteer 系列、velopack），构建时不进 bundle，由 Quasar 按解析到的确切版本安装到 `dist/electron/UnPackaged`；`devDependencies` 是只在构建时用的 `electron` 与 `@electron/packager`。主进程新增运行时依赖时用 `bun add --cwd src-electron <包>`，否则它会被打进 `electron-main.js`，原生模块会因此加载失败。
- **锁文件只有根目录的 `bun.lock`**，`bun install`、`bun audit`、CI 和安全更新工作流都只需在根目录运行。
- **`bunfig.toml` 把安装方式固定为提升式**（`linker = "hoisted"`）。Bun 对 workspace 默认用隔离式安装，那样测试无法从 `src/__tests__` 里 mock `electron`、`velopack`。提升式安装下 `src-electron/node_modules` 通常不存在，Quasar 每次构建会在该目录补跑一次 `bun install`（无变化，不到一秒）。
- **`UnPackaged/package.json` 以根 `package.json` 为底**，所以根目录的 `overrides` 对打包后的应用同样生效；`quasar.config.ts` 的 `extendElectronPackageJson` 去掉了在那里用不上的 `workspaces` 与 `patchedDependencies`。

构建时注入的常量走 `import.meta.env`：Quasar 自己的是 `import.meta.env.QUASAR_*`（如 `QUASAR_DEV`、`QUASAR_APP_URL`），项目自己的在 `quasar.config.ts` 的 `build.defineEnv` 里加，并在 `src/env.d.ts` 的 `ImportMetaEnv` 里声明类型。主进程里读取运行时环境变量（如 `ELECTRON_DEBUG`）仍用 `process.env`。

## 依赖安全更新

每周的 `.github/workflows/security-updates.yml` 会跑 `bun audit fix`，但它只能在上游声明的版本范围内升级。被上游范围卡住的漏洞要手动处理，本地用 `bun audit` 查看现状。

- **直接依赖**：`bun update <包>` 或 `bun add <包>@<版本>`。
- **传递依赖、修复版本在上游范围内**：`bun update <包>` 同样有效（例如 `bun update express glob minimatch`），不会写进 `package.json`。
- **传递依赖、修复版本超出上游范围**：在 `package.json` 的 `overrides` 里按依赖方单独指定（Bun 支持嵌套写法）。不要写成顶层 `"glob": "..."`：同一个包在依赖树里常有多个大版本并存（如 `rimraf` 仍用 glob 7 的回调 API），顶层覆盖会把它们一起换掉。

目前的 overrides 及可以删除的时机：

| 依赖方 › 包                                          | 覆盖为                | 原因                                      | 何时删除                              |
| ---------------------------------------------------- | --------------------- | ----------------------------------------- | ------------------------------------- |
| `puppeteer-in-electron` › `uuid`                     | `^11.1.1`             | 上游声明 `^8.3.2`（GHSA-w5hq-g745-h8pq）  | 上游放宽范围后                        |
| `@electron/asar` › `glob` / `minimatch`              | `^14.0.2` / `^11.0.1` | GHSA-3g3m-2fjr-6pw4 / GHSA-g3hv-75wg-m249 | `@electron/asar` 自己升到这两个版本后 |
| `sucrase` › `glob`                                   | `^14.0.2`             | 同上（经 `tailwindcss` 3 引入）           | 升级 Tailwind 4 后                    |
| `@typescript-eslint/typescript-estree` › `minimatch` | `^11.0.1`             | GHSA-g3hv-75wg-m249                       | typescript-eslint 自己升级后          |

覆盖到的包都同时提供 CommonJS 与 ESM 入口，不要求 Node 22 的 `require(esm)`。删除某条 override 后跑一次 `bun install && bun audit` 确认没有回退。

**升级 Electron 抓取相关依赖后的验证**（`puppeteer`、`puppeteer-extra`、`puppeteer-in-electron`、`electron`）：类型检查和单元测试覆盖不到主进程里的抓取链路，需要实际跑一次。

```bash
PUPPETEER_SKIP_DOWNLOAD=true bun run build:electron:app
```

启动 `dist/electron/Packaged/` 下的应用，在开发者工具里执行 `await window.electronAPI.fetch('https://example.com')`，返回 `status: 200` 且 `data` 是页面 HTML 即为正常；无界面的 Linux 环境用 `xvfb-run` 启动，并经调试端口 8315 连接主窗口。
