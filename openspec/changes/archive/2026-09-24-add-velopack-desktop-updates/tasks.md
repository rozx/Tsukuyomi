# Tasks

## 1. 构建和发布

- [x] 1.1 替换依赖并配置 packager，固定 velopack/vpk 版本，验证依赖安装和 Quasar 配置类型检查。
- [x] 1.2 实现三平台打包脚本、macOS ad-hoc 签名与产物清单校验，以脚本回归测试和本机 mac arm64 实际构建验证。
- [x] 1.3 修改发布矩阵和 draft 最终公开流程，移除 Apple secrets 输入，校验 workflow 与发布产物验证脚本。

## 2. 应用更新

- [x] 2.1 先失败测试再实现更新控制器，覆盖并发去重、下载失败恢复、已下载版本绑定及准备失败不安装。
- [x] 2.2 接入 bootstrap、可信 IPC 和一次性主进程检查，以边界测试和实际打包启动验证。
- [x] 2.3 先失败测试再实现重启准备与保存保护，覆盖活跃工作、持锁、保存失败、准备超时和冻结恢复。
- [x] 2.4 关于区增加更新状态、检查和重启操作，App 注册一次订阅，以组件/桥接测试及构建验证。

## 3. 验证与说明

- [x] 3.1 更新构建和迁移文档，说明免证书 Gatekeeper 限制、首次手动升级及三平台验收步骤。
- [x] 3.2 运行相关测试、lint、type-check、quality-check、格式及 OpenSpec strict validate 并记录结果。
- [x] 3.3 mac arm64 实测 N 到 N+1 更新、重启和原数据保留；下载隔离 Gatekeeper 条件单独记录。
- [ ] 3.4 在 Windows、Linux、mac Intel 验证真实升级与数据保留；无相应环境时保留未完成状态。

## 验证记录（2026-09-24）

- 依赖 frozen-lockfile 安装成功；lint、type-check、quality-check 通过。完整测试覆盖运行：237 个文件通过、1 个跳过，2580 项测试通过、5 项跳过。随后补充开发模式 IPC 回归并单独运行相关测试。
- actionlint、Prettier、git diff --check、OpenSpec strict validate 通过。质量脚本临时 intent-to-add 已自动撤销，Git 索引保持空白。
- 本机 macOS ARM64 完整运行 `bun run build:electron`，输出 0.16.0 Portable ZIP、nupkg、osx-arm64 feed，并通过 SHA-256 和文件长度校验。未提供 Apple 证书、公证凭据，未运行临时 keychain 导入。
- 解压发布 ZIP 后 `codesign --verify --deep --strict` 通过；签名为 ad-hoc，TeamIdentifier 未设置。真实应用可启动，关于区存在检查更新及发布版本入口，原生 API 返回 0.16.0。
- 在 /tmp 隔离数据目录创建测试书籍。仅修改测试产物的 package.version，生成本地 0.16.1 feed；Velopack JS SDK 检查、下载并调用 helper 完成替换，重新启动真实应用后 API 返回 0.16.1，IndexedDB 同一书籍记录完整保留。测试父进程必须保持运行，避免执行工具清理退出进程的子进程；重复验证 SDK 流程成功。未改仓库正式版本，未触发 GitHub 发布。
- 实机验收的边界：本次用本地 FileSource/隔离 locator 运行原生 SDK，并手动重新启动应用；生产 GitHub feed、原生确认对话框到自动重启整条链路由自动化边界测试覆盖，尚未经生产 release 验收。
- 浏览器下载后的 Gatekeeper 隔离、Windows、Linux、macOS Intel 的真实构建/升级仍需对应环境验收。3.4 保持未完成；按用户 2026-09-24 的明确指示同步规格并归档，归档不代表这些验收已完成。
