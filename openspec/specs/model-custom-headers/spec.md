## ADDED Requirements

### Requirement: Configure Custom Headers per AI Model

The user SHALL be able to define custom HTTP headers (Key-Value pairs) for each configured AI model in the settings UI.
The system SHALL safely persist these custom header definitions as part of the model configuration (`AIModel` object).

#### Scenario: User adds a custom header

- **WHEN** the user navigates to the "Advanced Options" (or "Custom Headers") section in the AI Model editing dialog and inputs a valid Key (e.g., `User-Agent`) and Value (e.g., `MyTranslator/1.0`).
- **THEN** both the Key and Value are saved and displayed correctly in the settings dialog.
- **AND** the changes are persisted to storage when the dialog is saved.

#### Scenario: User removes a custom header

- **WHEN** the user clicks the delete button next to an existing custom header in the "Custom Headers" section.
- **THEN** the header is removed from the list in the dialog.
- **AND** the deletion is persisted to storage when the dialog is saved.

### Requirement: Append Custom Headers to AI Model Requests

The system SHALL append any custom HTTP headers configured for an AI model to all outgoing API requests (e.g., chat completions, translation tasks) handled by that model instance.

#### Scenario: Sending an OpenAI API request with custom headers

- **WHEN** an AI translation or chat request is executed using an OpenAI-compatible model configuration that contains custom headers.
- **THEN** the outgoing HTTP request MUST contain the configured custom headers in its raw HTTP Headers payload.

#### Scenario: Sending a Gemini API request with custom headers

- **WHEN** an AI translation or chat request is executed using a Gemini model configuration that contains custom headers.
- **THEN** the outgoing HTTP request MUST contain the configured custom headers in its raw HTTP Headers payload, overriding default library behaviors if necessary.
