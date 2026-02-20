## ADDED Requirements

### Requirement: UI 工作流状态支持 preparing

系统 MUST 在 AI 处理任务工作流状态（`AIProcessingTask.workflowStatus`）中支持 `preparing`，并提供与其语义一致的 UI 展示。

#### Scenario: preparing 显示为准备阶段

- **GIVEN** 某任务 `workflowStatus="preparing"`
- **WHEN** UI 渲染任务状态
- **THEN** UI MUST 显示“准备阶段”（或等价文案）
- **AND THEN** UI MUST 使用与 `planning`、`working` 可区分的状态样式

### Requirement: 翻译相关任务流程提示展示包含 preparing

系统 MUST 在翻译相关任务流程提示中展示包含 `preparing` 的新顺序。

#### Scenario: translation 流程提示包含 preparing 和 review

- **GIVEN** 当前任务类型为 "translation"
- **WHEN** UI 展示任务流程说明
- **THEN** UI MUST 显示 `planning → preparing → working → review → end`

#### Scenario: polish/proofreading 流程提示包含 preparing 且不包含 review

- **GIVEN** 当前任务类型为 "polish" 或 "proofreading"
- **WHEN** UI 展示任务流程说明
- **THEN** UI MUST 显示 `planning → preparing → working → end`
- **AND THEN** UI MUST 不显示 `review` 作为该任务流程阶段

### Requirement: 工作流展示不保留旧流程兼容映射

系统 MUST 直接使用新工作流状态定义，不保留旧流程 `planning → working` 的兼容展示映射。

#### Scenario: 旧流程顺序不会作为合法流程展示

- **GIVEN** UI 渲染翻译相关任务的流程说明
- **WHEN** 系统读取流程定义
- **THEN** UI MUST 不展示 `planning → working` 作为合法顺序
- **AND THEN** UI MUST 以包含 `preparing` 的新流程作为唯一展示来源
