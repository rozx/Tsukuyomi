# responsive-app-shell Specification

## Purpose
定义按断点驱动的应用壳层布局，保证各尺寸下所有功能入口可达、切换布局时上下文连续，壳层业务逻辑统一抽取。

## Requirements

### Requirement: 断点驱动的应用壳层布局

系统 MUST 根据设备断点切换应用壳层结构，并保持核心功能区域可见或可一跳到达；壳层的 phone / tablet / desktop 三种结构 MUST 以独立的变体组件承载，由一个薄分派器根据当前设备类型挂载其一，不得通过在同一 SFC 内部使用 `v-if="isPhone"` 等内联分支实现。

#### Scenario: 手机端壳层切换

- **WHEN** 视口宽度小于平板断点并进入任意主页面
- **THEN** 系统 MUST 使用单主视图布局，并提供可展开的导航入口与助手入口

#### Scenario: 平板端壳层切换

- **WHEN** 视口宽度处于平板断点范围
- **THEN** 系统 MUST 使用双栏或可折叠双栏布局，主内容区始终优先保留

#### Scenario: 桌面端壳层保持

- **WHEN** 视口宽度达到桌面断点
- **THEN** 系统 MUST 保持现有桌面三栏工作模式并兼容既有交互

#### Scenario: 壳层三种结构独立承载

- **WHEN** 审查壳层相关代码
- **THEN** 代码库 MUST 为 MainLayout 提供独立的 Desktop、Tablet、Mobile 变体文件，以及一个薄分派器文件；任一变体内部不得包含针对其他设备类型的 `v-if` 结构性分支

#### Scenario: Electron 环境强制桌面壳层

- **WHEN** 应用运行于 Electron 环境，无论窗口宽度如何变化
- **THEN** 分派器 MUST 始终挂载 Desktop 壳层变体，不得切换到 Mobile 或 Tablet 壳层

### Requirement: 全功能入口一致可达

系统 MUST 在手机、平板、桌面下提供等价的功能入口，且不得因布局变化隐藏能力。

#### Scenario: 侧边功能入口在手机端可达

- **WHEN** 用户在手机端需要访问书籍列表、设置或帮助
- **THEN** 系统 MUST 通过抽屉或导航面板提供完整入口集合

#### Scenario: 右侧助手入口在小屏可达

- **WHEN** 用户在手机或平板端需要打开 AI 助手或右侧工具面板
- **THEN** 系统 MUST 提供显式按钮触发对应面板，且不要求桌面专属悬停操作

### Requirement: 布局切换时上下文连续

系统 MUST 在断点切换、横竖屏切换时保留用户当前上下文，避免流程中断。

#### Scenario: 横竖屏切换保持页面上下文

- **WHEN** 用户在章节翻译过程中发生屏幕方向变化
- **THEN** 系统 MUST 保持当前书籍、章节与编辑定位，不得回退到默认页

### Requirement: 壳层业务逻辑统一提取

系统 MUST 将 MainLayout 的壳层业务逻辑（侧边抽屉开合、右侧面板开合、全局 toast 监听、AI 任务状态侦听、自动同步启停、语义检索预热等）提取到专属的 composable 中；MainLayout 的 Desktop / Tablet / Mobile 变体 MUST 通过调用同一 composable 获取这些能力，不得在各变体中重复声明。

#### Scenario: 壳层逻辑在一处定义

- **WHEN** 开发者需要修改侧边抽屉或右侧面板相关逻辑
- **THEN** 该修改 MUST 只涉及壳层专属 composable，无需同步修改任一壳层变体文件

#### Scenario: 壳层状态跨变体切换保留

- **WHEN** 用户在 Electron 之外环境下将窗口在手机、平板、桌面断点之间切换，导致壳层变体换挂载
- **THEN** 当前侧边抽屉、右侧面板、Toast 历史、AI 任务侦听等壳层状态 MUST 保持不变
