## Why

Currently, tools that retrieve paragraph context (`get_previous_paragraphs`, `get_next_paragraphs`, and `get_paragraph_position`) enforce a strict boundary check that restricts them to retrieving paragraphs only within the current processing chunk. This limitation prevents the AI from accessing relevant context (both preceding and succeeding) when translating near chunk boundaries, potentially degrading translation consistency and quality.

While chunk boundaries are important for defining the *output* scope (what to translate), they should not artificially limit the *input* scope (what context to read).

## What Changes

- **Code**: Remove the chunk boundary restriction in `get_previous_paragraphs`, `get_next_paragraphs`, and `get_paragraph_position` tools.
- **Prompts**: Update the translation task prompt to explicitly instruct the AI to focus its *modifications* on the provided chunk/list, while using the context tools purely for understanding.

## Capabilities

### New Capabilities
- `ai-paragraph-tools`: Defines the tools for retrieving paragraph context, specifying that context retrieval should flow freely across chunk boundaries.
- `ai-prompts`: Updates system prompts to enforce focus on the assigned chunk for output, distinguishing between "readable context" and "writable targets".

### Modified Capabilities
<!-- No existing specs are being modified. -->

## Impact

- **Codebase**: `src/services/ai/tools/paragraph-tools.ts`, `src/services/ai/tasks/prompts/translation.ts`
- **Behavior**: AI will have unrestricted access to context but will be guided by prompts to stay on task for output.
