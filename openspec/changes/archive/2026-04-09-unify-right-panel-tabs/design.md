## Context

书籍详情页当前有两个独立的右侧区域：
1. **AppRightPanel**（AI 聊天）：挂载在 `MainLayout.vue`，全局右侧，通过 `ui.rightPanelOpen` 控制显示
2. **TranslationProgress**（翻译进度）：挂载在 `BookDetailsPage.vue` 的分栏布局中，与章节内容并排显示

两者同时显示时，章节内容区被严重压缩。TranslationProgress 目前通过 props 从 BookDetailsPage 接收进度数据（`progress`, `isTranslating` 等），通过 emit 向上传递取消事件。

## Goals / Non-Goals

**Goals:**
- 将 AI 助手与翻译进度合并为 AppRightPanel 内的两个 Tab
- 翻译进度在所有页面（包括非 BookDetailsPage）可见
- 翻译任务开始时自动切换到「翻译进度」Tab
- 移除 BookDetailsPage 的 split 布局，章节内容恢复全宽

**Non-Goals:**
- 不修改右侧面板的宽度调整功能
- 不改变移动端布局（overlay 模式）
- 不重构 TranslationProgress 内部的 UI 逻辑

## Decisions

### Decision 1：进度数据提升到 AIProcessingTask

**选择**：在 `AIProcessingTask` 接口新增可选字段 `progress?: { current: number; total: number; message: string }`，在 `useChapterTranslation` 里通过 `aiProcessingStore.updateTask()` 同步更新进度。

**替代方案**：在 `bookDetailsStore` 或新 store 中维护进度映射表。

**理由**：进度天然属于任务本身，放在 task 上最直观，避免引入额外 store；且 task 已有 `message` 字段，`progress` 是自然延伸。

---

### Decision 2：取消逻辑去 emit，改 watch

**选择**：TranslationProgress 只调 `aiProcessingStore.stopTask(task.id)`（已包含 HTTP abort），移除 `emit('cancel')` 链路。BookDetailsPage 通过 `watch(aiProcessingStore.activeTasks)` 检测到对应任务变为 `cancelled` 时，更新局部 UI 状态（`state.isTranslating = false` 等）。

**替代方案**：通过全局 store 注册取消回调（cancel bridge）。

**理由**：`aiProcessingStore.stopTask()` 已经包含 `abortController.abort()`，是取消 HTTP 请求的真正入口。BookDetailsPage 原本已有 watch 处理任务状态变化，扩展 watch 逻辑即可，无需额外桥接机制。

---

### Decision 3：Tab 状态存在 uiStore

**选择**：`uiStore` 新增 `activeRightTab: 'chat' | 'progress'` 及对应 action。翻译/润色/校对任务创建时，调用 action 自动切换到 `'progress'`。

**替代方案**：AppRightPanel 内部 ref 维护 Tab 状态。

**理由**：tab 状态需要被 `useChapterTranslation` 等外部代码触发切换，存在 store 可跨组件访问；且日后可持久化或在响应式布局中复用。

---

### Decision 4：TranslationProgress 的 props 全部移除

**选择**：`TranslationProgress` 组件移除所有 props（`isTranslating`, `isPolishing`, `isProofreading`, `progress`），改为直接从 `aiProcessingStore.activeTasks` 判断当前是否有活跃的翻译/润色/校对任务，并读取 `task.progress` 获取进度数据。

**理由**：组件已大量使用 store，只需将剩余 props 也来源于 store，使组件完全自包含，可在任意位置挂载。

## Risks / Trade-offs

- **[风险] 进度更新频率**：`aiProcessingStore.updateTask()` 会触发 store 响应式更新，若每翻译一段就更新一次，频率较高。→ 缓解：`useChapterTranslation` 原本已有 throttle 机制，更新 store 可复用同样的节流逻辑。

- **[风险] watch 时序**：BookDetailsPage 卸载时，watch 会被清理，若任务在卸载后才 cancelled，局部状态清理可能缺失。→ 缓解：`onUnmounted` 中已有手动取消调用，保持不变；watch 只是辅助更新 UI 状态，不影响取消逻辑本身。

- **[取舍] 任务数据膨胀**：`AIProcessingTask` 增加 `progress` 字段，历史任务数据中此字段为 undefined，兼容性良好（可选字段）。IndexedDB 存储体积略增，可忽略。

## Open Questions

（无）
