## 1. 设置模型与持久化接入

- [x] 1.1 在 `src/models/settings.ts` 为 `AppSettings` 增加快速开始关闭状态字段（含必要注释与类型）。
- [x] 1.2 在 `src/stores/settings.ts` 的默认设置、加载规范化与保存逻辑中接入该字段，确保缺省值可兼容旧数据。
- [x] 1.3 在 `src/services/settings-service.ts` 的导入校验与解析流程中支持该字段，保证导入/导出后状态不丢失。

## 2. 同步合并策略实现

- [x] 2.1 在 `src/services/sync-data-service.ts` 的 appSettings 合并路径中实现快速开始字段的单调合并策略（已关闭状态不回退）。
- [x] 2.2 为同步相关路径补充日志与边界处理（远端缺失、本地缺失、冲突并发）以便排查。
- [x] 2.3 更新或新增同步相关测试，覆盖“true vs false/缺失”冲突时合并结果保持 `true`。

## 3. 首次启动弹窗组件与入口挂载

- [x] 3.1 新增快速开始弹窗组件（读取 `/help/front-page.md`、Markdown 渲染、加载失败提示、关闭按钮）。
- [x] 3.2 在 `src/layouts/MainLayout.vue` 挂载该弹窗，并在 settings 完成加载后按状态决定是否展示，避免初始化闪烁。
- [x] 3.3 在弹窗关闭事件中调用 settings store 持久化“已关闭”状态，并校验当前会话立即关闭。

## 4. 测试与质量校验

- [x] 4.1 新增/更新单元测试：覆盖首次显示、关闭后不再显示、异常读取回退行为。
- [x] 4.2 新增/更新测试：覆盖状态持久化与重启后不重复弹出。
- [x] 4.3 执行 `bun run lint` 与 `bun run type-check`，修复新增改动引入的问题并确认通过。（lint 使用 `bunx --bun eslint --quiet .` 验证）
