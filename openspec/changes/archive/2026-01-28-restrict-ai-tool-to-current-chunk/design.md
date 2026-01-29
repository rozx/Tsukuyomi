## Context

The AI translation system processes chapters in chunks to manage token limits. Each chunk contains a subset of paragraphs from the chapter. Currently, the AI can use tools like `get_next_paragraphs` to fetch paragraphs beyond the current chunk's boundaries. This allows the AI to:
- Peek at content that should be translated in subsequent chunks
- Potentially skip or inconsistently translate content
- Break the sequential processing model where each chunk is processed independently

The chunk information (`paragraphIds`) is available in the task runner (`ToolCallLoopConfig`) but is not passed down to the tool handlers. The tool handlers only receive a `ToolContext` with `bookId`, `taskId`, `sessionId`, `onAction`, and `onToast`.

## Goals / Non-Goals

**Goals:**
- Prevent AI from accessing paragraphs outside the current chunk during translation/polish/proofreading tasks
- Provide clear error messages when AI attempts to access out-of-bounds paragraphs
- Maintain backward compatibility for non-chunked contexts (e.g., AI assistant chat)
- Keep the boundary enforcement lightweight and non-intrusive

**Non-Goals:**
- Changing how chunks are created or processed
- Modifying the AI prompt structure
- Restricting other tools (terminology, character, memory tools)
- Enforcing boundaries on `find_paragraph_by_keywords` (search tool with different semantics)

## Decisions

### 1. Pass Chunk Boundaries via ToolContext

**Decision:** Extend `ToolContext` interface to include optional chunk boundary information.

```typescript
interface ToolContext {
  bookId?: string;
  taskId?: string;
  sessionId?: string;
  onAction?: (action: ActionInfo) => void;
  onToast?: ToastCallback;
  // NEW: Chunk boundaries for boundary enforcement
  chunkBoundaries?: {
    allowedParagraphIds: Set<string>;  // Fast O(1) lookup
    firstParagraphId: string;          // For boundary error messages
    lastParagraphId: string;           // For boundary error messages
  };
}
```

**Rationale:** 
- Uses existing context propagation mechanism
- Optional field maintains backward compatibility
- `Set` provides O(1) lookup for boundary checking
- Minimal changes to existing code paths
- **Scope enforcement**: Only translation, polish, and proofreading services will provide `chunkBoundaries`; AI assistant and other contexts will leave it undefined, allowing unrestricted access

**Alternatives considered:**
- Global state: Rejected - breaks isolation, hard to test
- Tool-specific parameters: Rejected - requires changing tool call signatures significantly
- Wrap tool handlers: Rejected - more complex, harder to maintain

### 2. Boundary Check Logic in Tool Handlers

**Decision:** Add boundary validation at the start of affected tool handlers (`get_next_paragraphs`, `get_previous_paragraphs`, `get_paragraph_position`).

**Logic flow:**
1. Check if `chunkBoundaries` exists in context
2. If not, allow the request (backward compatibility for non-chunked contexts)
3. If yes, validate that requested paragraph(s) are within `allowedParagraphIds`
4. If out of bounds, return error message explaining the restriction

**Error message format:**
```json
{
  "success": false,
  "error": "无法获取超出当前翻译范围的段落。当前处理范围：段落 ${firstId} 至 ${lastId}。请专注于翻译当前提供的段落。"
}
```

**Rationale:**
- Clear feedback to AI about why the request failed
- Encourages AI to focus on current chunk
- Matches existing error response format

### 3. Propagation Through Call Chain

**Decision:** Pass `paragraphIds` through the execution chain:

```
TranslationService.translate()
  → executeToolCallLoop() [config.paragraphIds]
    → TaskLoopSession.processToolCalls()
      → ToolRegistry.handleToolCall() [NEW: accept paragraphIds]
        → individual tool handlers [receive via context.chunkBoundaries]
```

**Rationale:**
- Follows existing data flow patterns
- Minimizes signature changes
- Allows future expansion (e.g., different boundary rules per task type)

### 4. Boundary Enforcement Scope

**Decision:** Only enforce boundaries on tools that directly access paragraphs by position/sequence:
- `get_next_paragraphs` - **ENFORCE** (can fetch beyond chunk)
- `get_previous_paragraphs` - **ENFORCE** (for consistency)
- `get_paragraph_position` with `include_next`/`include_previous` - **ENFORCE**
- `get_paragraph_info` - **DO NOT ENFORCE** (single paragraph by ID, should be in current chunk anyway)
- `find_paragraph_by_keywords` - **DO NOT ENFORCE** (search tool with different semantics)

**Rationale:**
- Targeted enforcement minimizes disruption
- Search tools have legitimate cross-chunk use cases
- Single paragraph lookup is implicitly bounded by chunk assignment

## Risks / Trade-offs

**[Risk] AI confusion when boundary error occurs**
- The AI may not understand why it cannot access certain paragraphs
- **Mitigation:** Clear error messages; boundary info in system prompt (future enhancement)

**[Risk] Legitimate use cases blocked**
- AI might need limited context from adjacent chunks for translation quality
- **Mitigation:** Each chunk already includes some buffer/overlap; error message suggests focusing on current chunk

**[Risk] Performance impact of Set lookups**
- Boundary checking adds overhead to every tool call
- **Mitigation:** O(1) Set lookup is negligible; only enforced when `chunkBoundaries` provided

**[Risk] Breaking existing behavior**
- Some translation flows may depend on cross-chunk access
- **Mitigation:** Boundary enforcement only applies when `chunkBoundaries` is provided; non-chunked contexts (assistant chat) unaffected

## Migration Plan

1. **Phase 1:** Implement core changes
   - Extend `ToolContext` interface
   - Modify `ToolRegistry.handleToolCall()` signature
   - Update tool handlers with boundary checks

2. **Phase 2:** Update task services
   - Pass `paragraphIds` from translation-service
   - Pass `paragraphIds` from polish-service  
   - Pass `paragraphIds` from proofreading-service

3. **Phase 3:** Testing
   - Verify boundary enforcement works
   - Verify non-chunked contexts remain unaffected
   - Verify error messages are helpful

4. **Rollback:** Remove `paragraphIds` parameter from tool execution calls to revert
