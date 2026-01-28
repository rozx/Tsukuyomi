## ADDED Requirements

### Requirement: State Transition Isolation

The system MUST require that state transitions are output as standalone JSON objects, containing only the `status` field (and optional metadata like `thought`), with NO translation content.

#### Scenario: Transition to working state

- **GIVEN** the task is in `planning` state
- **WHEN** the AI decides to start working
- **THEN** it output a JSON object `{"status": "working"}`
- **AND** this object MUST NOT contain any translation content fields

#### Scenario: Content output isolation

- **GIVEN** the task is in `working` state
- **WHEN** the AI outputs translation content
- **THEN** it output a JSON object containing the content (e.g., `{"translation": "..."}`)
- **AND** this object MUST NOT contain a `status` change field
