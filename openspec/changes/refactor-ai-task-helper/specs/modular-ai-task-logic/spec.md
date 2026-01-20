# Modular AI Task Logic

## ADDED Requirements

### Requirement: Modular Architecture

The AI task helper logic MUST be split into single-responsibility modules.

#### Scenario: Splitting functionalities into modules

- Given the monolithic `ai-task-helper.ts` file
- When the refactoring is applied
- Then logic for task types, model selection, response parsing, stream handling, context building, and tool execution should be in separate files
- And no business logic should be altered
- And external consumers should still be able to import functions
