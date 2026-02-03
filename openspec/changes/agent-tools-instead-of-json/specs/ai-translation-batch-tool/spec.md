## ADDED Requirements

### Requirement: Translation batch submission tool

系统 SHALL 提供 `add_translation_batch` 工具，允许 AI 通过 Function Calling 批量提交段落翻译、润色或校对结果。

#### Scenario: AI 批量提交翻译结果

- **WHEN** AI 调用 `add_translation_batch` 工具提交多个段落翻译
- **THEN** 系统批量保存所有翻译结果
- **AND THEN** 返回成功确认信息

### Requirement: Batch operation parameters

`add_translation_batch` 工具 SHALL 接收包含多个段落处理结果的数组。

#### Scenario: Valid batch submission

- **GIVEN** AI 提供包含 index、translated_text 的对象数组
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 所有段落翻译被保存
- **AND THEN** 返回成功信息，包含处理的段落数量

#### Scenario: Empty batch

- **GIVEN** AI 提供空数组作为段落列表
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："段落列表不能为空"
- **AND THEN** 不保存任何数据

#### Scenario: Missing index

- **GIVEN** 批次中某个段落对象缺少 index
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："必须提供 index"
- **AND THEN** 不保存任何数据（原子性操作）

### Requirement: Paragraph existence validation

`add_translation_batch` 工具 SHALL 验证所有段落是否存在于当前任务分配的段落中。

#### Scenario: Paragraph not in assignment

- **GIVEN** AI 提交了一个不在当前任务分配范围内的 index
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息："段落不在当前任务范围内"
- **AND THEN** 不保存任何数据（原子性操作）

### Requirement: Task type specific handling

`add_translation_batch` 工具 SHALL 根据任务类型处理不同的提交内容。

#### Scenario: Translation task submission

- **GIVEN** 当前任务类型为 "translation"
- **WHEN** AI 调用 `add_translation_batch` 提交段落翻译
- **THEN** 每个段落创建新的翻译版本
- **AND THEN** 新翻译版本被设为选中状态

#### Scenario: Polish task submission

- **GIVEN** 当前任务类型为 "polish"
- **WHEN** AI 调用 `add_translation_batch` 提交润色后的文本
- **THEN** 更新对应段落的当前选中翻译文本
- **AND THEN** 记录润色操作历史

#### Scenario: Proofreading task submission

- **GIVEN** 当前任务类型为 "proofreading"
- **WHEN** AI 调用 `add_translation_batch` 提交校对结果
- **THEN** 更新对应段落的当前选中翻译文本
- **AND THEN** 记录校对操作历史

### Requirement: Batch atomicity

`add_translation_batch` 工具 SHALL 保证批次操作的原子性。

#### Scenario: All or nothing save

- **GIVEN** 批次包含多个段落
- **WHEN** 其中某个段落验证失败
- **THEN** 整个批次操作失败
- **AND THEN** 不保存任何段落的翻译

### Requirement: Duplicate paragraph handling

`add_translation_batch` 工具 SHALL 检测批次中的重复段落 ID（由 index 映射）。

#### Scenario: Duplicate paragraph IDs in batch

- **GIVEN** 批次中包含重复的 index
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
