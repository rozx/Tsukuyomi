# Design: Minimize Translation Schema

## Schema Definition

### Current Schema

```json
{
  "paragraphs": [
    { "id": "p1", "translation": "Text 1" },
    { "id": "p2", "translation": "Text 2" }
  ]
}
```

### New Schema

```json
{
  "s": "working",
  "p": [
    { "i": 0, "t": "Text 1" },
    { "i": 1, "t": "Text 2" }
  ],
  "tt": "Translated Title"
}
```

## Parsing Logic

The `parseStatusResponse` and tool loop logic in `src/services/ai/tasks/utils/ai-task-helper.ts` must be updated.

### Index Mapping Strategy

1. **Prompt Construction**: When building chunks, we will append `[Index] [ID: uuid]`, where Index is the 0-based index of the paragraph _within the current chunk_. The ID is retained for context, but the AI is instructed to use the Index for the response.
2. **Context Management**: The system must maintain a `List<ParagraphID>` that corresponds to the indices sent in the current chunk.
3. **Response Parsing**:
   - The system maps JSON keys:
     - `status` -> `s`
     - `paragraphs` -> `p`
     - `id` -> `i` (integer)
     - `translation` -> `t`
     - `titleTranslation` -> `tt`
   - **Status Values remains unchanged** (`planning`, `working`, `review`, `end`).
   - The AI returns `i: index`.
   - The system looks up `chunkParagraphIds[index]` to recover the UUID.

## Backward Compatibility

During the transition, the parser SHOULD optimally support both formats to avoid breaking active tasks or cached prompts, but the prompt MUST request the new format. Given this is a controlled environment, a hard switch is also acceptable if prompts are updated simultaneously. We will aim for a hard switch as we control the prompts.

## Files to Modify

1. `src/services/ai/tasks/prompts/index.ts` (or relevant prompt builders) - Update instructions.
2. `src/services/ai/tasks/utils/ai-task-helper.ts` - Update parsing.
3. `src/services/ai/tasks/term-translation-service.ts` - Update parsing for term translation if applicable.
