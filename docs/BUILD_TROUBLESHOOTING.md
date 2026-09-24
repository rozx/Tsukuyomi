# 桌面构建、更新与故障排查

桌面构建使用 `Quasar → @electron/packager → Velopack`。前两步生成包含 Electron 运行时的应用目录，最后一步生成便携分发包和更新包。应用运行不需要用户安装 Bun 或 .NET SDK。

## 构建

构建机需要 Bun、Node 和 .NET SDK 10。`velopack` npm 包与 `vpk` CLI 固定为同一版本（目前 1.2.158）。

```bash
bun install --frozen-lockfile
bun run build:electron       # 应用目录 + 便携分发包 + 更新包
bun run build:electron:app   # 只组装应用，供本地调试
bun run pack:electron        # 从已有应用目录制作 Velopack 包
```

产物位于 `dist/electron/Releases/`：Windows 为 Portable ZIP，macOS 为包含 `.app` 的 Portable ZIP，Linux 为 AppImage；同时生成 `.nupkg` 和 `releases.<平台-架构>.json`。请勿在生成后重命名文件，也不要仅上传便携包而遗漏更新包与清单。

CI 支持 win-x64、linux-x64、osx-arm64、osx-x64。平台和架构进入通道名，避免不同矩阵互相覆盖。正式版本取 `package.json` 的三段版本，`APP_VERSION` 的第四段只用于展示。每次正式发布都必须递增三段版本，不覆盖已公开的 tag。

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
