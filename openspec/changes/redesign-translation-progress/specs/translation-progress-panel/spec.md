## ADDED Requirements

### Requirement: 单任务聚焦视图

翻译进度面板 SHALL 一次只显示一个任务的完整内容，通过任务切换器在不同任务之间导航。

#### Scenario: 默认选中最近活跃任务

- **WHEN** 翻译进度面板首次打开，且存在活跃任务
- **THEN** 系统 MUST 自动选中最近启动的活跃任务

#### Scenario: 新任务创建时自动切换

- **WHEN** 新的翻译/润色/校对任务被创建
- **THEN** 系统 MUST 自动将视图切换到该新任务

#### Scenario: 无任务时显示空状态

- **WHEN** 没有任何翻译相关任务
- **THEN** 系统 MUST 显示空状态提示

### Requirement: 下拉任务切换器

面板顶部 SHALL 提供下拉选择器，列出所有翻译相关任务，支持在任务间快速切换。

#### Scenario: 切换器显示当前任务摘要

- **WHEN** 面板可见且有已选中任务
- **THEN** 切换器 MUST 显示：状态指示点（活跃/已完成）、任务类型（翻译/润色/校对）、章节标题、当前任务序号（如 1/3）

#### Scenario: 展开下拉列表

- **WHEN** 用户点击切换器
- **THEN** 系统 MUST 显示所有翻译相关任务的列表，每项包含：状态指示点、任务类型、章节标题、耗时、状态标签（进行中/已完成/错误/已取消）

#### Scenario: 选择其他任务

- **WHEN** 用户在下拉列表中点击某个任务
- **THEN** 系统 MUST 切换到该任务的完整视图，并关闭下拉列表

#### Scenario: 仅本章过滤

- **WHEN** 用户启用"仅本章"过滤
- **THEN** 下拉列表 MUST 仅显示与当前选中章节关联的任务

### Requirement: 未读活动通知

当用户正在查看任务 A，而任务 B 有新的思考/输出更新时，系统 SHALL 在切换器中为任务 B 显示通知指示。

#### Scenario: 非当前任务有新活动

- **WHEN** 非当前查看的任务收到新的 thinkingMessage 或 outputContent 更新
- **THEN** 切换器下拉列表中该任务 MUST 显示橙色通知圆点

#### Scenario: 切换到有通知的任务

- **WHEN** 用户切换到有未读通知的任务
- **THEN** 系统 MUST 清除该任务的通知指示

### Requirement: 任务状态栏

每个任务视图的顶部 SHALL 显示紧凑的状态信息栏。

#### Scenario: 活跃任务状态栏

- **WHEN** 当前任务处于 thinking 或 processing 状态
- **THEN** 状态栏 MUST 显示：模型名称、已用时间（实时更新）、进度条（带分块计数如"3/10 块"和百分比）

#### Scenario: 已完成任务状态栏

- **WHEN** 当前任务已完成
- **THEN** 状态栏 MUST 显示：模型名称、总耗时、满进度条、"完成"标签

### Requirement: 待办事项区域

任务视图 SHALL 在状态栏下方包含可折叠的待办事项区域，始终固定在滚动流上方。

#### Scenario: 显示待办列表

- **WHEN** 当前任务有关联的待办事项
- **THEN** 系统 MUST 显示待办列表，每项包含复选框和文本，并显示待办计数

#### Scenario: 折叠待办区域

- **WHEN** 用户点击待办区域标题
- **THEN** 系统 MUST 折叠/展开待办列表，折叠状态跨任务切换保持

#### Scenario: 无待办事项

- **WHEN** 当前任务没有关联的待办事项
- **THEN** 待办区域 MUST 不显示（不占用空间）

### Requirement: 统一流式内容区域

任务视图的主体 SHALL 为单一可滚动区域，按时间顺序线性展示思考内容、工具调用和输出内容。

#### Scenario: 思考内容实时流式显示

- **WHEN** 任务正在生成思考内容
- **THEN** 流式区域 MUST 实时追加文本，并在末尾显示闪烁光标

#### Scenario: 翻译块分隔符

- **WHEN** 思考消息中包含翻译块分隔标记（如 `[=== 翻译块 2/10 ===]`）
- **THEN** 系统 MUST 渲染为视觉分隔线，显示块序号

#### Scenario: 自动滚动

- **WHEN** 自动滚动已启用且有新内容追加
- **THEN** 流式区域 MUST 自动滚动到底部

#### Scenario: 任务切换时保持滚动位置

- **WHEN** 用户从任务 A 切换到任务 B，再切换回任务 A
- **THEN** 任务 A 的滚动位置 MUST 恢复到切换前的位置

### Requirement: 内联工具调用显示

工具调用和结果 SHALL 以紧凑的内联格式显示在流式内容中，而非卡片嵌套。

#### Scenario: 已完成的工具调用

- **WHEN** 工具调用已完成并有结果
- **THEN** 系统 MUST 显示为单行：`▸ toolName → result`，使用等宽字体的工具名和次要颜色的结果文本

#### Scenario: 运行中的工具调用

- **WHEN** 工具调用正在执行
- **THEN** 系统 MUST 显示为：`▸ toolName` 后跟旋转加载指示器

#### Scenario: 查看工具调用详情

- **WHEN** 用户点击某个工具调用行
- **THEN** 系统 MUST 显示 Popover，包含工具调用参数和完整结果内容

### Requirement: 底部操作栏

任务视图底部 SHALL 有固定的操作栏。

#### Scenario: 活跃任务操作栏

- **WHEN** 当前任务处于活跃状态（thinking/processing）
- **THEN** 操作栏 MUST 显示"仅本章"过滤标签和"停止"按钮

#### Scenario: 已完成任务操作栏

- **WHEN** 当前任务已结束（end/error/cancelled）
- **THEN** 操作栏 MUST 显示"仅本章"过滤标签和"清除已完成"按钮

### Requirement: 组件拆分

TranslationProgress SHALL 被拆分为多个子组件，主组件作为容器编排子组件。

#### Scenario: 主组件职责

- **WHEN** TranslationProgress 组件被渲染
- **THEN** 主组件 MUST 仅负责：任务列表管理、当前任务选择、子组件编排。不包含工具调用解析或滚动管理逻辑。
