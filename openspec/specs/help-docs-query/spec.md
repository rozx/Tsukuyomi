# Spec: Help Docs Query

## ADDED Requirements

### Requirement: AI can search help documents by keywords

The system SHALL provide a tool that allows AI to search help documents by keywords. The search SHALL match against document titles and descriptions, returning a list of relevant documents with their metadata.

#### Scenario: Successful keyword search
- **WHEN** AI invokes the `search_help_docs` tool with a valid keyword
- **THEN** system returns a JSON response with success: true
- **AND** response contains an array of matching documents
- **AND** each document includes id, title, description, category, and file fields
- **AND** matching is case-insensitive

#### Scenario: Empty search results
- **WHEN** AI invokes the `search_help_docs` tool with a keyword that matches no documents
- **THEN** system returns a JSON response with success: true
- **AND** response contains an empty results array
- **AND** response includes a message indicating no matches found

#### Scenario: Invalid search query
- **WHEN** AI invokes the `search_help_docs` tool with an empty or invalid query
- **THEN** system returns a JSON response with success: false
- **AND** response includes an error message explaining the issue

### Requirement: AI can retrieve full help document content

The system SHALL provide a tool that allows AI to retrieve the full content of a specific help document by its ID. The tool SHALL fetch the Markdown content from the help documentation.

#### Scenario: Successful document retrieval
- **WHEN** AI invokes the `get_help_doc` tool with a valid document ID
- **THEN** system returns a JSON response with success: true
- **AND** response contains the document's title and full Markdown content
- **AND** response includes the document's category and file path

#### Scenario: Invalid document ID
- **WHEN** AI invokes the `get_help_doc` tool with an invalid or non-existent document ID
- **THEN** system returns a JSON response with success: false
- **AND** response includes an error message indicating the document was not found

#### Scenario: Missing document ID parameter
- **WHEN** AI invokes the `get_help_doc` tool without providing the document ID
- **THEN** system returns a JSON response with success: false
- **AND** response includes an error message explaining the missing parameter

### Requirement: AI can list all available help documents

The system SHALL provide a tool that allows AI to list all available help documents. The tool SHALL return a comprehensive list with metadata for each document.

#### Scenario: Successful document listing
- **WHEN** AI invokes the `list_help_docs` tool
- **THEN** system returns a JSON response with success: true
- **AND** response contains an array of all available help documents
- **AND** each document includes id, title, description, category, and file fields
- **AND** documents are organized by category in the response

#### Scenario: Empty help documentation
- **WHEN** AI invokes the `list_help_docs` tool and no help documents are available
- **THEN** system returns a JSON response with success: true
- **AND** response contains an empty documents array
- **AND** response includes a message indicating no documents are available

### Requirement: Help docs tools are available in chat assistant

The system SHALL make all help docs query tools available to the AI in the chat assistant context. The tools SHALL be registered in the ToolRegistry and included in the assistant's tool set.

#### Scenario: Tools available in assistant
- **WHEN** user opens the chat assistant
- **THEN** system includes `search_help_docs`, `get_help_doc`, and `list_help_docs` tools in the AI's tool set
- **AND** tools are available without requiring a bookId (global tools)

#### Scenario: Tool registration
- **WHEN** ToolRegistry initializes
- **THEN** `getHelpDocsTools()` method returns all three help docs tools
- **AND** tools are properly formatted according to the ToolDefinition interface
- **AND** tools include clear descriptions for AI to understand their purpose

### Requirement: Help docs tools provide consistent error handling

The system SHALL provide consistent error handling across all help docs tools. All tools SHALL return responses in a standardized JSON format with success status and error messages when applicable.

#### Scenario: Network error during document retrieval
- **WHEN** AI invokes a help docs tool and a network error occurs
- **THEN** system returns a JSON response with success: false
- **AND** response includes an error message describing the network issue
- **AND** system logs the error for debugging purposes

#### Scenario: Malformed help index file
- **WHEN** help index file is malformed or cannot be parsed
- **THEN** system returns a JSON response with success: false
- **AND** response includes an error message indicating the index file issue
- **AND** system logs the parsing error

### Requirement: Help docs tools support Chinese language

The system SHALL support Chinese language in help document content and search queries. The search functionality SHALL handle Chinese characters correctly.

#### Scenario: Chinese keyword search
- **WHEN** AI invokes the `search_help_docs` tool with Chinese keywords
- **THEN** system correctly matches Chinese characters in titles and descriptions
- **AND** search results are accurate and relevant

#### Scenario: Chinese document content retrieval
- **WHEN** AI invokes the `get_help_doc` tool for a Chinese document
- **THEN** system returns the full Chinese Markdown content
- **AND** content encoding is preserved correctly
