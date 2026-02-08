## ADDED Requirements

### Requirement: Memory creation with optional attachments

The system SHALL allow AI to specify entity attachments when creating memories.

#### Scenario: Create memory with character attachment

- **WHEN** AI calls `create_memory` with `attached_to: [{type: 'character', id: 'char_001'}]`
- **THEN** the memory is created with the specified attachment
- **AND** the memory is immediately retrievable when querying that character

#### Scenario: Create memory without attachments defaults to book

- **WHEN** AI calls `create_memory` without `attached_to` parameter
- **THEN** the memory is created with default attachment `{type: 'book', id: bookId}`
- **AND** the memory is retrievable when querying book-level memories

### Requirement: Memory update with attachment modification

The system SHALL allow AI to add, remove, or modify attachments when updating memories.

#### Scenario: Add attachment to existing memory

- **GIVEN** an existing memory has no specific attachments (only default book)
- **WHEN** AI calls `update_memory` with `attached_to: [{type: 'term', id: 'term_001'}]`
- **THEN** the memory is updated with the new attachment
- **AND** the memory becomes retrievable when querying that term

#### Scenario: Update memory content while preserving attachments

- **GIVEN** an existing memory has attachments
- **WHEN** AI calls `update_memory` with new content but no `attached_to` parameter
- **THEN** the memory content is updated
- **AND** existing attachments are preserved

#### Scenario: Replace all attachments

- **GIVEN** an existing memory has multiple attachments
- **WHEN** AI calls `update_memory` with a new `attached_to` array
- **THEN** all existing attachments are replaced with the new ones
- **AND** the memory is now retrievable through the new attachments only

### Requirement: AI guidance for attachment usage

The system SHALL provide clear guidance to AI on when and how to use attachments.

#### Scenario: AI creates character-related memory

- **GIVEN** AI is creating a memory about a specific character's background
- **WHEN** the AI reads the tool description
- **THEN** the description instructs AI to use `attached_to: [{type: 'character', id: '...'}]`
- **AND** AI includes the attachment in the create call

#### Scenario: AI updates memory to add missing attachment

- **GIVEN** AI encounters a memory about a term but with no term attachment
- **WHEN** AI reads the update tool description
- **THEN** the description instructs AI to add appropriate `attached_to`
- **AND** AI updates the memory with the correct attachment
