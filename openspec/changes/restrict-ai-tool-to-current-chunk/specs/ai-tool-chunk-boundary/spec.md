## ADDED Requirements

### Requirement: Tool context includes chunk boundaries
The system SHALL extend the `ToolContext` interface to include optional chunk boundary information for enforcing paragraph access restrictions during chunked processing.

#### Scenario: Tool context with chunk boundaries
- **WHEN** a translation task processes a chunk of paragraphs
- **THEN** the `ToolContext` passed to tool handlers SHALL contain `chunkBoundaries` with:
  - `allowedParagraphIds`: A Set of paragraph IDs that are within the current chunk
  - `firstParagraphId`: The first paragraph ID in the current chunk (for error messages)
  - `lastParagraphId`: The last paragraph ID in the current chunk (for error messages)

#### Scenario: Tool context without chunk boundaries (AI Assistant)
- **WHEN** a non-chunked context calls tools (e.g., AI assistant chat, standalone tool usage)
- **THEN** the `ToolContext` SHALL NOT contain `chunkBoundaries`
- **AND** tools SHALL allow access to any paragraphs without restriction

#### Scenario: Translation task with chunk boundaries
- **GIVEN** a translation task is processing a chunk
- **WHEN** tools are invoked during this task
- **THEN** the `ToolContext` SHALL contain `chunkBoundaries` with the current chunk's paragraph IDs
- **AND** paragraph access SHALL be restricted to those IDs

#### Scenario: Polish task with chunk boundaries
- **GIVEN** a polish task is processing a chunk
- **WHEN** tools are invoked during this task
- **THEN** the `ToolContext` SHALL contain `chunkBoundaries` restricting paragraph access

#### Scenario: Proofreading task with chunk boundaries
- **GIVEN** a proofreading task is processing a chunk
- **WHEN** tools are invoked during this task
- **THEN** the `ToolContext` SHALL contain `chunkBoundaries` restricting paragraph access

### Requirement: get_next_paragraphs respects chunk boundaries
The system SHALL enforce chunk boundaries on the `get_next_paragraphs` tool, rejecting requests that would return paragraphs outside the current chunk.

#### Scenario: Request within chunk boundaries
- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_next_paragraphs` with paragraph_id P3 and count 2
- **THEN** the tool SHALL return paragraphs P4 and P5

#### Scenario: Request exceeds chunk boundaries
- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_next_paragraphs` with paragraph_id P4 and count 5
- **THEN** the tool SHALL return an error:
  - `success: false`
  - `error` message explaining the boundary restriction and current chunk range

#### Scenario: Request from last paragraph in chunk
- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_next_paragraphs` with paragraph_id P5
- **THEN** the tool SHALL return an error indicating no more paragraphs in current chunk

### Requirement: get_previous_paragraphs respects chunk boundaries
The system SHALL enforce chunk boundaries on the `get_previous_paragraphs` tool, rejecting requests that would return paragraphs outside the current chunk.

#### Scenario: Previous paragraphs within chunk
- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_previous_paragraphs` with paragraph_id P4 and count 2
- **THEN** the tool SHALL return paragraphs P3 and P2

#### Scenario: Previous paragraphs exceed chunk boundaries
- **GIVEN** the current chunk contains paragraphs [P3, P4, P5] (not starting from P1)
- **WHEN** AI calls `get_previous_paragraphs` with paragraph_id P3 and count 5
- **THEN** the tool SHALL return an error explaining the boundary restriction

### Requirement: get_paragraph_position optional boundaries
The system SHALL enforce chunk boundaries on the optional `include_next` and `include_previous` parameters of `get_paragraph_position` when chunk boundaries are provided.

#### Scenario: include_next within boundaries
- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_paragraph_position` with paragraph_id P2, include_next=true, next_count=2
- **THEN** the tool SHALL return position info including P3 and P4 in `next_paragraphs`

#### Scenario: include_next exceeds boundaries
- **GIVEN** the current chunk contains paragraphs [P1, P2, P3, P4, P5]
- **WHEN** AI calls `get_paragraph_position` with paragraph_id P4, include_next=true, next_count=5
- **THEN** the tool SHALL return position info with only P5 in `next_paragraphs`
- **AND** SHALL NOT include paragraphs beyond P5

### Requirement: Boundary error messages
The system SHALL provide clear, actionable error messages when boundary violations occur.

#### Scenario: Boundary violation error format
- **WHEN** a tool rejects a request due to chunk boundary violation
- **THEN** the error response SHALL include:
  - Explanation that the request exceeds current translation range
  - The first and last paragraph IDs of the current allowed range
  - A suggestion to focus on the current chunk's paragraphs

### Requirement: Chunk boundaries propagation
The system SHALL propagate chunk boundary information through the tool execution chain from task services to individual tool handlers.

#### Scenario: Translation service propagation
- **WHEN** `TranslationService.translate()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the `ToolCallLoopConfig` SHALL include these paragraph IDs
- **AND** `executeToolCallLoop()` SHALL pass them to `ToolRegistry.handleToolCall()`
- **AND** tool handlers SHALL receive them in `ToolContext.chunkBoundaries`

#### Scenario: Polish service propagation
- **WHEN** `PolishService.polish()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the chunk boundaries SHALL be propagated to tool handlers

#### Scenario: Proofreading service propagation
- **WHEN** `ProofreadingService.proofread()` processes a chunk with paragraph IDs [P1, P2, P3]
- **THEN** the chunk boundaries SHALL be propagated to tool handlers
