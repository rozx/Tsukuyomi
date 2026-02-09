## Context

The Memory system currently stores AI context as flat records with only `bookId` for scoping. When AI queries a character, term, or chapter, we rely on keyword search against memory summaries to find relevant context. This approach has several issues:

1. **Imprecise retrieval**: Keyword search can return irrelevant memories or miss important ones
2. **No explicit relationships**: Memories about "主角的背景故事" have no explicit link to the protagonist character
3. **Redundant keywords**: AI must stuff entity names into summaries to make them searchable
4. **Context gaps**: When translating a chunk containing character A, we can't automatically provide memories specifically about character A

The current architecture uses:

- `Memory` model with `id`, `bookId`, `content`, `summary`, timestamps
- `MemoryService` with keyword-based search (`searchMemoriesByKeywords`)
- Tools like `get_character` that manually search memories by character name
- Context building that only includes terms and characters, not their associated memories

## Goals / Non-Goals

**Goals:**

- Enable explicit many-to-many relationships between memories and entities (character, term, chapter, book)
- Provide automatic memory injection when building translation context for chunks
- Support hybrid retrieval (attachment-based first, keyword fallback for backward compatibility)
- Guide AI to create well-structured memories with proper attachments
- Maintain backward compatibility with existing memories during migration period

**Non-Goals:**

- Replacing the existing keyword search entirely (it remains as fallback)
- Automatic attachment detection (AI must explicitly specify attachments)
- Memory hierarchy or inheritance (attachments are flat relationships)
- Real-time memory updates during translation (memories are read-only in context)

## Decisions

### Decision: Array-based attachments with simple structure

**Choice**: `attachedTo: {type, id}[]` - array of simple objects

**Rationale**:

- Simple to understand and implement
- Supports multiple entities naturally (memory about character A in chapter B)
- No need for complex relation metadata (primary/secondary) - AI can infer importance from content

**Alternatives considered**:

