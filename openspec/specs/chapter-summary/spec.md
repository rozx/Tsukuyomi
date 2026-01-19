# chapter-summary Specification

## Purpose
TBD - created by archiving change add-chapter-summary. Update Purpose after archive.
## Requirements
### Requirement: Chapter Summary Generation

The system MUST generate a concise summary of the chapter content using AI after translation or upon request.

#### Scenario: Generate summary after translation

#### Scenario: Generate summary on translation initiation

Given a chapter that is being translated for the first time
When the translation task is **initiated**
Then the system should immediately trigger a summary generation task (parallel to translation)
And the task MUST use the configured "Term Translation" AI model
And the task MUST use the chapter's **source text** as input
And save the summary to the chapter object

#### Scenario: No auto-update on re-translation completion

Given a chapter that was just re-translated
When the translation task completes
Then the system should **NOT** automatically update the summary (unless initiated as a new translation flow)

#### Scenario: Manual Re-summarize

Given a chapter (regardless of translation status)
When the user clicks the "Re-summarize" button in the UI
Then the system should trigger the summary generation task using the Term Translation model
And update the chapter summary with the result

### Requirement: Model Usage Visibility

The system MUST clearly indicate to the user that the Term Translation Model is also used for Chapter Summaries.

#### Scenario: Settings UI Indication

Given the AI Model settings dialog (Global or Novel-specific)
When the user views the "Term Translation Model" selection
Then the label or help text should explicitly mention that this model is used for "Chapter Summaries" as well

### Requirement: Chapter Summary Visibility

The system MUST display the chapter summary in the editor UI as read-only information to assist the user.

#### Scenario: View summary in editor

Given a chapter with a summary
When the user opens the chapter in the editor

#### Scenario: View summary in editor

Given a chapter with a summary
When the user opens the chapter in the editor
Then the summary should be displayed in the UI
And the summary should be read-only
And a "Re-summarize" button should be available

### Requirement: Chapter Summary Context

The system MUST provide the chapter summary to AI tools that provide chapter metadata/listing, but NOT for tools that already provide full content.

#### Scenario: Provide summary in list tools

Given a chapter with a summary
When an AI tool retrieves chapter list or metadata (e.g., `list_chapters`)
Then the chapter summary should be included in the tool output
And this allows the AI to understand the story arc without reading full text

#### Scenario: Exclude summary in content tools

Given a chapter with a summary
When an AI tool retrieves full chapter content
Then the chapter summary should **NOT** be included to conserve tokens (as full text is present)

