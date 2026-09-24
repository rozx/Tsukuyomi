# Proposal

## Why

桌面版目前需要手动下载替换，Windows 单文件 portable 不支持现有打包器的标准自动更新。macOS 发布还无条件读取 Apple 签名 secrets，在没有有效 Developer ID 的情况下进入失败的临时 keychain 流程。

## What Changes

- 用 Quasar 的 `@electron/packager` 组装应用，再用固定版本 Velopack 制作更新及分发产物，移除 electron-builder。
- **BREAKING** Windows portable 从单个自解压 EXE 改为可自动更新的 ZIP 目录；既有用户首次需要手动下载迁移版本。
- 主进程管理更新检查、下载及用户确认后的重启；设置关于区展示状态。更新不得中断翻译、导入、同步和持久化。
- macOS 默认不使用付费 Apple 证书及公证，使用 ad-hoc 签名并发布便携 ZIP，保留 Gatekeeper 首次打开说明；macOS 更新是否可用以实际升级验证为准。
- 发布以明确 OS/架构通道和同一版本产物为单位，全部上传校验后公开 draft release。

## Capabilities

### New Capabilities

- `desktop-app-updates`: 桌面更新状态、受控 IPC、安全重启和错误恢复。
- `desktop-release-packaging`: 三平台 Velopack 产物、无 Apple 证书构建及完整发布。

### Modified Capabilities

无。沿用设备分派和设置页结构，更新区为独立叶组件。

## Impact

涉及 package.json/bun.lock、quasar.config.ts、src-electron、更新模型与 composable、App/关于区、构建脚本、GitHub Actions 和构建说明。Web 业务、数据库结构和已有应用数据目录保持不变。CI 需要 .NET SDK 与匹配版本 vpk；运行用户无需安装 .NET SDK。
