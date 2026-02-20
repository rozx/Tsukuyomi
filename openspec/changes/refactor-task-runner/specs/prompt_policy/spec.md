# Capability: prompt_policy

## ADDED Requirements

### Requirement: Transition Prompt Isolation

- **GIVEN** a task executing a valid `transition(prev, next)`
- **WHEN** building the LLM message history modifier
- **THEN** an isolated `PromptPolicy` layer must evaluate the contextual modifiers (e.g., handling the `isBriefPlanning` warning or missing paragraphs payload) without tying it to the underlying `TaskLoopSession` network state.

### Requirement: Refusal Error Formulation

- **GIVEN** an error or interception triggered by the `ToolDispatchSystem` (e.g., unauthorized tool, tool limit reached, status restricted tool)
- **WHEN** building the exact simulated AI tool-return strings
- **THEN** it must use exact formatting mapped from `PromptPolicy` to preserve identical AI generation reactions.
