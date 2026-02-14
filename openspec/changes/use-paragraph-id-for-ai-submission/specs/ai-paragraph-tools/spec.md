## MODIFIED Requirements

### Requirement: Paragraph tools coordination with submission tools

段落查询工具（`get_previous_paragraphs`, `get_next_paragraphs`, `get_paragraph_info` 等）SHALL 与提交工具协同工作，且提交阶段 MUST 使用 `paragraph_id` 而非 `index`。

#### Scenario: Query then submit workflow with paragraph IDs

- **GIVEN** AI 需要翻译多个段落
- **WHEN** AI 首先调用 `get_previous_paragraphs` 获取上下文
- **AND WHEN** AI 然后调用 `add_translation_batch` 并使用 `paragraph_id` 提交翻译结果
- **THEN** 两个工具调用都成功执行
- **AND THEN** 系统保存翻译结果并更新任务状态

### Requirement: Paragraph assignment tracking

`add_translation_batch` 工具 SHALL 使用 `paragraph_id` 验证提交段落是否属于当前任务分配范围。

#### Scenario: Submit only assigned paragraph IDs

- **GIVEN** 当前任务分配了段落 ID A、B、C
- **WHEN** AI 调用 `add_translation_batch` 提交段落 ID A 和 D 的翻译
- **THEN** 系统 MUST 拒绝该提交
- **AND THEN** 系统 MUST 返回错误信息："段落 D 不在当前任务分配范围内"

### Requirement: Focused Task Prompts

任务提示词（Translation、Polishing、Proofreading）SHALL 明确区分“上下文段落”和“待处理段落”，并强制 AI 在提交结果时仅使用 `paragraph_id`。

#### Scenario: Translation Prompt with paragraph_id-only submission

- **WHEN** 生成翻译任务的系统提示词
- **THEN** 提示词指示 AI 可自由使用上下文工具获取信息
- **AND THEN** 提示词指示 AI 使用 `update_task_status` 与 `add_translation_batch` 工具提交结果
- **AND THEN** 提示词明确告知 AI 提交时 MUST 使用 `paragraph_id` 且 MUST NOT 使用 `index`
- **AND THEN** 提示词明确告知 AI 不要输出 JSON

#### Scenario: Polishing Prompt with paragraph_id-only submission

- **WHEN** 生成润色任务的系统提示词
- **THEN** 提示词指示 AI 可自由使用上下文工具获取信息
- **AND THEN** 提示词指示 AI 使用 `update_task_status` 与 `add_translation_batch` 工具提交结果
- **AND THEN** 提示词明确告知 AI 提交时 MUST 使用 `paragraph_id` 且 MUST NOT 使用 `index`
- **AND THEN** 提示词明确告知 AI 不要输出 JSON

#### Scenario: Proofreading Prompt with paragraph_id-only submission

- **WHEN** 生成校对任务的系统提示词
- **THEN** 提示词指示 AI 可自由使用上下文工具获取信息
- **AND THEN** 提示词指示 AI 使用 `update_task_status` 与 `add_translation_batch` 工具提交结果
- **AND THEN** 提示词明确告知 AI 提交时 MUST 使用 `paragraph_id` 且 MUST NOT 使用 `index`
- **AND THEN** 提示词明确告知 AI 不要输出 JSON
