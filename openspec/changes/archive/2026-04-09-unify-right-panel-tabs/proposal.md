## Why

书籍详情页（BookDetailsPage）当前存在双右侧面板并存的问题：翻译进度面板作为章节内容区的分栏占据中间区域，AI 聊天面板（AppRightPanel）固定在全局最右侧，两者合计挤压章节内容可读区域。将二者合并为一个带 Tab 切换的统一右侧面板，可显著提升工作区空间利用率，同时使翻译进度跨页面可见。

## What Changes

- **新增** AppRightPanel 顶层 Tab 切换：「AI 助手」和「翻译进度」两个标签
- **移入** TranslationProgress 组件到 AppRightPanel 的「翻译进度」Tab 内
- **移除** BookDetailsPage 中章节内容区的分栏布局（split layout），章节内容恢复全宽显示
- **新增** `AIProcessingTask.progress` 字段，将翻译段落进度提升到全局 store，供右侧面板直接读取
- **新增** `uiStore.activeRightTab` 状态，翻译任务开始时自动切换到「翻译进度」Tab
- **修改** 取消逻辑：TranslationProgress 直接调用 `aiProcessingStore.stopTask()`，BookDetailsPage 通过 watch 检测任务 cancelled 状态来更新局部 UI 状态，移除 emit('cancel') 链路
- **保持** 翻译进度在所有页面可见（包括非 BookDetailsPage 页面）

## Capabilities

### New Capabilities

- `unified-right-panel`: 统一右侧面板，支持 AI 助手与翻译进度的 Tab 切换、自动跳转及状态徽章提示

### Modified Capabilities

（无现有 spec 的需求级别变更）

## Impact

- `src/layouts/MainLayout.vue` — 无结构变更，AppRightPanel 已在此处
- `src/components/layout/AppRightPanel.vue` — 加顶层 Tab，嵌入 TranslationProgress
- `src/components/novel/TranslationProgress.vue` — 移除 props 依赖，改从 store 直接读取；移除 emit('cancel')
- `src/stores/ai-processing.ts` — `AIProcessingTask` 接口新增 `progress?` 字段
- `src/stores/ui.ts` — 新增 `activeRightTab` 状态与切换 action
- `src/composables/book-details/useChapterTranslation.ts` — 改用 store 更新进度；加 watch 处理 cancelled 状态
- `src/pages/BookDetailsPage.vue` — 移除 split 布局、TranslationProgress 引用及 toggle 相关逻辑
