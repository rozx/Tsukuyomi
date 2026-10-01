## MODIFIED Requirements

### Requirement: Help docs tools support Chinese language

The system SHALL support zh-CN, zh-TW and en-US guide content and search metadata, using the calling AI execution's UI language. The search functionality SHALL handle Unicode characters correctly and stable document IDs SHALL be shared across languages. The Chinese scenarios below continue to apply to zh-CN and zh-TW.

#### Scenario: Chinese keyword search

- **WHEN** AI invokes the `search_help_docs` tool with Chinese keywords
- **THEN** system correctly matches Chinese characters in titles and descriptions
- **AND** search results are accurate and relevant

#### Scenario: Chinese document content retrieval

- **WHEN** AI invokes the `get_help_doc` tool for a Chinese document
- **THEN** system returns the full Chinese Markdown content
- **AND** content encoding is preserved correctly

#### Scenario: English guide search and retrieval

- **GIVEN** an English-language assistant execution
- **WHEN** it searches English guide metadata and retrieves a matching document ID
- **THEN** the result SHALL contain the full English guide and metadata, not a Chinese-only search index

#### Scenario: Missing localized resource

- **WHEN** the requested translated guide cannot be loaded
- **THEN** the tool SHALL report a localized loading error rather than claim a complete translated guide was returned
