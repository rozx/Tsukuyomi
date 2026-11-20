# Spec Delta

## MODIFIED Requirements

### Requirement: AI can search help documents by keywords

The system SHALL provide a tool that allows AI to search help documents by keywords. The search SHALL match against document titles and descriptions, and additionally against the body of usage guides, returning a list of relevant documents with their metadata. Release notes SHALL be matched by title and description only. The tool SHALL offer an optional fuzzy mode, off by default, in which queries that differ slightly from the document text also match.

#### Scenario: Successful keyword search
- **WHEN** AI invokes the `search_help_docs` tool with a valid keyword
- **THEN** system returns a JSON response with success: true
- **AND** response contains an array of matching documents
- **AND** each document includes id, title, description, category, and file fields
- **AND** matching is case-insensitive

#### Scenario: Keyword found only in a guide's body
- **WHEN** AI invokes the `search_help_docs` tool with a keyword that appears in the body of a usage guide but not in its title or description
- **THEN** the guide is included in the results together with a snippet of text around the match

#### Scenario: Release notes are not searched by body
- **WHEN** AI invokes the `search_help_docs` tool with a keyword that appears only in the body of a release note
- **THEN** the release note is not included in the results, and its body is not fetched for the search

#### Scenario: Optional fuzzy search
- **WHEN** AI invokes the `search_help_docs` tool with fuzzy matching enabled and a keyword that differs slightly from the text of a document
- **THEN** the document is included in the results, ordered by closeness
- **AND** without fuzzy matching the same keyword returns no results

#### Scenario: Empty search results
- **WHEN** AI invokes the `search_help_docs` tool with a keyword that matches no documents
- **THEN** system returns a JSON response with success: true
- **AND** response contains an empty results array
- **AND** response includes a message indicating no matches found

#### Scenario: Invalid search query
- **WHEN** AI invokes the `search_help_docs` tool with an empty or invalid query
- **THEN** system returns a JSON response with success: false
- **AND** response includes an error message explaining the issue
