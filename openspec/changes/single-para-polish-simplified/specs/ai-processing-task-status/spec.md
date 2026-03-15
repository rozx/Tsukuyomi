## MODIFIED Requirements

### Requirement: 翻译相关任务流程提示展示包含 preparing

系统 MUST 在翻译相关任务流程提示中展示包含 `preparing` 的新顺序。

#### Scenario: translation 流程提示包含 preparing 和 review

- **GIVEN** 当前任务类型为 "translation"
- **WHEN** UI 展示任务流程说明
- **THEN** UI MUST 显示 `planning → preparing → working → review → end`

#### Scenario: 批量 polish/proofreading 流程提示包含 preparing 且不包含 review

- **GIVEN** 当前任务类型为 "polish" 或 "proofreading"，且为批量（多段落/章节级）处理
- **WHEN** UI 展示任务流程说明
- **THEN** UI MUST 显示 `planning → preparing → working → end`
- **AND THEN** UI MUST 不显示 `review` 作为该任务流程阶段

#### Scenario: 单段落 polish/proofreading 不展示流程阶段

- **GIVEN** 当前任务类型为 "polish" 或 "proofreading"，且为单段落处理
- **WHEN** UI 展示任务状态
- **THEN** UI MUST 不显示流程阶段提示（无 planning/preparing/working 等阶段展示）
- **AND THEN** UI MUST 仅显示 loading 状态直至任务完成
