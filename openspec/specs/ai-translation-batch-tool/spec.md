# ai-translation-batch-tool Specification

## Purpose

Allow AI to submit translation results in batches using function calling.

## Requirements

### Requirement: Translation batch submission tool

系统 SHALL 提供 `add_translation_batch` 工具，允许 AI 通过 Function Calling 批量提交段落翻译、润色或校对结果。

#### Scenario: AI 批量提交翻译结果

- **WHEN** AI 调用 `add_translation_batch` 工具提交多个段落翻译
- **THEN** 系统批量保存所有翻译结果
- **AND THEN** 返回成功确认信息

### Requirement: Batch operation parameters

`add_translation_batch` 工具 SHALL 接收包含多个段落处理结果的数组，且每个条目 MUST 使用 `paragraph_id` 标识目标段落。

#### Scenario: Valid batch submission with paragraph IDs

- **GIVEN** AI 提供包含 `paragraph_id`、`translated_text` 的对象数组
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 所有段落翻译被保存
- **AND THEN** 返回成功信息，包含处理的段落数量

#### Scenario: Missing paragraph_id

- **GIVEN** 批次中某个段落对象缺少 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："必须提供 paragraph_id"
- **AND THEN** 不保存任何数据（原子性操作）

#### Scenario: Legacy index-only payload is rejected

- **GIVEN** 批次中某个段落对象仅提供 `index` 而未提供 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："不再支持 index，请改用 paragraph_id"
- **AND THEN** 不保存任何数据（原子性操作）

### Requirement: Paragraph existence validation

`add_translation_batch` 工具 SHALL 基于 `paragraph_id` 验证所有提交段落是否存在于当前任务分配范围内。

#### Scenario: Paragraph ID not in assignment

- **GIVEN** AI 提交了一个不在当前任务分配范围内的 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："段落不在当前任务范围内"
- **AND THEN** 错误信息 MUST 包含被拒绝的 `paragraph_id`
- **AND THEN** 不保存任何数据（原子性操作）

### Requirement: Task type specific handling

`add_translation_batch` 工具 SHALL 根据任务类型处理不同提交内容，并使用 `paragraph_id` 定位目标段落。

#### Scenario: Translation task submission

- **GIVEN** 当前任务类型为 "translation"
- **WHEN** AI 调用 `add_translation_batch` 提交段落翻译（按 `paragraph_id`）
- **THEN** 每个段落创建新的翻译版本
- **AND THEN** 新翻译版本被设为选中状态

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

### Requirement: Batch atomicity

`add_translation_batch` 工具 SHALL 保证批次操作的原子性。

#### Scenario: All or nothing save

- **GIVEN** 批次包含多个段落
- **WHEN** 其中某个段落验证失败
- **THEN** 整个批次操作失败
- **AND THEN** 不保存任何段落的翻译

### Requirement: Duplicate paragraph handling

`add_translation_batch` 工具 SHALL 检测批次中的重复 `paragraph_id`。

#### Scenario: Duplicate paragraph IDs in batch

- **GIVEN** 批次中包含重复的 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："批次中存在重复的段落 ID"
- **AND THEN** 不保存任何数据

### Requirement: Batch size limit

`add_translation_status` 工具 SHALL 限制单次批次的最大段落数量。

#### Scenario: Batch too large

- **GIVEN** 批次包含超过 100 个段落
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："单次批次最多支持 100 个段落"
- **AND THEN** 不保存任何数据
