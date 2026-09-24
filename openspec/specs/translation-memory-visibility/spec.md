# translation-memory-visibility Specification

## Purpose
让用户看到 AI 翻译时参考了哪些记忆：翻译结果记录引用的记忆 ID 与打分明细，书籍详情页的记忆预览面板（`MemoryReferencePanel.vue`）列出当前章节会注入的记忆及其相关度构成，并可点开详情。

## Requirements

### Requirement: Referenced memories stored with translations

Each `Translation` SHALL record the memories referenced while producing it.

#### Scenario: Recording references for a chunk

- **GIVEN** a translation chunk during which the AI fetched memories via tools and the context builder injected scored memories
- **WHEN** the translated paragraphs are saved
- **THEN** `referencedMemories` holds the IDs from memory tool actions (`memory_id`, `id`, `found_memory_ids`) merged with the injected memory IDs
- **AND** `memoryScoreBreakdown` holds the breakdown for each injected memory
- **AND** both fields are omitted when empty

#### Scenario: Breakdowns stay local

- **GIVEN** translations with `memoryScoreBreakdown`
- **WHEN** data is uploaded to sync
- **THEN** `memoryScoreBreakdown` is stripped from the payload

### Requirement: Chapter memory preview panel

The book details page SHALL show the memories that would be injected for the current chapter.

#### Scenario: Preview states

- **GIVEN** the user opens the chapter memory popover
- **WHEN** the panel renders
- **THEN** it shows "检索记忆中..." while loading, "未参考记忆" when nothing is selected, and otherwise "AI 参考了 N 条记忆" followed by one row per memory with its summary

#### Scenario: Preview refreshes

- **GIVEN** the chapter memory preview is shown
- **WHEN** the selected chapter or its paragraph count changes, or a memory is saved or deleted from the detail dialog
- **THEN** the preview is recomputed

#### Scenario: Opening a memory

- **GIVEN** the preview lists memories
- **WHEN** the user clicks a row or its view button
- **THEN** the memory detail dialog opens for that memory

### Requirement: Score breakdown tooltip

Rows with a score breakdown SHALL show the relevance score and a tooltip explaining it.

#### Scenario: Score label and tooltip

- **GIVEN** a previewed memory with a `ScoreBreakdown`
- **WHEN** its row renders
- **THEN** the row shows an info icon with the total score to two decimals
- **AND** hovering shows three rows (语义置信, 关键词, 时间衰减), each with raw value, weight, and weighted value, and a total 相关度 row

#### Scenario: Weights follow the scoring mode

- **GIVEN** a breakdown with `scoringMode`
- **WHEN** the weights are displayed
- **THEN** semantic mode shows 0.85 / 0.10 / 0.05 and fallback mode shows 0 / 0.75 / 0.25
- **AND** for legacy breakdowns without `scoringMode`, semantic mode is assumed when `semanticWeighted > 0`

#### Scenario: Memory without breakdown

- **GIVEN** a listed memory with no breakdown
- **WHEN** its row renders
- **THEN** no score label or tooltip is shown
