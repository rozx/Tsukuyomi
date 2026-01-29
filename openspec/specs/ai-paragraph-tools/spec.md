# ai-paragraph-tools Specification

## Purpose
TBD - created by archiving change allow-cross-chunk-paragraphs. Update Purpose after archive.
## Requirements
### Requirement: Cross-Chunk Context Retrieval
All paragraph context retrieval tools (`get_previous_paragraphs`, `get_next_paragraphs`, `get_paragraph_position`) SHALL retrieve the specified paragraphs from the book content, ignoring any processing chunk boundaries.

#### Scenario: Fetching previous context at chunk start
- **WHEN** `get_previous_paragraphs` is called for the first paragraph in a chunk
- **THEN** it returns paragraphs from the immediately preceding chunk (if it exists)

#### Scenario: Fetching next context at chunk end
- **WHEN** `get_next_paragraphs` is called for the last paragraph in a chunk
- **THEN** it returns paragraphs from the immediately succeeding chunk (if it exists)

#### Scenario: Position info context
- **WHEN** `get_paragraph_position` is called with `include_previous=true` or `include_next=true`
- **THEN** the returned context lists include paragraphs outside the current chunk boundary if applicable

### Requirement: Focused Task Prompts
The task prompts for Translation, Polishing, and Proofreading SHALL include specific instructions to ensure the AI differentiates between "context" and "work items".

#### Scenario: Translation Prompt
- **WHEN** generating the system prompt for a translation task
- **THEN** the prompt instructs the AI to use context tools freely but modify ONLY the assigned paragraphs.

#### Scenario: Polishing Prompt
- **WHEN** generating the system prompt for a polishing task
- **THEN** the prompt instructs the AI to use context tools freely but modify ONLY the assigned paragraphs.

#### Scenario: Proofreading Prompt
- **WHEN** generating the system prompt for a proofreading task
- **THEN** the prompt instructs the AI to use context tools freely but modify ONLY the assigned paragraphs.

