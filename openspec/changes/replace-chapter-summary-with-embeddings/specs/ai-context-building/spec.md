## ADDED Requirements

### Requirement: Chapter summary is not injected automatically

The system SHALL NOT inject chapter summaries into AI task prompts. The previous-chapter summary and the current-chapter summary context blocks are removed.

#### Scenario: Previous chapter context minimized to title only

- **GIVEN** a translation chunk is being built for chapter N
- **WHEN** the previous chapter (N-1) exists
- **THEN** the prompt MAY include only the previous chapter's title for continuity awareness
- **AND** the prompt MUST NOT include any summary text for the previous chapter

#### Scenario: Single-paragraph default context excludes chapter summary

- **GIVEN** a single-paragraph polish or proofread task is being prepared
- **WHEN** the default context is assembled
- **THEN** the context MUST NOT include a chapter-summary section
- **AND** the existing terminology / character / surrounding-paragraphs sections are unaffected

### Requirement: AI discovers chapter context via query_chapter

The system SHALL inform AI tasks that chapter-level semantic context must be requested on demand via the `query_chapter` tool rather than arriving pre-injected.

#### Scenario: Translation / polish / proofread system prompt advertises the tool

- **GIVEN** a translation, polish, or proofread system prompt is being assembled
- **WHEN** the tool-use guidance section is rendered
- **THEN** the prompt describes `query_chapter` as the way to locate semantically relevant chapters for the current task
- **AND** the prompt notes that `get_chapter_info` returns full chapter content but no summary

#### Scenario: No fallback injection when tool is unavailable

- **GIVEN** the embedding service has failed to initialize
- **WHEN** a task prompt is built
- **THEN** the system does not substitute a chapter summary or any generated context in place of the missing tool
- **AND** the AI proceeds with whatever context was otherwise provided
