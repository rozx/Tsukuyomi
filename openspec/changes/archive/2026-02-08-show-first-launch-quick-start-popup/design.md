## Context

当前应用已有两条可复用能力：

- 帮助文档内容已存放在 `public/help/*.md`，并通过 `src/pages/HelpPage.vue` 使用 `marked +
  DOMPurify` 渲染。
- 可同步的全局设置位于 `AppSettings`，由 `src/stores/settings.ts` 持久化到 IndexedDB，并在
  `src/services/sync-data-service.ts` 中随 `appSettings` 参与合并与同步。

本次变更要求在“首次打开应用”自动弹出 `public/help/front-page.md`，并在关闭后永久记住该状态，
且该状态需要跨设备同步，避免用户在新设备或同步后重复看到同一引导。

## Goals / Non-Goals

**Goals:**

- 新用户首次进入应用时自动展示快速开始弹窗（内容来自 `front-page.md`）。
- 用户关闭后记录“已关闭”状态，后续启动不再自动弹出。
- 该状态通过现有同步链路跨设备生效。
- 在同步冲突场景下保证“已关闭”语义尽量单调（不轻易回退为未关闭）。

**Non-Goals:**

- 不重做帮助中心页面结构与样式。
- 不引入新的远程存储通道（继续使用现有 Gist 同步能力）。
- 不在本次改动中实现分版本 onboarding（例如 v1/v2 不同引导）。

## Decisions

### 1) 状态放在 `AppSettings`，而不是 `ui` store

**决策**：新增可同步字段到 `AppSettings`（例如 `quickStartDismissed: boolean`，可选附带
`quickStartDismissedAt`），由 `settings` store 统一读写。

**原因**：

- `ui` store 当前仅写 `localStorage`，不参与同步，无法满足“跨设备不再弹出”。
- `AppSettings` 已经进入导入/导出与 Gist 同步链路，改动面最小且一致性最好。

**备选方案**：

- 写入单独的 IndexedDB store：可行，但需要额外扩展同步 payload 与迁移逻辑，复杂度更高。

### 2) 弹窗在 `MainLayout` 全局挂载，并在 settings 加载完成后判定显示

**决策**：在 `src/layouts/MainLayout.vue` 挂载快速开始对话框组件；仅当 settings 已加载且未关闭状态时显示。

**原因**：

- `MainLayout` 是所有主页面共同入口，能保证“打开应用即判定”，且不依赖具体页面。
- 避免在多个页面重复判断或出现路由切换时多次弹出。

**备选方案**：

- 在 `IndexPage` 中处理：会遗漏从其他入口直达页面的场景，且耦合首页路由。

### 3) Markdown 内容直接读取 `/help/front-page.md` 并安全渲染

**决策**：弹窗组件首次显示时拉取 `/help/front-page.md`，使用与帮助页一致的 Markdown 渲染栈
（`marked` + `DOMPurify`）。

**原因**：

- 保证单一内容源，文档更新无需改代码。
- 复用现有依赖，避免新增包。

**备选方案**：

- 将文档内容硬编码到组件：实现快，但后续维护成本高，且易与帮助中心内容分叉。

### 4) 关闭行为采用“立即持久化 + 同步友好”策略

**决策**：用户点击关闭时立刻更新 `settings`（写 IndexedDB、更新 `lastEdited`），并确保同步合并时
“已关闭”优先于“未关闭”。

**原因**：

- 立即持久化可避免刷新后重复弹出。
- 在多设备并发编辑设置时，若仅依赖 `lastEdited` 整体覆盖，存在状态回退风险；需要在设置合并中对
  onboarding 字段进行保守合并（如布尔 OR / 时间戳取最大）。

**备选方案**：

- 完全依赖现有 `lastEdited` 规则：实现简单，但在特定冲突下可能重新弹窗，违背用户预期。

## Risks / Trade-offs

- **[设置冲突导致状态回退]** → 在同步合并中对 onboarding 字段做单调合并（true 不回退）。
- **[首次加载闪烁]** → 仅在 `settings.isLoaded` 后决定是否显示，避免先显示后隐藏。
- **[Markdown 内容渲染安全]** → 保持 DOMPurify 清洗链路，禁止直接渲染未清洗 HTML。
- **[文档加载失败体验]** → 弹窗保留错误提示与关闭按钮；关闭后仍允许记录状态，避免每次启动反复失败弹窗。

## Migration Plan

1. 在 `AppSettings` 增加新字段（可选，默认未关闭）。
2. 在 `settings` store 的默认值、读写与导入逻辑中接入新字段。
3. 在同步合并逻辑中加入该字段的冲突处理策略（单调合并）。
4. 新增全局快速开始弹窗组件并在 `MainLayout` 挂载。
5. 回归验证：首次启动显示、关闭后本机不再显示、同步到另一设备后也不显示。

回滚策略：

- 若需回滚 UI，仅移除弹窗挂载；保留设置字段不会影响兼容性。
- 若需完全回滚，可忽略该字段（旧版本读取时自动忽略未知字段）。

## Open Questions

- 旧用户（已使用很久但未记录该字段）是否也应看到一次该弹窗？当前建议是“是”（字段缺失视为未关闭）。
- 弹窗关闭是否需要“稍后提醒”选项？当前按需求只提供“一次关闭后不再自动弹出”。
