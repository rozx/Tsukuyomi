## MODIFIED Requirements

### Requirement: Concurrent multi-chapter translation saving

The system SHALL support multiple chapters translating concurrently without data loss due to asynchronous overwrites, and support structured partial success storage from batch tools.

#### Scenario: Simultaneous translation completion

- **WHEN** multiple chapters finish translating chunks at the exact same time
- **THEN** all translations from all chapters are persisted safely into the database without silently overriding one another

#### Scenario: Database validation layer check

- **WHEN** the translation saving mechanism receives a batch of translated paragraphs
- **THEN** it validates that the provided `original_text_prefix` matches the database text start sequence
- **AND THEN** it skips persisting invalid paragraphs, while continuing to successfully persist the valid ones
