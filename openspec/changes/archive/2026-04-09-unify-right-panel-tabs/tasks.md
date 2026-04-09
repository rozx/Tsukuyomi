## 1. Store 层扩展

- [x] 1.1 在 `src/stores/ai-processing.ts` 的 `AIProcessingTask` 接口新增可选字段 `progress?: { current: number; total: number; message: string }`
- [x] 1.2 确认 `saveThinkingProcessToDB` 序列化逻辑覆盖新 `progress` 字段（加入条件展开）
- [x] 1.3 在 `src/stores/ui.ts` 新增 `activeRightTab: 'chat' | 'progress'` 状态（默认 `'chat'`）及 `setActiveRightTab(tab)` action

## 2. 翻译 Composable 适配

- [x] 2.1 在 `useChapterTranslation.ts` 的翻译进度更新处（原更新 `state.progress`）同步调用 `aiProcessingStore.updateTask(taskId, { progress: { current, total, message } })`，保持已有节流逻辑
- [x] 2.2 对润色（polish）和校对（proofreading）的进度更新做同样处理
- [x] 2.3 在翻译/润色/校对任务创建后调用 `uiStore.setActiveRightTab('progress')` 自动切换 Tab
- [x] 2.4 在 `useChapterTranslation.ts` 的 `watch(aiProcessingStore.activeTasks)` 中增加检测：当对应章节的任务状态变为 `cancelled` 时，更新局部 `state.isTranslating / isPolishing / isProofreading = false` 及 `state.progress` 重置（替代原 emit('cancel') 链路）

## 3. TranslationProgress 组件重构

- [x] 3.1 移除 `defineProps`（删除 `isTranslating`, `isPolishing`, `isProofreading`, `progress` 四个 prop）
- [x] 3.2 将 `isTranslating/isPolishing/isProofreading` 改为从 `aiProcessingStore.activeTasks` 派生（过滤 type + 状态 thinking/processing）
- [x] 3.3 将 `progressTaskId` 计算逻辑中对 `props.progress` 和 `props.isTranslating` 等的引用，改为直接读取 `task.progress`
- [x] 3.4 将进度条数据（current/total/message）改为从 `currentActiveTask.progress` 读取
- [x] 3.5 移除 `defineEmits` 中的 `cancel` emit；`stopTask` 函数只调 `aiProcessingStore.stopTask(task.id)` 即可（不再 emit）
- [x] 3.6 移除因 props 引入的 `progressTaskId` 中对 `props.isProofreading / isPolishing / isTranslating` 的类型依赖，改为纯 store 推导

## 4. AppRightPanel 集成翻译进度 Tab

- [x] 4.1 引入 PrimeVue Tabs/TabList/Tab/TabPanels/TabPanel 组件（若 AppRightPanel 内未引入），或使用自定义 tab 按钮
- [x] 4.2 添加顶层 Tab 切换 UI：「AI 助手」和「翻译进度」两个 Tab
- [x] 4.3 Tab 激活状态绑定到 `uiStore.activeRightTab`，点击 Tab 调用 `uiStore.setActiveRightTab()`
- [x] 4.4 在「翻译进度」Tab 面板内引入并渲染 `<TranslationProgress />`（无 props）
- [x] 4.5 将原来的聊天内容（ChatMessageList、输入框等）包裹在「AI 助手」Tab 面板内
- [x] 4.6 当有活跃翻译任务（`aiProcessingStore.hasActiveTasks` 且 type 为翻译/润色/校对）时，在「翻译进度」Tab 上显示数字角标（badge）

## 5. BookDetailsPage 清理

- [x] 5.1 移除 `TranslationProgress` 的 import 及 `<TranslationProgress>` 模板引用
- [x] 5.2 移除章节内容区的 split 布局（`split-layout-container`、`chapter-content-split-layout`、`translation-progress-panel` 相关 div 及 class），章节内容区改为全宽单列
- [x] 5.3 移除 `showTranslationProgress` computed、`toggleTranslationProgress` 函数及所有相关模板绑定（`:show-translation-progress`、`@toggle-translation-progress` 等）
- [x] 5.4 移除 ChapterToolbar 中 `show-translation-progress` / `can-show-translation-progress` 相关 prop 传递（如 ChapterToolbar 仍需这些 prop 用于其他功能，保留；否则一并清理）
- [x] 5.5 移除移动端 workspaceMode `'progress'` 相关逻辑（`switchWorkspaceMode('progress')`、`workspace-switch-btn` 进度按钮等），若移动端翻译进度通过右侧面板 overlay 访问，确保入口仍可用
- [x] 5.6 移除相关 CSS 样式（`.translation-progress-panel`、`.translation-progress-panel-inner`、`.page-container-split-active`、`.split-layout-active`、`.panel-with-split` 等）

## 6. 验证与收尾

- [x] 6.1 运行 `bun run lint && bun run type-check` 确认无类型错误和 lint 错误
- [x] 6.2 手动验证：桌面端翻译章节 → 右侧面板自动切换到「翻译进度」→ 进度实时更新 → 完成后可手动切回「AI 助手」
- [x] 6.3 手动验证：从右侧面板取消任务 → BookDetailsPage 按钮状态恢复（若当前在 BookDetailsPage）
- [x] 6.4 手动验证：切换到其他页面（如 AI 配置页）→ 右侧面板「翻译进度」Tab 仍显示活跃任务
- [x] 6.5 手动验证：移动端可通过右侧面板 overlay 访问翻译进度
