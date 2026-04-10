## Why

当前翻译进度面板（TranslationProgress.vue，2800+ 行）采用多任务卡片堆叠 + 三标签页（思考/输出/待办）的设计，信息密度高但视觉层级扁平，译者在多任务并行时难以快速聚焦当前关注的任务。参考 Cursor IDE 的单任务聚焦面板模式，重新设计为一次只显示一个任务、通过下拉切换器在任务间导航的交互模式。

## What Changes

- 移除多任务卡片堆叠布局，改为**单任务全屏视图** + **下拉任务切换器**
- 移除三标签页（思考过程/输出内容/待办事项），改为**统一流式视图**：待办固定在顶部，思考+工具调用+输出在同一滚动区域中线性呈现
- 工具调用从卡片嵌套样式（5种颜色状态 × 调用/结果两种类型，~550行 CSS）简化为**内联单行格式**（`▸ toolName → result`）
- 任务切换器支持**活动指示器**：当非当前查看的任务有新活动时显示通知圆点
- 重构组件结构：将 2800 行单文件拆分为多个子组件

## Capabilities

### New Capabilities
- `translation-progress-panel`: 翻译进度面板的完整重新设计——单任务视图、下拉切换器、统一流式内容、内联工具调用

### Modified Capabilities
- `unified-right-panel`: 右侧面板需适配新的翻译进度面板组件接口

## Impact

- **组件**: `TranslationProgress.vue` 完全重写，拆分为多个子组件
- **Store**: `book-details.ts` 中的 `translationProgress` UI 状态需调整（移除 activeTab/autoTabSwitching，新增 selectedTaskId/unseenActivity）
- **样式**: 大幅削减 CSS（预计从 ~1050 行降至 ~300 行）
- **无破坏性变更**: 不影响数据模型、AI 处理流程或其他页面
