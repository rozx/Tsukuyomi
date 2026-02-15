## ADDED Requirements

### Requirement: Chunk display index aligns with chapter original index

The system SHALL render each paragraph label in chunk text using the paragraph's original chapter index (including empty paragraphs), while still filtering empty paragraphs out of the task payload.

#### Scenario: Chapter contains empty paragraphs between non-empty paragraphs

- **WHEN** a task chunk is built from chapter paragraphs like [non-empty, empty, non-empty, empty, non-empty]
- **THEN** the chunk SHALL include only non-empty paragraphs for processing
- **AND THEN** displayed labels SHALL use original chapter indexes such as `[0]`, `[2]`, `[4]`

#### Scenario: Chapter has no empty paragraphs

- **WHEN** a task chunk is built from chapter paragraphs without empty entries
- **THEN** displayed labels SHALL match original chapter indexes
- **AND THEN** labels may appear continuous (for example `[0]`, `[1]`, `[2]`)

#### Scenario: Index is display-only in chunk context

- **WHEN** chunk text is shown to the model with both `[index]` and `[ID: paragraph_id]`
- **THEN** the index SHALL be treated as a location hint only
- **AND THEN** submission workflows SHALL continue using `paragraph_id` as the only valid identifier
