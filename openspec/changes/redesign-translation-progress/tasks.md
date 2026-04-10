## 1. Store 层调整

- [x] 1.1 更新 `book-details.ts` 的 `translationProgress` 状态：新增 `selectedTaskId`、`todoCollapsed`、`unseenActivity`，保留 `autoScrollEnabled` 和 `showOnlyCurrentChapter`
- [x] 1.2 添加 store actions：`selectTask(taskId)`、`markActivitySeen(taskId)`、`setUnseenActivity(taskId)`、`toggleTodoCollapsed()`
- [x] 1.3 实现 localStorage 迁移兼容：旧格式加载时忽略已废弃字段（`activeTab`、`autoTabSwitchingEnabled`、`taskFolded`），不报错

## 2. 提取思考消息格式化逻辑

- [x] 2.1 创建 `composables/useThinkingFormatter.ts`，从当前 `TranslationProgress.vue` 提取思考消息解析逻辑（块分隔符、工具调用、工具结果、纯文本的识别与结构化）
- [x] 2.2 将格式化缓存和节流逻辑一并迁移到 composable 中

## 3. 子组件实现

- [x] 3.1 创建 `TaskSwitcher.vue`：下拉触发器（显示当前任务摘要）+ 下拉列表（所有任务，含状态点、类型、章节、耗时、状态标签、未读通知点）
- [x] 3.2 创建 `TaskStatusBar.vue`：模型名、已用时间（实时更新）、进度条（带分块计数和百分比）、已完成状态
- [x] 3.3 创建 `TaskTodos.vue`：可折叠待办列表，含复选框交互、计数显示、无待办时隐藏
- [x] 3.4 创建 `StreamToolCall.vue`：内联工具调用（`▸ name → result`）、运行中 spinner、点击展开 Popover 查看详情
- [x] 3.5 创建 `StreamChunkSeparator.vue`：翻译块分隔线（带块序号）
- [x] 3.6 创建 `TaskStream.vue`：统一流式容器，渲染思考文本 + StreamToolCall + StreamChunkSeparator + 输出内容，管理自动滚动和滚动位置保存/恢复
- [x] 3.7 创建 `TaskActionBar.vue`：底部固定栏，活跃任务显示停止按钮，已完成任务显示清除按钮，始终显示"仅本章"过滤标签

## 4. 主组件重写

- [x] 4.1 重写 `TranslationProgress.vue` 为容器组件：任务列表计算、当前任务选择逻辑、未读活动 watcher、子组件编排
- [x] 4.2 实现未读活动检测：watch aiProcessingStore 任务变化，非当前任务有更新时设置 `unseenActivity`
- [x] 4.3 实现新任务自动选中：watch 任务列表，新任务加入时自动切换 `selectedTaskId`

## 5. 样式与视觉

- [x] 5.1 按照 mockup（`mockups/translation-progress-redesign.html`）实现各子组件的暗色主题样式，使用项目现有 CSS 变量
- [x] 5.2 实现下拉列表的弹出动画和背景模糊效果
- [x] 5.3 实现进度条的活跃态动画（shimmer 效果）和流式光标闪烁

## 6. 集成与清理

- [x] 6.1 确保 `AppRightPanel.vue` 中 TranslationProgress 的引用无需修改（保持相同的组件导出）
- [x] 6.2 验证新任务创建时 unified-right-panel 的自动切换行为仍正常
- [x] 6.3 移除旧的 TranslationProgress 代码和不再使用的 store actions（`setTranslationProgressActiveTab`、`setTranslationProgressAutoTabSwitching`、`setTranslationProgressTaskFolded`、`cleanupTranslationProgressTask`）
- [x] 6.4 运行 `bun run lint && bun run type-check` 确保无错误
