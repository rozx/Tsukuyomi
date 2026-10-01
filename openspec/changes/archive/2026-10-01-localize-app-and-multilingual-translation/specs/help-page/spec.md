## MODIFIED Requirements

### Requirement: Help navigation

文档与分类 SHALL 以稳定 ID 关联；页面切换语言时保留当前文档与可对应的章节位置，导航显示当前界面语言。

The system SHALL provide navigation between different help documents on the help page across desktop, tablet, and mobile layouts while preserving full document access, and desktop SHALL keep both topic navigation and in-document TOC directly reachable inside the reading workspace.

#### Scenario: Navigating between help topics

- **WHEN** user selects a different help topic from navigation
- **THEN** the help page SHALL load and display the selected document without page reload

#### Scenario: Mobile help topic switching

- **WHEN** user accesses help on a mobile device and opens the topic list
- **THEN** the system SHALL provide a touch-friendly drawer or panel to switch topics and return to content

#### Scenario: Tablet help topic visibility

- **WHEN** user accesses help on a tablet device
- **THEN** the system SHALL keep topic navigation continuously reachable through a persistent or quickly retrievable side panel

#### Scenario: Desktop topic and TOC stay directly reachable

- **WHEN** user accesses help on a desktop device and a document is selected
- **THEN** the system SHALL keep the topic list and the current document TOC directly reachable alongside the article without replacing them with drawer-style navigation

#### Scenario: Switch language while reading

- **GIVEN** a user is reading a section of a guide
- **WHEN** the UI language changes
- **THEN** the same document and section SHALL open in the new language, including on desktop, tablet and mobile

#### Scenario: Stale language fetch finishes late

- **WHEN** the old language response completes after the new language response
- **THEN** the old response MUST NOT replace the currently selected guide or its navigation

#### Scenario: Legacy guide link

- **WHEN** a user opens an existing document ID and old Chinese heading link
- **THEN** the guide SHALL remain reachable and the corresponding section SHALL be resolved when it exists
