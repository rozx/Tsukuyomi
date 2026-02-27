## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Auto-correction warning transparency

当 `add_translation_batch` 对 `paragraph_id` 发生自动纠正时，系统 SHALL 向模型返回可读警告，以便模型在后续提交中修正 ID 生成行为。

#### Scenario: Response includes correction warning details

- **WHEN** 批次中至少一个 `paragraph_id` 被自动纠正
- **THEN** 工具返回 MUST 包含至少一条纠错警告
- **AND THEN** 每条警告 MUST 同时包含原始 `paragraph_id` 与纠正后的 `paragraph_id`
