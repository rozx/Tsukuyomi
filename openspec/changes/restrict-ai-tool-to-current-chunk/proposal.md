## Why

When AI is translating a chunk of paragraphs, it can currently use tools like `get_next_paragraphs` to fetch paragraphs outside the current chunk boundaries. This allows the AI to skip ahead and attempt to translate content that should be handled in subsequent chunks, breaking the sequential translation workflow and potentially causing incomplete or inconsistent translations.

## What Changes

- Add chunk boundary enforcement to AI paragraph-related tools
- Track current chunk's paragraph ID range during translation tasks
- Modify `get_next_paragraphs` tool to respect chunk boundaries and reject requests for paragraphs outside current chunk
- Modify `get_previous_paragraphs` tool to respect chunk boundaries (optional, but for consistency)
- Modify `get_paragraph_position` tool to optionally restrict `include_next`/`include_previous` to chunk boundaries
- Ensure tools return appropriate error/warning messages when boundary is violated
- Add context parameter to tool execution that includes current chunk's paragraph ID range
- **Scope restriction**: Only translation-related agents (translation, polishing, proofreading) will pass chunk boundaries; AI assistant and other contexts remain unrestricted

## Capabilities

### New Capabilities
- `ai-tool-chunk-boundary`: Restrict AI paragraph tools to only access paragraphs within the current processing chunk

### Modified Capabilities
- `paragraph-tools`: Modify tool handlers to check chunk boundaries before returning paragraph data
- `translation-service`: Pass chunk boundary context to tool execution
- `polish-service`: Pass chunk boundary context to tool execution  
- `proofreading-service`: Pass chunk boundary context to tool execution

## Impact

**Affected files:**
- `src/services/ai/tools/paragraph-tools.ts` - Add boundary checks to `get_next_paragraphs`, `get_previous_paragraphs`, `get_paragraph_position`
- `src/services/ai/tools/types.ts` - Add chunk boundary context to tool execution context
- `src/services/ai/tasks/translation-service.ts` - Pass chunk boundaries to tool execution
- `src/services/ai/tasks/polish-service.ts` - Pass chunk boundaries to tool execution
- `src/services/ai/tasks/proofreading-service.ts` - Pass chunk boundaries to tool execution
- `src/services/ai/tasks/utils/tool-executor.ts` - Accept and forward chunk boundary context

**Behavior change:** AI will no longer be able to access paragraphs outside the current chunk during translation/polish/proofreading tasks. If AI attempts to access out-of-bounds paragraphs, the tool will return an error message explaining the boundary restriction.

**Scope clarification:** This restriction only applies to translation-related task types (translation, polish, proofreading). The AI assistant and other non-chunked contexts will continue to work without chunk boundaries, allowing full access to all paragraphs.
