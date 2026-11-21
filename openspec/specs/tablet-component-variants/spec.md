# tablet-component-variants Specification

## Purpose
定义平板端组件变体：平板翻译进度面板、与新壳层协同的右侧面板，且不重复渲染手机端的底部抽屉。

## Requirements

### Requirement: 平板右侧面板与新壳层协同

`AppRightPanelTablet` MUST 与 `MainLayoutTablet` 的 `TabletNavRail` + `TabletSysBar` 协同：作为绝对定位覆盖层从右侧滑入，宽度 MUST 匹配 `useUiStore().rightPanelWidth`（上限 92vw），并接入 `useOverlayCloseStack`。右侧面板只承载 AI 助手；翻译进度由顶部信息条的任务中心提供。

#### Scenario: 覆盖层滑入动画

- **WHEN** `ui.rightPanelOpen === true`
- **THEN** `AppRightPanelTablet` MUST 以 `transform: translateX(0)` 呈现且动画时长约 220ms，背景 MUST 带遮罩用于关闭

#### Scenario: 关闭栈接入

- **WHEN** 用户按下 `Esc` 或点击遮罩
- **THEN** 面板 MUST 调用 `ui.closeRightPanel()`，并且 `useOverlayCloseStack` MUST 只处理此单一覆盖层（平板 `TabletNavRail` 本身不进入关闭栈）

#### Scenario: 不与 AI 助手 / 进度 sheet 重复

- **WHEN** 平板壳层已挂载 `AppRightPanelTablet`
- **THEN** `MainLayoutTablet` MUST NOT 同时挂载 `MobileChatSheet` 或任务中心的手机底部抽屉；这些 sheet MUST 仅在 `MainLayoutMobile` 中使用

#### Scenario: 右侧面板不再提供翻译进度

- **WHEN** 平板用户打开右侧面板
- **THEN** 面板 MUST 只显示 AI 助手，MUST NOT 提供翻译进度页签

### Requirement: 平板不重复 Mobile 底部抽屉

所有现有 `Mobile*Sheet` / `MobileBottomSheet` 组件 MUST NOT 在平板壳层中挂载或渲染；平板使用 `AppRightPanel` + `AdaptiveDialog` 提供等价交互。

#### Scenario: AdaptiveDialog 设备分派

- **WHEN** 任意页面通过 `AdaptiveDialog` 打开对话框并且 `useDeviceVariant() === 'tablet'`
- **THEN** `AdaptiveDialog` MUST 走桌面风格 `Dialog` 分支，而非 `MobileBottomSheet` 分支（与现有实现一致，不得在本次变更中改为 sheet 分支）

#### Scenario: 共享 Popover 组件直接复用

- **WHEN** 平板页面需要展示 Popover（如 `ChapterSettingsPopover` / `ChatSessionListPopover` / `CharacterPopover` / `TermPopover`）
- **THEN** 平板 MUST 直接复用现有组件，MUST NOT 创建 `*Tablet.vue` 副本