- Single `entityType` + `entityId` fields: Too limiting (can't attach to both character and chapter)
- Complex relation object with `relation` field (primary/secondary): Over-engineered for current needs
- Separate join table: Unnecessary complexity for IndexedDB

### Decision: Default book-level attachment

**Choice**: Memories without explicit attachments default to `{type: 'book', id: bookId}`

**Rationale**:

- Every memory has at least one attachment (no null handling)
- Book-level queries continue to work as before
- Clear migration path for existing data

**Alternatives considered**:

- Null/undefined for unattached memories: Complicates queries (need null checks)
- Require explicit attachment on creation: Breaks backward compatibility, requires immediate AI behavior change

### Decision: Hybrid retrieval strategy (Merge & Deduplicate)

**Choice**: Query both `by-attachedTo` and `searchByKeyword`, then merge results and deduplicate by ID.

**Rationale**:

- **Safety**: Prevents context loss during migration. If a new memory is created with an attachment, we still need to find old legacy memories that match the keyword but aren't attached yet.
- **Completeness**: Ensures AI sees full context regardless of migration state.
- **Robustness**: Keyword search acts as a safety net even for fully migrated systems.

**Alternatives considered**:

- **Fallback only** (Attachment first, then keyword): Risk of "hiding" legacy memories. If one result exists in attachments, keywords wouldn't be searched, missing potentially dozens of unattached legacy memories.
- **Complete replacement**: Would break all existing memories until migrated.

### Decision: Automatic memory injection in context builder

**Choice**: `buildIndependentChunkPrompt()` automatically queries and includes attached memories

**Rationale**:

- AI gets relevant context without explicit tool calls
- Reduces token usage (no need for AI to search memories manually)
- Consistent with existing automatic term/character injection

**Implementation approach**:

1. Extract terms and characters from chunk (existing logic)
2. Query memories attached to those entities via `getMemoriesByAttachments()`
3. Format and inject into prompt after the "【当前部分出现的术语和角色】" section

### Decision: IndexedDB index on attachments

**Choice**: Create `by-attachedTo` compound index for efficient queries

**Rationale**:

- Need to query by both type and id efficiently
- Compound index supports exact match queries
- Migration requires IndexedDB version bump

**Index design**:

```typescript
// Key path: bookId + type + id (compound)
// Query pattern: getAll([bookId, type, id]) for exact match
// For OR queries across multiple entities: multiple getAll calls, merge results
```

### Decision: No automatic attachment inference

**Choice**: AI must explicitly specify attachments; no auto-detection from content

**Rationale**:

- Keeps implementation simple
- AI has full control over attachment semantics
- Avoids false positives from keyword matching

**Trade-off**: Requires AI behavior change (prompt updates needed)

## Risks / Trade-offs

**[Risk] AI may not consistently use attachments** → **Mitigation**: Strong prompt guidance in tool descriptions; consider validation or reminder prompts if adoption is low

**[Risk] Memory context may become too large** → **Mitigation**: Limit memories per chunk (e.g., max 10); prioritize by lastAccessedAt; include "... and X more" indicator

**[Risk] IndexedDB migration complexity** → **Mitigation**: Version bump with migration logic; default all existing memories to book attachment; test migration path thoroughly

**[Risk] Duplicate memories in context** (same memory attached to multiple entities in chunk) → **Mitigation**: Deduplicate by memory ID before formatting context

**[Risk] Performance impact of memory queries** → **Mitigation**: Use existing MemoryService cache; batch queries with `getMemoriesByAttachments()`; measure during implementation

**[Trade-off] Attachment storage overhead**: Each attachment adds ~20 bytes per memory. With 500 memories per book max, this is ~10KB overhead - acceptable.

**[Trade-off] Complexity vs. benefit**: This adds significant complexity (new index, new query methods, prompt updates). Benefit is more precise context retrieval and reduced AI tool calls.

## Migration Plan

### Phase 1: Data Model & Storage (deployable)

1. Update `Memory` interface with `attachedTo` field
2. Add IndexedDB index `by-attachedTo`
3. Update `MemoryService.createMemory()` to default attachments to book
4. Migration: On first access, existing memories get `{type: 'book', id: bookId}` attachment

### Phase 2: Query Methods (deployable)

1. Implement `getMemoriesByAttachment()` and `getMemoriesByAttachments()`
2. Add hybrid retrieval helper for tools
3. Unit tests for new query methods

### Phase 3: Context Integration (deployable)

1. Update `buildIndependentChunkPrompt()` to inject attached memories
2. Add memory formatting utilities
3. Test with real translation tasks

### Phase 4: Tool Updates (deployable)

1. Update `create_memory` and `update_memory` tool descriptions
2. Add `attached_to` parameter to tools
3. Update all entity query tools to use hybrid retrieval

### Phase 5: AI Guidance (deployable)

1. Update system prompts with attachment best practices
2. Monitor AI usage patterns
3. Iterate on prompt guidance based on observed behavior

**Rollback**: Each phase is independently deployable. Rollback involves reverting to keyword-only retrieval (tools already support fallback).

## Open Questions

1. **Memory limit per chunk**: Is 10 memories sufficient? Should it be configurable per book?

2. **Attachment validation**: Should we validate that attached entities actually exist (character/term/chapter IDs are valid)? Pro: prevents orphaned attachments. Con: adds complexity and requires entity lookup on memory creation.

3. **Memory priority**: Currently using `lastAccessedAt` for prioritization. Should we consider other factors (creation time, attachment count, manual pinning)?

4. **Bulk attachment updates**: Should we provide a tool for AI to bulk-update attachments on existing memories (e.g., "attach all memories mentioning '田中太郎' to that character")?

5. **Attachment removal guidance**: How do we guide AI to remove incorrect attachments? Current `update_memory` replaces entire `attached_to` array.
