# translation-progress-panel Specification

## Purpose
定义章节任务详情的内容构件：任务中心中展开的任务行与手机全屏详情所用的状态栏、待办区、统一流式内容区、内联工具调用显示，以及未读活动提醒。任务列表、分组与队列操作由 header-task-center 定义。

## Requirements

### Requirement: 未读活动通知

当用户正在查看任务 A 的详情，而任务 B 有新的思考/输出更新时，系统 SHALL 在任务中心列表中为任务 B 显示通知指示。

#### Scenario: 非当前任务有新活动

- **WHEN** 非当前打开详情的任务收到新的 thinkingMessage 或 outputContent 更新
- **THEN** 任务中心列表中该任务的行 MUST 显示橙色通知圆点

#### Scenario: 切换到有通知的任务

- **WHEN** 用户打开有未读通知的任务的详情
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
