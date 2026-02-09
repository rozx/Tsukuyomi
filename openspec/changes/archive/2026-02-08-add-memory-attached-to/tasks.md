## 1. Data Model & Storage

- [x] 1.1 Update `Memory` interface in `src/models/memory.ts` to add `attachedTo: MemoryAttachment[]` field
- [x] 1.2 Create `MemoryAttachment` interface with `type` and `id` fields
- [x] 1.3 Add IndexedDB index `by-attachedTo` in database schema (version bump required)
- [x] 1.4 Update `MemoryStorage` interface to include `attachedTo` field
- [x] 1.5 Implement migration logic to default existing memories to `{type: 'book', id: bookId}`
- [x] 1.6 Test IndexedDB migration with existing data

## 2. MemoryService Enhancements

- [x] 2.1 Implement `getMemoriesByAttachment(bookId, attachment)` method with LRU cache support
- [x] 2.2 Implement `getMemoriesByAttachments(bookId, attachments[])` method for OR queries
- [x] 2.3 Update `createMemory()` to default `attachedTo` to `[{type: 'book', id: bookId}]` when not provided
- [x] 2.4 Update `createMemoryWithId()` to handle `attachedTo` parameter
- [x] 2.5 Update `updateMemory()` to support modifying `attachedTo`
- [x] 2.6 Add `attachedTo` to memory cache key considerations (cache key already unique per memory, no change needed)
- [x] 2.7 Clear search cache when attachments change (already implemented via clearSearchCacheForBook)
- [x] 2.8 Write unit tests for new query methods

## 3. Context Builder Integration

- [x] 3.1 Import MemoryService in `context-builder.ts`
- [x] 3.2 Create `getRelatedMemoriesForChunk()` helper function
- [x] 3.3 Update `buildIndependentChunkPrompt()` to extract entities and query attached memories
- [x] 3.4 Format memory context section with "【相关记忆】" header
- [x] 3.5 Implement memory deduplication (by memory ID)
- [x] 3.6 Add memory limit (max 10) with prioritization by lastAccessedAt
- [x] 3.7 Add "... and X more" indicator when memories are omitted
- [x] 3.8 Test context building with various chunk scenarios

## 4. AI Tool Updates

- [x] 4.1 Update `create_memory` tool definition to add `attached_to` parameter
- [x] 4.2 Update `create_memory` handler to pass `attached_to` to MemoryService
- [x] 4.3 Update `update_memory` tool definition to add optional `attached_to` parameter
- [x] 4.4 Update `update_memory` handler to handle `attached_to` updates
- [x] 4.5 Create hybrid retrieval helper function for entity tools (parallel query, merge, deduplicate)
- [x] 4.6 Update `get_character` to use hybrid memory retrieval (merge attachedTo results with keyword results)
- [x] 4.7 Update `search_characters_by_keywords` to use hybrid retrieval
- [x] 4.8 Update `get_term` to use hybrid memory retrieval
- [x] 4.9 Update `search_terms_by_keywords` to use hybrid retrieval
- [x] 4.10 Update `get_book_info` to use hybrid memory retrieval
- [x] 4.11 Update `get_chapter_info` to use hybrid memory retrieval
- [x] 4.12 Update `get_previous_chapter` to use hybrid memory retrieval
- [x] 4.13 Update `get_next_chapter` to use hybrid memory retrieval
- [x] 4.14 Update tool descriptions with attached_to usage guidance
- [x] 4.15 Write tests for updated tool handlers

## 5. AI Prompt Updates

- [x] 5.1 Update system prompt section on Memory management with attached_to best practices
- [x] 5.2 Add examples of when to use different attachment types
- [x] 5.3 Add guidance on updating existing memories to add missing attachments
- [x] 5.4 Update `create_memory` tool description with attached_to parameter explanation
- [x] 5.5 Update `update_memory` tool description with guidance on fixing missing attachments
- [x] 5.6 Add example scenarios in tool descriptions

## 6. Testing & Validation

- [x] 6.1 Test memory creation with various attachment combinations
- [x] 6.2 Test memory update with attachment modifications
- [x] 6.3 Test hybrid retrieval (merge results from both sources, deduplicate)
- [x] 6.4 Test context injection in translation tasks
- [x] 6.5 Test memory deduplication in context
- [x] 6.6 Test migration of existing memories
- [x] 6.7 Test backward compatibility (old keyword search still works)
- [x] 6.8 Performance test: memory queries with 500 memories per book
- [x] 6.9 Integration test: full translation flow with attached memories

## 7. Documentation

- [x] 7.1 Update Memory model documentation
- [x] 7.2 Document new MemoryService methods
- [x] 7.3 Create migration guide for existing memories
- [x] 7.4 Update AI tool documentation
- [x] 7.5 Add examples of well-structured memories with attachments
