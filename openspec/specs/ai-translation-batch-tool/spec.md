# ai-translation-batch-tool Specification

## Purpose

Allow AI to submit translation results in batches using function calling.
## Requirements
### Requirement: Translation batch submission tool

系统 SHALL 提供 `add_translation_batch` 工具，允许 AI 通过 Function Calling 批量提交段落翻译、润色或校对结果。

#### Scenario: AI 批量提交翻译结果

- **WHEN** AI 调用 `add_translation_batch` 工具提交多个段落翻译
- **THEN** 系统批量保存所有翻译结果
- **AND THEN** 返回成功确认信息，MUST 包含 `processed_count`
- **AND THEN** 返回结果 MUST 包含 `accepted_paragraphs`，用于标识本次被系统接受的段落集合
- **AND THEN** `accepted_paragraphs` 的每个条目 MUST 包含 `paragraph_id` 与 `translated_text`

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

`add_translation_batch` 工具 SHALL 基于 `paragraph_id` 验证所有提交段落是否存在于当前任务分配范围内。仅当提交 ID 不在范围内时，系统 MAY 尝试自动纠正；且仅在候选唯一、编辑距离不超过 2，并且提交的 `original_text_prefix` 与候选段落原文前缀匹配时，系统 MUST 自动纠正为该目标 ID 后继续校验流程。

#### Scenario: Paragraph ID is already valid

- **GIVEN** AI 提交的 `paragraph_id` 已在当前任务分配范围内
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 MUST 直接使用该 `paragraph_id` 继续后续校验与处理
- **AND THEN** 系统 MUST NOT 触发自动纠正逻辑

#### Scenario: Paragraph ID not in assignment and cannot be corrected

- **GIVEN** AI 提交了一个不在当前任务分配范围内，且不存在可唯一自动纠正候选的 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回错误信息，说明段落不在当前任务范围内
- **AND THEN** 错误信息 MUST 包含被拒绝的原始 `paragraph_id`
- **AND THEN** 不保存任何数据（原子性操作）

#### Scenario: Paragraph ID with small typo is auto-corrected

- **GIVEN** AI 提交的 `paragraph_id` 不在当前任务分配范围内
- **AND GIVEN** 该 ID 与当前任务范围中的某个真实 ID 编辑距离为 1 或 2，且候选唯一
- **AND GIVEN** 该条目提供的 `original_text_prefix` 与候选段落原文前缀匹配
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 MUST 将该条目自动纠正为真实 `paragraph_id` 后继续后续校验与处理
- **AND THEN** 成功结果 MUST 反映纠正后的 `paragraph_id`
- **AND THEN** 返回结果 MUST 包含警告信息，指出原始 ID 与纠正后 ID 的映射

#### Scenario: Paragraph ID candidate found but original prefix does not match

- **GIVEN** AI 提交的 `paragraph_id` 不在当前任务分配范围内
- **AND GIVEN** 该 ID 存在编辑距离不超过 2 的唯一候选
- **AND GIVEN** 提交的 `original_text_prefix` 与候选段落原文前缀不匹配
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 MUST NOT 自动纠正该 `paragraph_id`
- **AND THEN** 系统 MUST 按无效范围处理该 ID

#### Scenario: Paragraph ID typo has ambiguous candidates

- **GIVEN** AI 提交的 `paragraph_id` 在编辑距离 2 以内匹配到多个并列最优候选
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 系统 MUST 拒绝自动纠正并按无效范围处理该 ID
- **AND THEN** 返回结果 MUST 提示该 ID 无法唯一匹配

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

### Requirement: Structured error payload for invalid batch submission

当 `add_translation_batch` 参数校验失败时，系统 SHALL 在保留可读错误信息的同时返回机器可读错误字段，供模型重试时精确修复。

#### Scenario: Missing paragraph_id returns machine-readable diagnostics

- **GIVEN** 批次中某个段落对象缺少 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回 `success: false` 且包含可读错误信息
- **AND THEN** 返回结果 MUST 包含 `error_code` 与 `invalid_items`
- **AND THEN** `invalid_items` MUST 标识出错条目的位置与原因

#### Scenario: Out-of-range paragraph IDs return machine-readable rejected IDs

- **GIVEN** AI 提交了不在当前任务范围内的 `paragraph_id`
- **WHEN** 调用 `add_translation_batch` 工具
- **THEN** 返回 `success: false` 且包含可读错误信息
- **AND THEN** 返回结果 MUST 包含 `error_code` 与 `invalid_paragraph_ids`
- **AND THEN** `invalid_paragraph_ids` MUST 包含全部被拒绝的段落 ID

### Requirement: Prefix length validation window guarantee

`add_translation_batch` 工具在校验 `original_text_prefix` 长度时，SHALL 保证合法前缀长度窗口（最小长度 ~ 最大长度）足够宽。当按比例计算的窗口宽度不足时，系统 SHALL 自动放宽最大长度为原文全长。

#### Scenario: Short text with narrow validation window allows full original text as prefix

- **WHEN** AI 提交的 `original_text_prefix` 等于原文全文
- **AND** 原文为非符号文本且按比例计算的合法前缀长度窗口宽度小于 2 个字符
- **THEN** 系统 SHALL 接受该前缀（不触发 `ORIGINAL_TEXT_PREFIX_TOO_LONG`）

#### Scenario: Long text with sufficient window still rejects over-length prefix

- **WHEN** AI 提交的 `original_text_prefix` 长度超过 `max(3, floor(原文长度 * 0.8))` 且不等于原文全文
- **AND** 原文按比例计算的合法前缀长度窗口宽度大于等于 2 个字符
- **THEN** 系统 SHALL 拒绝该前缀并返回 `ORIGINAL_TEXT_PREFIX_TOO_LONG` 错误

### Requirement: Prefix validation as independent function

前缀长度校验逻辑 SHALL 封装为独立的 helper 函数，接收前缀字符串和原文字符串，返回校验结果。

#### Scenario: Helper function returns validation result

- **WHEN** 调用前缀长度校验 helper 函数
- **THEN** 返回结果 SHALL 包含校验是否通过
- **AND** 校验失败时 SHALL 包含具体的错误码（`ORIGINAL_TEXT_PREFIX_TOO_SHORT` 或 `ORIGINAL_TEXT_PREFIX_TOO_LONG`）

### Requirement: Auto-correction warning transparency

当 `add_translation_batch` 对 `paragraph_id` 发生自动纠正时，系统 SHALL 向模型返回可读警告，以便模型在后续提交中修正 ID 生成行为。

#### Scenario: Response includes correction warning details

- **WHEN** 批次中至少一个 `paragraph_id` 被自动纠正
- **THEN** 工具返回 MUST 包含至少一条纠错警告
- **AND THEN** 每条警告 MUST 同时包含原始 `paragraph_id` 与纠正后的 `paragraph_id`

