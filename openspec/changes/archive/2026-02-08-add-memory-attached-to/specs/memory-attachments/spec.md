## ADDED Requirements

### Requirement: Memory attachments support multiple entities

The system SHALL allow a memory to be attached to zero or more entities (characters, terms, chapters, or book).

#### Scenario: Memory attached to single character

- **WHEN** AI creates a memory with `attached_to: [{type: 'character', id: 'char_001'}]`
- **THEN** the memory is stored with the specified attachment
- **AND** querying the character returns this memory in attached_memories

#### Scenario: Memory attached to multiple entities

- **WHEN** AI creates a memory with `attached_to: [{type: 'character', id: 'char_001'}, {type: 'chapter', id: 'chap_005'}]`
- **THEN** the memory is stored with all specified attachments
- **AND** querying either entity returns this memory

#### Scenario: Memory with no explicit attachments defaults to book

- **WHEN** AI creates a memory without specifying `attached_to`
- **THEN** the memory is automatically attached to `{type: 'book', id: <bookId>}`

### Requirement: Attachment-based memory retrieval

The system SHALL provide efficient querying of memories by their attachments.

#### Scenario: Query memories by single attachment

- **WHEN** system calls `getMemoriesByAttachment(bookId, {type: 'character', id: 'char_001'})`
- **THEN** all memories attached to that character are returned
- **AND** memories are sorted by lastAccessedAt (most recent first)

#### Scenario: Query memories by multiple attachments

- **WHEN** system calls `getMemoriesByAttachments(bookId, [{type: 'term', id: 'term_001'}, {type: 'character', id: 'char_001'}])`
- **THEN** all memories attached to ANY of the specified entities are returned (OR logic)
- **AND** duplicate memories (attached to multiple queried entities) appear only once

### Requirement: Automatic memory injection in translation context

The system SHALL automatically include attached memories when building translation context for chunks.

#### Scenario: Chunk contains character with attached memories

- **GIVEN** a chunk contains text mentioning character "田中太郎"
- **AND** there are memories attached to this character
- **WHEN** building the chunk prompt
- **THEN** the attached memories are included in the context section
- **AND** AI receives the memory summaries to aid translation

#### Scenario: Chunk contains multiple entities with memories

- **GIVEN** a chunk contains text with multiple terms and characters
- **AND** several of these entities have attached memories
- **WHEN** building the chunk prompt
- **THEN** memories from all relevant entities are included
- **AND** memories are deduplicated (if attached to multiple entities in the chunk)

### Requirement: Hybrid memory retrieval for backward compatibility

The system SHALL support fallback to keyword search when no attached memories are found.

#### Scenario: Entity has no attached memories

- **GIVEN** an entity has no memories with explicit attachments
- **WHEN** querying memories for that entity
- **THEN** system falls back to keyword search using entity name
- **AND** returns keyword-matched memories

#### Scenario: Migration period with mixed old and new memories

- **GIVEN** some memories have explicit attachments and some don't
- **WHEN** querying for an entity
- **THEN** attached memories are returned first
- **AND** if no attached memories exist, keyword search provides fallback
