## ADDED Requirements

### Requirement: 平板翻译进度面板

`TranslationProgressTablet` MUST 复用 `TranslationProgressDesktop` 的子组件组合（`TaskSwitcher` + `TaskStatusBar` + `TaskTodos` + `TaskStream` + `TaskActionBar` + `TaskEmptyState`），因为这些子组件已在 `AppRightPanel` 的固定宽度容器内稳定工作。MUST NOT 为平板创建新的 `Task*` 子组件副本。

#### Scenario: 复用桌面组合

- **WHEN** 设备变体为 `tablet` 且用户打开翻译进度面板
- **THEN** `AppRightPanelTablet` MUST 在 `activeRightTab === 'progress'` 时挂载 `TranslationProgressTablet`，后者 MUST 渲染 `TaskSwitcher / TaskStatusBar / TaskTodos / TaskStream / TaskActionBar / TaskEmptyState` 组合，数据 MUST 通过 `useTranslationProgressPanel()` 读取，MUST NOT 新增 store 字段

#### Scenario: 任务操作绑定现有 action

- **WHEN** 用户在平板翻译进度面板点击停止 / 清除 / 切换 chapter 过滤器
- **THEN** 点击 MUST 调用 `useTranslationProgressPanel()` 暴露的 `stopTask` / `clearCompletedTasks` / `toggleChapterFilter` 等现有 action，MUST NOT 引入新的 store 方法

#### Scenario: 面板适配平板宽度

- **WHEN** `AppRightPanelTablet` 以覆盖层形式展示翻译进度
- **THEN** `TranslationProgressTablet` 样式 MUST 保证内部滚动与截断在 `min(92vw, ui.rightPanelWidth)` 约束的面板内正确呈现（MAY 通过 container padding 微调）

### Requirement: 平板右侧面板与新壳层协同

`AppRightPanelTablet` MUST 与 `MainLayoutTablet` 的 `TabletNavRail` + `TabletSysBar` 协同：作为绝对定位覆盖层从右侧滑入，宽度 MUST 匹配 `useUiStore().rightPanelWidth`（上限 92vw），并接入 `useOverlayCloseStack`。

#### Scenario: 覆盖层滑入动画

- **WHEN** `ui.rightPanelOpen === true`
- **THEN** `AppRightPanelTablet` MUST 以 `transform: translateX(0)` 呈现且动画时长约 220ms，背景 MUST 带遮罩用于关闭

#### Scenario: 关闭栈接入

- **WHEN** 用户按下 `Esc` 或点击遮罩
- **THEN** 面板 MUST 调用 `ui.closeRightPanel()`，并且 `useOverlayCloseStack` MUST 只处理此单一覆盖层（平板 `TabletNavRail` 本身不进入关闭栈）

#### Scenario: 不与 AI 助手 / 进度 sheet 重复

- **WHEN** 平板壳层已挂载 `AppRightPanelTablet`
- **THEN** `MainLayoutTablet` MUST NOT 同时挂载 `MobileChatSheet` 或 `MobileProgressSheet`；这两张 sheet MUST 仅在 `MainLayoutMobile` 中使用

### Requirement: 平板不重复 Mobile 底部抽屉

所有现有 `Mobile*Sheet` / `MobileBottomSheet` 组件 MUST NOT 在平板壳层中挂载或渲染；平板使用 `AppRightPanel` + `AdaptiveDialog` 提供等价交互。

#### Scenario: AdaptiveDialog 设备分派

- **WHEN** 任意页面通过 `AdaptiveDialog` 打开对话框并且 `useDeviceVariant() === 'tablet'`
- **THEN** `AdaptiveDialog` MUST 走桌面风格 `Dialog` 分支，而非 `MobileBottomSheet` 分支（与现有实现一致，不得在本次变更中改为 sheet 分支）

#### Scenario: 共享 Popover 组件直接复用

- **WHEN** 平板页面需要展示 Popover（如 `ChapterSettingsPopover` / `ChatSessionListPopover` / `CharacterPopover` / `TermPopover`）
- **THEN** 平板 MUST 直接复用现有组件，MUST NOT 创建 `*Tablet.vue` 副本
