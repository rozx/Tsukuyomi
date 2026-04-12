## REMOVED Requirements

### Requirement: Memory entity filtering

**Reason**: This capability provided filters to narrow the memory panel view by attachment type (all / book / character / term / chapter) and by specific entities. With the attachment system removed (see `memory-attachments` capability), there is no longer a concept of memory "type" or "attached entity" to filter by. The `MemoryPanel` retains free-text search over memory summary and content, which covers the primary discovery use case, but the type/entity dropdowns are deleted.

**Migration**:
- Delete the type filter dropdown (`全部 / 📚 书籍级 / 👤 角色 / 📝 术语 / 📖 章节`) from `MemoryPanel.vue`
- Delete the entity filter dropdown from `MemoryPanel.vue`
- Delete the filter count calculation logic that iterated over `attachedTo` arrays
- Delete the "仅显示未向量化" filter is ADDED by this change (see `memory-management` delta) but it is the only structural filter remaining; all other entries in the filter toolbar are removed
- Retain free-text search over `summary + content`
- Retain the "清除筛选" button for resetting the text search field
- Users who previously filtered by character or term to find related memories will now rely on:
  1. Free-text search (if they know a keyword)
  2. AI-driven scoring during translation (automatic, invisible)
  3. `get_memory` / `search_memories` AI tools for programmatic access
