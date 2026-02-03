## ADDED Requirements

### Requirement: Paragraph tools coordination with submission tools

段落查询工具（`get_previous_paragraphs`, `get_next_paragraphs`, `get_paragraph_info` 等）SHALL 与新的提交工具协同工作，确保 AI 可以查询上下文后使用 `add_translation_batch` 提交结果。

#### Scenario: Query then submit workflow

- **GIVEN** AI 需要翻译多个段落
- **WHEN** AI 首先调用 `get_previous_paragraphs` 获取上下文
- **AND WHEN** AI 然后调用 `add_translation_batch` 提交翻译结果
- **THEN** 两个工具调用都成功执行
- **AND THEN** 系统保存翻译结果并更新任务状态

### Requirement: Paragraph assignment tracking

`add_translation_batch` 工具 SHALL 验证提交的段落是否属于当前任务分配的范围。

#### Scenario: Submit only assigned paragraphs

- **GIVEN** 当前任务分配了段落 A、B、C
- **WHEN** AI 调用 `add_translation_batch` 提交段落 A 和 D 的翻译
- **THEN** 系统 MUST 拒绝该提交
- **AND THEN** 系统 MUST 返回错误信息："段落 D 不在当前任务分配范围内"

## MODIFIED Requirements

### Requirement: Focused Task Prompts

任务提示词（Translation、Polishing、Proofreading）SHALL 更新为指示 AI 使用新的工具调用方式，而非输出 JSON。

#### Scenario: Translation Prompt with tools

- **WHEN** 生成翻译任务的系统提示词
- **THEN** 提示词指示 AI 使用上下文工具获取信息
- **AND THEN** 提示词指示 AI 使用 `update_task_status` 和 `add_translation_batch` 工具提交结果
- **AND THEN** 提示词明确告知 AI 不要输出 JSON 格式

#### Scenario: Polishing Prompt with tools

- **WHEN** 生成润色任务的系统提示词
- **THEN** 提示词指示 AI 使用上下文工具获取信息
- **AND THEN** 提示词指示 AI 使用 `update_task_status` 和 `add_translation_batch` 工具提交结果
- **AND THEN** 提示词明确告知 AI 不要输出 JSON 格式

#### Scenario: Proofreading Prompt with tools

- **WHEN** 生成校对任务的系统提示词
- **THEN** 提示词指示 AI 使用上下文工具获取信息
- **AND THEN** 提示词指示 AI 使用 `update_task_status` 和 `add_translation_batch` 工具提交结果
- **AND THEN** 提示词明确告知 AI 不要输出 JSON 格式

## REMOVED Requirements

### Requirement: JSON-based status output in prompts

**Reason**: 系统已改为 Function Calling 工具调用模式，不再需要在提示词中要求 AI 输出 JSON
**Migration**: 更新后的提示词应指示 AI 使用工具而非输出 JSON
