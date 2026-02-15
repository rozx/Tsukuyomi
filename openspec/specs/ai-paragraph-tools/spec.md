# ai-paragraph-tools Specification

## Purpose

TBD - created by archiving change allow-cross-chunk-paragraphs. Update Purpose after archive.

## Requirements

### Requirement: Cross-Chunk Context Retrieval

All paragraph context retrieval tools (`get_previous_paragraphs`, `get_next_paragraphs`, `get_paragraph_position`) SHALL retrieve the specified paragraphs from the book content, ignoring any processing chunk boundaries.

#### Scenario: Fetching previous context at chunk start

- **WHEN** `get_previous_paragraphs` is called for the first paragraph in a chunk
- **THEN** it returns paragraphs from the immediately preceding chunk (if it exists)

#### Scenario: Fetching next context at chunk end

- **WHEN** `get_next_paragraphs` is called for the last paragraph in a chunk
- **THEN** it returns paragraphs from the immediately succeeding chunk (if it exists)

#### Scenario: Position info context

- **WHEN** `get_paragraph_position` is called with `include_previous=true` or `include_next=true`
- **THEN** the returned context lists include paragraphs outside the current chunk boundary if applicable

### Requirement: Paragraph tools coordination with submission tools

段落查询工具（`get_previous_paragraphs`, `get_next_paragraphs`, `get_paragraph_position` 等）SHALL 与提交工具协同工作，且提交阶段 MUST 使用 `paragraph_id` 而非 `index`。

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

The task prompts for Translation, Polishing, and Proofreading SHALL include specific instructions to ensure the AI differentiates between "context" and "work items", uses tools instead of JSON output, and treats index as display-only while submitting by `paragraph_id`.

#### Scenario: Translation Prompt with paragraph_id-only submission

- **WHEN** generating the system prompt for a translation task
- **THEN** the prompt instructs the AI to use context tools freely
- **AND THEN** the prompt instructs the AI to use `update_task_status` and `add_translation_batch` tools to submit results
- **AND THEN** the prompt explicitly instructs the AI NOT to output JSON, but to use tools
- **AND THEN** the prompt explicitly states that index is for location only and submission MUST use `paragraph_id`

#### Scenario: Polishing Prompt with paragraph_id-only submission

- **WHEN** generating the system prompt for a polishing task
- **THEN** the prompt instructs the AI to use context tools freely
- **AND THEN** the prompt instructs the AI to use `update_task_status` and `add_translation_batch` tools to submit results
- **AND THEN** the prompt explicitly instructs the AI NOT to output JSON, but to use tools
- **AND THEN** the prompt explicitly states that index is for location only and submission MUST use `paragraph_id`

#### Scenario: Proofreading Prompt with paragraph_id-only submission

- **WHEN** generating the system prompt for a proofreading task
- **THEN** the prompt instructs the AI to use context tools freely
- **AND THEN** the prompt instructs the AI to use `update_task_status` and `add_translation_batch` tools to submit results
- **AND THEN** the prompt explicitly instructs the AI NOT to output JSON, but to use tools
- **AND THEN** the prompt explicitly states that index is for location only and submission MUST use `paragraph_id`

### Requirement: Paragraph index semantics are chapter-original

Paragraph tools that return `paragraph_index` SHALL report the paragraph's original position in chapter content, where empty paragraphs are counted.

#### Scenario: Querying paragraph info with empty paragraphs in chapter

- **WHEN** `get_paragraph_info` is called for a paragraph whose chapter contains empty paragraphs before it
- **THEN** the returned `paragraph_index` SHALL include those empty paragraphs in the count
- **AND THEN** the value SHALL match the paragraph's original chapter array position

#### Scenario: Querying previous or next paragraphs

- **WHEN** `get_previous_paragraphs` or `get_next_paragraphs` returns context paragraphs
- **THEN** each returned paragraph's `paragraph_index` SHALL use chapter-original indexing
- **AND THEN** index values MAY be non-continuous if empty paragraphs exist between returned items
