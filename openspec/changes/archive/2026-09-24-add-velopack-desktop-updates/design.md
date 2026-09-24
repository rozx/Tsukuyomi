# Design

## Context

Quasar app-vite 2.6 使用 esbuild 编译主进程并支持 packager。当前 package.name 为 tsukuyomi-translator、productName 为 Tsukuyomi - Moonlit Translator、appId 为 tsukuyomi。APP_VERSION 的第四段只是展示 build，package.version 为三段发布版本。现有 release workflow 先公开 release，后重命名并上传文件；主进程有单实例锁但没有更新处理。

## Goals / Non-Goals

目标：可重复生成三平台更新包，不依赖付费 Apple 证书，更新过程不主动打断工作。
非目标：改写数据库、后台服务、旧单文件 EXE 自替换、预发布通道 UI、购买证书、代用户发布或 push。

## Decisions

1. 固定 velopack/vpk 1.2.158，Quasar bundler 改 packager。packager 只组装 Electron 目录，构建脚本调用 vpk 制作便携 ZIP/AppImage 和 nupkg/feed。原生 .node 必须留在 ASAR 外。保留应用名称、bundle id、userData 路径和 file origin，不能因换工具造成书库不可见。
2. macOS 使用 vpk 的 ad-hoc signing identity `-`，跳过安装器及公证，Electron entitlements 增加 disable-library-validation；构建过程中不传 CSC*LINK/APPLE*\*，不访问用户签名 keychain。真实构建校验签名与启动；升级闭环是独立验证项，Gatekeeper 下载隔离条件未测不得宣称已完成。
3. Velopack bootstrap 在单实例锁及 Puppeteer 启动前执行，关闭 SDK 默认的启动时自动安装。主进程保存 UpdateInfo，renderer 无权提供 URL、路径或更新包。check/download/restart 只接受主窗口顶层 frame，状态快照可恢复订阅遗漏。操作串行且重复调用不重复下载/安装；失败保留可重试状态。
4. 启动延迟检查、之后每六小时检查，发现新版本后台下载。开发环境及普通 packager 目录明确显示不可更新，不请求网络。用户仅在关于区选择重启安装，普通关闭不会偷偷安装。
5. renderer 的重启准备检查 AI/导入/同步及持锁任务；跟踪 Pinia 未完成 action，冻结新 action 并等待 IndexedDB 已排队事务完成。准备失败恢复交互，不启动外部 updater。检查与退出之间阻止新用户输入和书籍执行，主进程有超时、来源和请求绑定。尚未保存的编辑由确认文案提示先保存，不强制丢弃。
6. 平台与架构通道为 win-x64 / osx-arm64 / osx-x64 / linux-x64；不隐式切换架构或降级。各矩阵构建只上传 Actions artifact，最终 job 验证 feed/文件/hash 后统一上传 release 并公开。已有公开 tag 不覆盖。版本取 package.version，tag 与包必须一致，生成后不重命名。
7. 关于区采用独立叶组件；应用级 composable 注册一次订阅和准备处理，Web 不导入原生模块。保留中文状态、错误重试、下载链接作为失败回退。

## Risks / Trade-offs

- 无 Developer ID 的 Gatekeeper 与更新兼容性 → 本地 ad-hoc 构建/启动/升级与下载隔离分别验证；未验证项留在 tasks 中。
- Windows/mac Intel/Linux 实机不可用 → CI 构建和回归测试覆盖包构造，平台验收保持未完成，不冒充实测。
- 现有防抖聊天保存 → 准备前让排队保存结束，不能仅观察某个页面的 busy 值。
- 迁移初版没有旧 updater → 用户首次手动下载 ZIP，保留原 userData。

## Migration Plan

先完成契约测试和构建脚本，再验证本机 mac arm64 包。CI 仅由现有 release 触发条件运行；当前任务不触发发布。后续通过安装 N、从测试 feed 下载 N+1、确认重启并读取原书库验收各平台。出错发布更高 patch 的修复版本，禁止同版本覆盖或自动降级。
