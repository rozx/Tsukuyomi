## Context

当前 `TranslationProgress.vue` 是一个 2800+ 行的单文件组件，包含：
- 多任务卡片堆叠布局（最多显示 10 个任务）
- 每个任务内嵌三标签页（思考过程/输出内容/待办事项）
- 工具调用以彩色卡片形式呈现（5 种状态 × 2 种类型 = ~550 行 CSS）
- 复杂的自动标签页切换逻辑、滚动管理、节流缓存

面板位于 `AppRightPanel.vue` 的 `progress` 标签页中，占据右侧栏全部高度。

UI 状态持久化在 `book-details.ts` store 的 `translationProgress` 字段中（localStorage）。

HTML mockup 已在 `mockups/translation-progress-redesign.html` 中完成验证。

## Goals / Non-Goals

**Goals:**
- 单任务聚焦视图，通过下拉切换器在 2-3 个并行任务间导航
- 统一流式内容：待办固定顶部，思考+工具调用+输出在同一滚动流中
- 内联工具调用（`▸ name → result`），替代卡片嵌套
- 将单文件拆分为可维护的子组件
- 大幅削减 CSS 量

**Non-Goals:**
- 不改变 AI 处理流程或 `ai-processing` store 的任务数据结构
- 不改变数据模型（Novel/Chapter/Paragraph/Translation）
- 不重新设计右侧面板的标签页切换机制
- 不添加新的功能特性（如任务搜索、任务重试）

## Decisions

### 1. 单任务视图 + 下拉切换器

**选择**: 一次只渲染一个任务的完整视图，顶部下拉选择器列出所有任务。

**替代方案**:
- Tab 栏：侧边栏宽度有限，章节标题会溢出
- 圆点+箭头导航：需要额外点击，不如下拉直观
- 保持卡片堆叠但简化：无法解决核心的信息过载问题

**理由**: 下拉选择器紧凑、可显示完整章节标题、任务数量无上限。参考 Cursor 的 chat session 切换模式。

### 2. 统一流式视图（移除标签页）

**选择**: 移除思考/输出/待办三个标签页，改为：
- 待办事项作为可折叠区域固定在进度条下方
- 思考内容、工具调用、输出内容在同一个滚动容器中按时间线性排列

**理由**: 译者需要同时关注待办和思考过程，标签页切换打断注意力流。自动标签页切换逻辑（~100 行）可以完全移除。

### 3. 内联工具调用

**选择**: 工具调用 + 结果合并为一行：`▸ searchMemory → 找到3条记忆`。运行中状态显示 spinner。点击可展开详情（Popover 保留）。

**替代方案**: 保留卡片但简化颜色 → 仍然视觉噪音过大。

**理由**: 译者关心的是"AI 做了什么、得到了什么"，不是技术细节。内联格式信噪比更高。

### 4. 组件拆分策略

```
TranslationProgress.vue          (容器，~150 行)
├── TaskSwitcher.vue              (下拉切换器，~120 行)
├── TaskStatusBar.vue             (模型名/时间/进度条，~80 行)
├── TaskTodos.vue                 (待办列表，~100 行)
├── TaskStream.vue                (统一流内容，~200 行)
│   ├── StreamToolCall.vue        (内联工具调用，~60 行)
│   └── StreamChunkSeparator.vue  (翻译块分隔符，~30 行)
└── TaskActionBar.vue             (底部操作栏，~50 行)
```

思考消息格式化逻辑（当前 ~200 行）提取为 `composables/useThinkingFormatter.ts`。

### 5. Store 状态调整

`book-details.ts` 中 `translationProgress` 字段变更：

```typescript
// 移除
autoTabSwitchingEnabled: Record<string, boolean>;  // 不再需要
activeTab: Record<string, string>;                  // 不再有标签页
taskFolded: Record<string, boolean>;                // 不再有折叠

// 保留
autoScrollEnabled: Record<string, boolean>;
showOnlyCurrentChapter: boolean;

// 新增
selectedTaskId: string | null;        // 当前查看的任务 ID
todoCollapsed: boolean;               // 待办区域折叠状态
unseenActivity: Record<string, boolean>;  // 非当前任务的未读活动
```

### 6. 未读活动通知

当 AI processing store 中的任务有新的 thinking/output 更新，且该任务不是当前 `selectedTaskId` 时，设置 `unseenActivity[taskId] = true`。切换到该任务时清除。在下拉选择器中显示为橙色小圆点。

## Risks / Trade-offs

- **思考消息解析逻辑复杂** → 提取到独立 composable 中，保持解析逻辑不变，只改变渲染方式
- **滚动状态在任务切换时丢失** → 每个任务独立保存 scrollTop 位置，切换时恢复
- **输出内容混入思考流可能不易区分** → 输出内容使用不同背景色和左边框标识
- **旧的 localStorage 状态格式不兼容** → 在 `loadStateFromStorage` 中做迁移兼容，旧字段保留但不再使用
