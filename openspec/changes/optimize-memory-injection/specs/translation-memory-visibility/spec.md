## ADDED Requirements

### Requirement: Score breakdown tooltip for injected memories

`MemoryReferencePanel` SHALL display a per-memory score breakdown tooltip for memories that were injected into translation context via the relevance scoring system.

#### Scenario: Score icon appears next to injected memory

- **GIVEN** a translation has `memoryScoreBreakdown` for memory `mem_abc`
- **WHEN** the memory reference panel renders
- **THEN** the row for `mem_abc` shows a small info icon (ⓘ) at the end of the line

#### Scenario: Tooltip shows five signals with weighted values

- **GIVEN** the info icon next to `mem_abc` is visible
- **WHEN** the user hovers or clicks the icon
- **THEN** a tooltip appears showing five rows, one per signal
- **AND** each row displays `原始值 × 权重 = 加权分`
- **AND** the rows are labeled `实体命中`, `语义相似度`, `关键词命中`, `附件层级`, `时间衰减`

#### Scenario: Tooltip shows total score

- **GIVEN** the tooltip is displayed
- **WHEN** the user reads the bottom of the tooltip
- **THEN** a "总分" row displays the sum of all weighted contributions

### Requirement: Memories fetched via AI tools have no score breakdown

The UI SHALL handle memories that were referenced via AI tool calls (rather than pre-computed injection) by indicating their different provenance.

#### Scenario: Tool-invoked memory shows origin label

- **GIVEN** a memory was fetched by `get_memory` or `search_memory_by_keywords` and has no corresponding `memoryScoreBreakdown` entry
- **WHEN** the memory reference panel renders
- **THEN** the row shows a label "由 AI 主动调用" in subdued text
- **AND** no score breakdown icon is displayed for that row

#### Scenario: Mixed provenance in single panel

- **GIVEN** a translation references both injected memories (with breakdowns) and AI-fetched memories (without breakdowns)
- **WHEN** the panel renders
- **THEN** injected memories show the score breakdown icon
- **AND** AI-fetched memories show the "由 AI 主动调用" label
- **AND** all memories remain clickable to open their detail dialog
