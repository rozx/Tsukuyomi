## ADDED Requirements

### Requirement: Automatic memory discovery from chunk entities

The system SHALL identify entities present in a chunk and retrieve their attached memories.

#### Scenario: Extract entities from chunk text

- **GIVEN** a chunk of text to be translated
- **WHEN** building the translation context
- **THEN** system extracts all terms present in the chunk
- **AND** system extracts all characters present in the chunk
- **AND** entity extraction uses the same logic as the terminology/character sidebar

#### Scenario: Retrieve memories for extracted entities

- **GIVEN** entities have been extracted from chunk text
- **WHEN** building the translation context
- **THEN** system queries memories attached to each extracted entity
- **AND** system aggregates all retrieved memories

### Requirement: Memory context formatting in prompts

The system SHALL format attached memories into readable context sections.

#### Scenario: Format single memory

- **GIVEN** one memory is attached to an entity in the chunk
- **WHEN** building the context section
- **THEN** the memory summary is included in the prompt
- **AND** the format is: `- [Memory] {summary}`

#### Scenario: Format multiple memories

- **GIVEN** multiple memories are attached to entities in the chunk
- **WHEN** building the context section
- **THEN** all memory summaries are listed
- **AND** each memory is prefixed with its type indicator
- **AND** the section is titled "【相关记忆】"

#### Scenario: Memory context placement

- **GIVEN** memory context is being added to the prompt
- **WHEN** the full prompt is assembled
- **THEN** memory context appears after the "【当前部分出现的术语和角色】" section
- **AND** memory context appears before the actual text to translate

### Requirement: Memory deduplication in context

The system SHALL deduplicate memories when multiple entities in a chunk share the same memory.

#### Scenario: Memory attached to multiple entities in same chunk

- **GIVEN** a memory is attached to both character A and term B
- **AND** both character A and term B appear in the current chunk
- **WHEN** building the context
- **THEN** the memory appears only once in the context
- **AND** no duplicate information is presented to AI

### Requirement: Memory limit in context

The system SHALL limit the number of memories included to prevent context overflow.

#### Scenario: Many memories attached to chunk entities

- **GIVEN** many entities in the chunk have attached memories
- **AND** total memories exceed the limit (e.g., 10)
- **WHEN** building the context
- **THEN** only the most relevant memories are included
- **AND** memories are prioritized by lastAccessedAt (most recent first)
- **AND** a note indicates "... and X more memories" if some are omitted
