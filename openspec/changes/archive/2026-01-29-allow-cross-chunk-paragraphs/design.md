## Context

The current implementation of `paragraph-tools.ts` enforces strict chunk boundaries for context retrieval. We previously considered removing only the backward constraint, but realized that context is holistic. The standard should be: "Read anything, Write only assigned".

## Goals / Non-Goals

**Goals:**
- Enable `get_previous_paragraphs` to access previous chunks.
- Enable `get_next_paragraphs` to access next chunks.
- Enable `get_paragraph_position` to access both.
- Ensure the specific logic for limiting *output* is handled via Prompts in Translation, Polishing, and Proofreading tasks.

**Non-Goals:**
- Changing the inputs to the tools (chunkBoundaries might still be passed but ignored, or removed entirely from handler logic).

## Decisions

### Remove All Chunk Boundary Filters in Tools
We will remove `isParagraphInChunk` checks and `filterResultsByChunkBoundary` filtering from all read tools in `paragraph-tools.ts`.
Note: We may still want to keep the helper functions in the file if they are used elsewhere or just suppress their usage in these specific handlers.

### soft-Constraint via Prompting
We will modify the prompt files for Translation, Polishing, and Proofreading tasks.

**Rationale:** This moves the responsibility of "staying on track" to the intelligent agent's reasoning, rather than hard-coding it into the data access layer, which is more flexible for advanced models.

## Risks / Trade-offs

- **Risk**: Agent might get confused and try to translate the context paragraphs.
- **Mitigation**: Strong prompt engineering. The prompt must explicitly say "Context is for reference only".
