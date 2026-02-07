## ADDED Requirements

### Requirement: Help documentation storage

The system SHALL store help documentation files in `public/help/` directory using Markdown format.

#### Scenario: Accessing help documentation

- **WHEN** the application needs to display help content
- **THEN** it SHALL read Markdown files from `public/help/` directory

### Requirement: Front page help document

The system SHALL provide a front-page help document at `public/help/front-page.md` that introduces core application features.

#### Scenario: User views front page help

- **WHEN** user navigates to the help page
- **THEN** the front-page.md content SHALL be displayed as the default view

### Requirement: Help document accessibility

The system SHALL make help documents accessible to both the web UI and AI assistant.

#### Scenario: AI assistant reads help docs

- **WHEN** the AI assistant needs to answer user questions about features
- **THEN** it SHALL be able to read and reference help documentation files

### Requirement: Multiple help documents support

The system SHALL support multiple help documents organized by feature or topic.

#### Scenario: Navigating to specific help topic

- **WHEN** user clicks on a help topic link
- **THEN** the corresponding help document SHALL be loaded and displayed
