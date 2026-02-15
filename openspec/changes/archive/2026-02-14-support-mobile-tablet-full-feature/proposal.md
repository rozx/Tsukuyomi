## Why

当前应用以桌面三栏与固定宽度交互为主，手机与平板场景下存在明显可用性问题（布局溢出、入口不可达、触控操作缺失），影响核心翻译流程。现在需要在不删减任何功能的前提下提供移动端与平板端完整可用体验，以支持跨设备连续工作。

## What Changes

- 引入按断点切换的应用壳层布局（手机/平板/桌面），保留现有全部功能入口与能力。
- 重构书籍详情工作区信息架构，在小屏幕下通过模式切换与抽屉/面板编排承载完整功能（目录、正文、术语、角色、记忆、翻译进度、AI 助手）。
- 建立统一的弹层适配策略，使 Dialog/Popover 在不同断点具备一致可用的交互形态（如全屏、底部面板、常规弹窗）。
- 为仅鼠标友好的交互提供触控等价路径（如章节排序、面板调整、快捷操作可见入口），避免功能缺失。
- 补齐关键页面（书籍列表、AI 模型管理、帮助页）在手机与平板下的完整操作闭环与信息可读性。
- 无后端 API 变更，无数据格式 **BREAKING** 变更。

## Capabilities

### New Capabilities

- `responsive-app-shell`: 定义应用级响应式壳层行为，包括头部、侧边栏、右侧助手面板在手机/平板/桌面的布局与入口一致性。
- `responsive-book-details-workspace`: 定义书籍详情页在小屏设备上的全功能工作区编排与导航规则，确保翻译主流程与高级功能全部可达。
- `adaptive-overlay-system`: 定义全局 Dialog/Popover 等弹层在各断点下的统一展示与交互规范，避免固定宽度导致不可用。
- `touch-first-operability`: 定义触控优先交互要求，为现有鼠标导向能力提供等价操作路径并保障效率。

### Modified Capabilities

- `help-page`: 更新帮助页在手机/平板下的导航与目录交互要求，确保文档浏览能力完整保留且可操作。

## Impact

- 前端壳层与布局组件：`src/layouts/MainLayout.vue`、`src/components/layout/AppHeader.vue`、`src/components/layout/AppSideMenu.vue`、`src/components/layout/AppRightPanel.vue`、`src/stores/ui.ts`。
- 书籍详情与相关子组件：`src/pages/BookDetailsPage.vue`、`src/components/novel/*`（工具栏、目录、正文、进度、术语/角色/记忆面板）。
- 页面级适配：`src/pages/BooksPage.vue`、`src/pages/AIPage.vue`、`src/pages/HelpPage.vue`。
- 弹层体系：`src/components/dialogs/*` 与 `src/components/*Popover*`。
- 测试与验收：需增加多断点 UI 回归与关键流程验证（手机/平板/桌面）。
- 后端与数据存储：无接口与存储结构变更。
