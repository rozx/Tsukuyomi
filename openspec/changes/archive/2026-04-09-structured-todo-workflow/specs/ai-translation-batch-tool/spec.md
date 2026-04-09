## MODIFIED Requirements

### Requirement: Task type specific handling

`add_translation_batch` 工具 SHALL 根据任务类型处理不同提交内容，并使用 `paragraph_id` 定位目标段落。对于翻译任务，该工具在 `working` 和 `review` 状态下均可调用。

#### Scenario: Translation task submission in working state

- **GIVEN** 当前任务类型为 "translation"，状态为 "working"
- **WHEN** AI 调用 `add_translation_batch` 提交段落翻译（按 `paragraph_id`）
- **THEN** 每个段落创建新的翻译版本
- **AND THEN** 新翻译版本被设为选中状态

#### Scenario: Translation task submission in review state

- **GIVEN** 当前任务类型为 "translation"，状态为 "review"
- **WHEN** AI 调用 `add_translation_batch` 提交修正后的段落翻译（按 `paragraph_id`）
- **THEN** 每个段落创建新的翻译版本
- **AND THEN** 新翻译版本被设为选中状态

#### Scenario: Translation task submission in planning state is rejected

- **GIVEN** 当前任务类型为 "translation"，状态为 "planning"
- **WHEN** AI 调用 `add_translation_batch`
- **THEN** 系统 MUST 返回错误信息，提示当前状态不允许提交翻译
- **AND THEN** 不保存任何数据

#### Scenario: Polish task submission

- **GIVEN** 当前任务类型为 "polish"
- **WHEN** AI 调用 `add_translation_batch` 提交润色后的文本（按 `paragraph_id`）
- **THEN** 每个段落创建新的翻译版本（保留原有翻译历史）
- **AND THEN** 新翻译版本被设为选中状态

#### Scenario: Proofreading task submission

- **GIVEN** 当前任务类型为 "proofreading"
- **WHEN** AI 调用 `add_translation_batch` 提交校对结果（按 `paragraph_id`）
- **THEN** 每个段落创建新的翻译版本（保留原有翻译历史）
- **AND THEN** 新翻译版本被设为选中状态
