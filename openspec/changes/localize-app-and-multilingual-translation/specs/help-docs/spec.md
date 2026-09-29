## MODIFIED Requirements

### Requirement: Help documentation storage

The system SHALL store help documentation files in `public/help/` directory using Markdown format. The 16 user guides SHALL have complete zh-CN, zh-TW and en-US versions with identical document IDs and localized titles, descriptions and category labels. Legacy root paths SHALL remain valid for the Simplified Chinese documents.

#### Scenario: Accessing help documentation

- **WHEN** the application needs to display help content
- **THEN** it SHALL read Markdown files from `public/help/` directory

#### Scenario: Three complete guide collections

- **WHEN** the user selects any supported UI language
- **THEN** all 16 guides SHALL resolve to the corresponding translated Markdown and localized index metadata

#### Scenario: Historical release notes

- **WHEN** a user opens a historical release note in any UI language
- **THEN** its body SHALL remain the published original; navigation category and description SHALL use the UI language

### Requirement: Front page help document

The system SHALL provide a front-page help document at `public/help/front-page.md` that introduces core application features. Its stable document ID SHALL resolve to the active language version; the original root file remains the zh-CN compatibility resource.

#### Scenario: User views front page help

- **WHEN** user navigates to the help page
- **THEN** the front-page.md content SHALL be displayed as the default view

### Requirement: Help document accessibility

The system SHALL make help documents accessible to both the web UI and AI assistant.

#### Scenario: AI assistant reads help docs

- **WHEN** the AI assistant needs to answer user questions about features
- **THEN** it SHALL be able to read and reference help documentation files

#### Scenario: UI and assistant use the same localized resource

- **WHEN** UI and assistant request the same guide with the same language
- **THEN** both SHALL receive the same title, full body and stable section identifiers
