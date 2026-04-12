## REMOVED Requirements

### Requirement: Memory attachments support multiple entities

**Reason**: The memory attachment system is replaced by the multi-signal relevance scoring system (`memory-relevance-scoring` capability). Relevance to specific entities is now computed at injection time via keyword hit ratio and semantic similarity, without requiring users or AI to manually maintain `attachedTo` relationships. Maintaining the attachment system alongside scoring would add maintenance burden with no additional recall benefit.

**Migration**:
- Remove `attachedTo` field from `Memory` interface and `MemoryAttachment` / `MemoryAttachmentType` types entirely
- Bump IndexedDB `DB_VERSION` from 8 to 9
- Add v9 upgrade branch in `getDB()` that iterates all memory records and physically deletes the `attachedTo` field
- Migration is atomic within the IDB upgrade transaction; on failure, DB stays at v8 and retries on next startup
- `sync-data-service` strips the field during both Gist serialization and deserialization as defensive double-safety
- See change design doc Decision 11 for full hard migration details

### Requirement: Attachment-based memory retrieval

**Reason**: With attachments removed, there is nothing to retrieve by. Memory retrieval now uses `MemoryService.getAllBookMemories(bookId)` which returns all memories for a book in one query, followed by in-memory relevance scoring.

**Migration**:
- Delete `MemoryService.getMemoriesByAttachment(bookId, attachment)` method
- Delete `MemoryService.getMemoriesByAttachments(bookId, attachments)` method
- The `by-attachedTo` IndexedDB index was already removed in v8; no additional index work required
- All callers migrate to `getAllBookMemories` + filter or to the scoring pipeline

### Requirement: Automatic memory injection in translation context

**Reason**: Memory injection still happens automatically in translation context, but the mechanism has changed from "retrieve attached memories for each entity" to "score all book memories against the chunk and select top-N within character budget". The intent of the requirement (automatic relevant-memory injection) survives in the `memory-relevance-scoring` and `ai-context-building` capabilities.

**Migration**:
- `getRelatedMemoriesForChunk` is rewritten to use the scoring pipeline instead of per-entity attachment retrieval
- See `ai-context-building` capability delta for the replacement requirements

### Requirement: Hybrid memory retrieval for backward compatibility

**Reason**: This requirement provided fallback from attachment retrieval to keyword search. With attachments removed, there is no retrieval path to fall back FROM. Keyword matching becomes one of three first-class scoring signals (not a fallback) via the `keywordHitRatio` signal in the scoring formula.

**Migration**: Keyword matching logic is absorbed into `memory-scoring.ts`. No separate fallback path exists.
