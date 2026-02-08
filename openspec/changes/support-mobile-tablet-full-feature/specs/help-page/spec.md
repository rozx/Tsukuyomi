## MODIFIED Requirements

### Requirement: Help navigation

The system SHALL provide navigation between different help documents on the help page across desktop,
tablet, and mobile layouts while preserving full document access.

#### Scenario: Navigating between help topics

- **WHEN** user selects a different help topic from navigation
- **THEN** the help page SHALL load and display the selected document without page reload

#### Scenario: Mobile help topic switching

- **WHEN** user accesses help on a mobile device and opens the topic list
- **THEN** the system SHALL provide a touch-friendly drawer or panel to switch topics and return to content

#### Scenario: Tablet help topic visibility

- **WHEN** user accesses help on a tablet device
- **THEN** the system SHALL keep topic navigation continuously reachable through a persistent or quickly
  retrievable side panel

### Requirement: Responsive help layout

The system SHALL provide a responsive layout for the help page suitable for desktop, tablet, and mobile
viewing, and SHALL keep reading and navigation operations complete on all breakpoints.

#### Scenario: Viewing help on mobile device

- **WHEN** user accesses the help page on a mobile device
- **THEN** the content SHALL be readable, navigation SHALL be touch-friendly, and key actions SHALL remain
  accessible without horizontal scrolling

#### Scenario: Viewing help on tablet device

- **WHEN** user accesses the help page on a tablet device
- **THEN** the page SHALL optimize document width and topic navigation placement to support continuous reading
