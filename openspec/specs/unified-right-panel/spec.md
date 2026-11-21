# unified-right-panel Specification

## Purpose
定义翻译进度在右侧面板之外的可见性与状态传递：进度经顶部任务中心跨页面可见、经全局 store 传递，任务在任务中心结束后书籍详情页的局部状态同步更新。右侧面板只承载 AI 助手。

## Requirements

### Requirement: 翻译进度跨页面持续可见

翻译进度 SHALL 在所有页面可访问，不限于书籍详情页，使用户在导航到其他页面时仍能查看任务进行状态；入口为顶部系统条的任务中心，而非右侧面板。

#### Scenario: 从书籍详情页导航到其他页面后查看进度

- **WHEN** 翻译任务正在进行中，用户导航到非书籍详情页（如 AI 配置页、帮助页）
- **THEN** 用户 MUST 能够通过顶部系统条的任务中心查看所有运行中和排队中的任务状态

#### Scenario: 非书籍详情页的翻译进度显示完整信息

- **WHEN** 用户在非书籍详情页打开任务中心且有运行中的翻译任务
- **THEN** 系统 MUST 显示任务类型、书名、目标章节标题、当前段落进度（current/total）及工作流状态

### Requirement: 翻译进度数据通过全局 store 传递

翻译段落进度（current、total、message）SHALL 通过 `AIProcessingTask.progress` 字段存储在 `aiProcessingStore`，使任何组件无需依赖 BookDetailsPage 的局部状态即可读取进度。

#### Scenario: 翻译进行中进度字段实时更新

- **WHEN** 翻译任务中每个段落翻译完成
- **THEN** 系统 MUST 将对应 `AIProcessingTask.progress.current` 和 `progress.total` 更新到最新值

#### Scenario: 翻译完成后进度字段保持最终值

- **WHEN** 翻译任务结束（status 变为 end、error 或 cancelled）
- **THEN** `progress` 字段 MUST 保持最后一次更新的值，直到任务被手动清理

### Requirement: 取消任务后 BookDetailsPage 局部 UI 状态自动同步

当翻译 / 润色 / 校对任务在任务中心被停止、移出或以其他方式结束时，BookDetailsPage SHALL 自动更新局部 UI 状态（如按钮禁用状态、章节翻译标志、正在处理的段落标记），无需依赖组件间事件链路。

#### Scenario: 从翻译进度面板取消任务后按钮状态更新

- **WHEN** 用户在任务中心停止某章节的运行中任务，且 BookDetailsPage 当前打开该章节
- **THEN** 系统 MUST 将对应章节的翻译/润色/校对状态标志重置，相关操作按钮恢复可用

#### Scenario: 从任务中心移出排队项后按钮状态更新

- **WHEN** 用户在任务中心移出某章节的排队项，且 BookDetailsPage 当前打开该章节
- **THEN** 阅读页 MUST 不再显示该章节处于排队中，相关操作按钮恢复可用

#### Scenario: 章节内容区不再包含翻译进度分栏

- **WHEN** 用户在书籍详情页查看任意章节
- **THEN** 章节内容区域 MUST 占据中间内容区的全部宽度，不存在翻译进度分栏布局
