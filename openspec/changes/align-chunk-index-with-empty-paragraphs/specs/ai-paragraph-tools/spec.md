## ADDED Requirements

### Requirement: Paragraph index semantics are chapter-original

Paragraph tools that return `paragraph_index` SHALL report the paragraph's original position in chapter content, where empty paragraphs are counted.

#### Scenario: Querying paragraph info with empty paragraphs in chapter

- **WHEN** `get_paragraph_info` is called for a paragraph whose chapter contains empty paragraphs before it
- **THEN** the returned `paragraph_index` SHALL include those empty paragraphs in the count
- **AND THEN** the value SHALL match the paragraph's original chapter array position

#### Scenario: Querying previous or next paragraphs

- **WHEN** `get_previous_paragraphs` or `get_next_paragraphs` returns context paragraphs
- **THEN** each returned paragraph's `paragraph_index` SHALL use chapter-original indexing
- **AND THEN** index values MAY be non-continuous if empty paragraphs exist between returned items

## MODIFIED Requirements

### Requirement: Focused Task Prompts

The task prompts for Translation, Polishing, and Proofreading SHALL include specific instructions to ensure the AI differentiates between "context" and "work items", uses tools instead of JSON output, and treats index as display-only while submitting by `paragraph_id`.

#### Scenario: Translation prompt with tools and identifier rules

- **WHEN** generating the system prompt for a translation task
- **THEN** the prompt SHALL instruct the AI to use context tools freely
- **AND THEN** the prompt SHALL instruct the AI to use `update_task_status` and `add_translation_batch` tools to submit results
- **AND THEN** the prompt SHALL explicitly instruct the AI NOT to output JSON, but to use tools
- **AND THEN** the prompt SHALL explicitly state that index is for location only and submission MUST use `paragraph_id`

#### Scenario: Polishing prompt with tools and identifier rules

- **WHEN** generating the system prompt for a polishing task
- **THEN** the prompt SHALL instruct the AI to use context tools freely
- **AND THEN** the prompt SHALL instruct the AI to use `update_task_status` and `add_translation_batch` tools to submit results
- **AND THEN** the prompt SHALL explicitly instruct the AI NOT to output JSON, but to use tools
- **AND THEN** the prompt SHALL explicitly state that index is for location only and submission MUST use `paragraph_id`

#### Scenario: Proofreading prompt with tools and identifier rules

- **WHEN** generating the system prompt for a proofreading task
- **THEN** the prompt SHALL instruct the AI to use context tools freely
- **AND THEN** the prompt SHALL instruct the AI to use `update_task_status` and `add_translation_batch` tools to submit results
- **AND THEN** the prompt SHALL explicitly instruct the AI NOT to output JSON, but to use tools
- **AND THEN** the prompt SHALL explicitly state that index is for location only and submission MUST use `paragraph_id`
