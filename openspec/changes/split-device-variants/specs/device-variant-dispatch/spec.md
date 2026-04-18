## ADDED Requirements

### Requirement: 三变体分派模式

系统 MUST 为每个布局和每个页面采用"分派器 + 三变体"（Desktop / Tablet / Mobile）的组件结构，而不是在同一个 SFC 中使用 `v-if="isPhone"` 这类内联分支。

#### Scenario: 分派器按当前设备挂载对应变体

- **WHEN** 用户以任一设备宽度进入某个受该规范约束的布局或页面
- **THEN** 分派器 MUST 根据当前设备类型选择 Desktop、Tablet 或 Mobile 三者之一挂载，并且同一时间只挂载一个变体

#### Scenario: 每个受约束的 Surface 拥有全部三个变体文件

- **WHEN** 新增或修改受该规范约束的布局/页面
- **THEN** 代码库 MUST 同时包含该 Surface 的 Desktop、Tablet、Mobile 三个变体文件，以及一个 thin 分派器文件

### Requirement: Electron 始终渲染 Desktop 变体

系统 MUST 在检测到 Electron 运行环境时强制挂载 Desktop 变体，忽略窗口宽度对应的断点判断。

#### Scenario: Electron 窗口缩小到手机断点以下

- **WHEN** 应用运行于 Electron 环境，用户将窗口宽度缩小到手机断点以下
- **THEN** 分派器 MUST 继续挂载 Desktop 变体，不得切换到 Mobile 或 Tablet 变体

#### Scenario: Web 环境不受 Electron 覆盖影响

- **WHEN** 应用运行于浏览器（非 Electron）环境，窗口宽度处于手机断点
- **THEN** 分派器 MUST 挂载 Mobile 变体，不得因"Electron 总是 Desktop"规则而错误地挂载 Desktop

### Requirement: 分派规则集中定义

系统 MUST 将"Electron 覆盖 + 断点到变体"的选择规则实现在一个共享辅助中（composable 或组件），并要求所有分派器消费该辅助；不得在任一分派器中复制、重写该规则。

#### Scenario: 修改分派规则只需改一处

- **WHEN** 开发者需要调整变体选择规则（例如新增断点、调整 Electron 行为）
- **THEN** 该调整 MUST 只涉及修改单一共享辅助文件，任何分派器都不需要跟随修改

#### Scenario: 分派器不得内联重写规则

- **WHEN** 审查任一分派器文件
- **THEN** 该文件 MUST 通过共享辅助得到当前变体，不得包含 `isElectron ? ... : isPhone ? ...` 之类的手写条件链

### Requirement: 业务逻辑统一来自 Per-Surface Composable

系统 MUST 将每个受约束 Surface 的业务逻辑（状态、计算属性、异步加载、事件处理、侦听器、生命周期钩子）提取到该 Surface 专属的 composable 中；每个变体 MUST 通过调用同一个 composable 获取这些逻辑，不得重复声明或重新实现。

#### Scenario: 变体共享同一业务逻辑来源

- **WHEN** 同一 Surface 的 Desktop、Tablet、Mobile 变体需要访问该 Surface 的状态或动作
- **THEN** 每个变体 MUST 从同一个 per-surface composable 导入，并且这些状态或动作在代码库中只有一处定义

#### Scenario: 变体只包含视图相关代码

- **WHEN** 审查任一变体文件
- **THEN** 该文件 MUST 只包含：模板、device 特定样式、以及脚本中仅用于视图展示的局部 UI 状态（例如仅在该模板内使用的 popover 开关）；不得包含仅用于数据、存储或跨变体复用的业务逻辑

### Requirement: 运行时断点切换保持用户状态

系统 MUST 在用户运行时跨断点切换（如平板旋转）导致变体重新挂载时，保留用户当前的上下文和状态，不得因变体换挂载而重置。

#### Scenario: BookDetailsPage 的状态在变体切换后保留

- **WHEN** 用户在 BookDetailsPage 中选中了某一章节、打开了某个面板标签，并触发断点切换导致变体换挂载
- **THEN** 系统 MUST 在新变体中保留原先选中的章节、面板标签与滚动定位

#### Scenario: MainLayout 的壳层状态在变体切换后保留

- **WHEN** 用户在 MainLayout 中打开了侧边抽屉或右侧 AI 助手面板，并触发断点切换导致变体换挂载
- **THEN** 系统 MUST 在新变体中保留原先的抽屉/面板开合状态

### Requirement: 适用范围与例外

系统 MUST 对所有 layout 和所有 page 应用该分派模式，不得有例外；对于仅存在样式级设备差异（例如 `dialogStyle` 尺寸、Tailwind class 切换）而无模板结构分叉的叶组件，MAY 保留其内联 `isPhone` 判断。

#### Scenario: 所有 layout 与 page 应用该模式

- **WHEN** 代码库中新增或修改一个 layout 或 page
- **THEN** 该 layout 或 page MUST 采用分派器 + 三变体的结构，即使不同设备下当前视觉上接近

#### Scenario: 叶组件样式级差异允许内联判断

- **WHEN** 某组件不是 layout/page，且其设备差异仅体现在样式 token（颜色、间距、尺寸）或少量布尔标记上，不涉及模板结构分叉
- **THEN** 该组件 MAY 继续使用内联 `isPhone` 判断，不要求拆分为三变体

### Requirement: Tablet 变体占位实现

系统 MUST 在本变更中为每个受约束 Surface 提供 Tablet 变体文件；在尚未设计专属平板布局之前，Tablet 变体 MUST 以渲染 Desktop 变体的方式作为占位，以保持行为不变并为后续平板设计留好骨架。

#### Scenario: Tablet 变体渲染 Desktop 作为占位

- **WHEN** 用户在平板设备宽度下进入受约束 Surface
- **THEN** 分派器 MUST 挂载 Tablet 变体文件，且该文件当前 MUST 渲染对应的 Desktop 变体；用户看到的内容与在桌面宽度下一致

#### Scenario: 平板布局设计不在本变更范围

- **WHEN** 审查本变更产出
- **THEN** Tablet 变体 MUST 保持占位实现，不得在本变更中引入新的平板专属模板或样式

### Requirement: DRY — 共享 UI 片段与样式

系统 MUST 在多个变体间通过子组件复用共享标记块，并通过现有设计 token / Tailwind 工具类复用共享样式，不得在变体文件之间复制粘贴相同标记或相同样式值。

#### Scenario: 同一 Surface 变体间的共享标记块被抽取

- **WHEN** 同一 Surface 的两个或以上变体包含近乎相同的标记块（卡片、列表项、工具栏按钮集群等）
- **THEN** 该标记块 MUST 被抽取为共享子组件，变体通过组合该子组件与变体专属布局来构建自身模板

#### Scenario: 共享样式值不得重复硬编码

- **WHEN** 多个变体的 `<style>` 块需要使用相同的颜色、阴影、渐变或间距
- **THEN** 该值 MUST 通过 Tailwind 工具类或现有设计 token（例如 `--white-opacity-*`、Tsukuyomi 调色、`tsukuyomi-blue`）引用，不得在多个变体中硬编码相同的十六进制色值或渐变
