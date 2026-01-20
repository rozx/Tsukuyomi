# Schema Optimization

## ADDED Requirements

### Requirement: Translation Output Format

The AI agents involved in translation, polishing, and proofreading MUST return results using a minimized JSON schema.

#### Scenario: Translation Task

Given a translation task with multiple paragraphs
When the AI generates the response
Then the JSON output MUST use the key "p" for the array of paragraphs
And each paragraph object MUST use "i" for the integer index and "t" for the translated text
And if a title is translated, the JSON output MUST use the key "tt" instead of "titleTranslation"
And the JSON output MUST use the key "s" for status.

#### Scenario: Prompt Input Format

Given a text chunk construction
When formatting paragraphs for the AI
Then each paragraph MUST be prefixed with `[Index]` instead of `[ID: UUID]`
And the System MUST maintain a mapping of `Index -> UUID` to resolve the response.

#### Scenario: Term Translation Task

Given a term translation task
When the AI generates the response
Then the JSON output MUST use the key "t" for the translation instead of "translation".
