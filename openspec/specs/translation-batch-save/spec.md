## ADDED Requirements

### Requirement: Concurrent multi-chapter translation saving

The system SHALL support multiple chapters translating concurrently without data loss due to asynchronous overwrites.

#### Scenario: Simultaneous translation completion

- **WHEN** multiple chapters finish translating chunks at the exact same time
- **THEN** all translations from all chapters are persisted safely into the database without silently overriding one another
