# Minimize Translation Schema

## Why

Optimize the JSON return format for translation-related agents to reduce token usage and improve response latency. The current JSON schema uses full property names like `id` and `translation`, which consumes unnecessary tokens.

## What Changes

- Update the system prompts to request the minimized JSON schema (`{"i": 0, "t": "..."}`).
- Use paragraph indices (integers) instead of full UUID strings for identifying paragraphs in both prompts and responses.
- Minimize `titleTranslation` key to `tt`.
- Minimize `status` key to `s` (values remain `planning`, `working`, `review`, `end`).
- Update the response parsing logic to map indices back to original paragraph IDs.
- Apply these changes to translation, polishing, and proofreading tasks.

## Impact

- **Performance**: Reduced output tokens leading to faster responses.
- **Cost**: Lower API costs due to fewer generated tokens.
- **Codebase**: Requires updates to prompts and parsing utilities.
