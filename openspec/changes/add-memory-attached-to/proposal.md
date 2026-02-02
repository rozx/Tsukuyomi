## Why

The current Memory system stores AI context as isolated records without explicit relationships to entities (characters, terms, chapters). This makes memory retrieval imprecise—relying solely on keyword search which can return irrelevant results or miss important context. We need a way to explicitly attach memories to specific entities so that when AI queries an entity, relevant memories are automatically provided without relying on fuzzy keyword matching.

## What Changes

- **Add `attachedTo` field to Memory model**: Array of attachments allowing a memory to be linked to multiple entities (characters, terms, chapters, or book)
- **Default attachment behavior**: Memories without explicit attachments default to `{type: 'book', id: bookId}`
- **New MemoryService methods**:
  - `getMemoriesByAttachment()` - query memories attached to a specific entity
  - `getMemoriesByAttachments()` - query memories attached to any of multiple entities (OR logic)
- **Enhanced context building**: Automatically inject attached memories when building chunk prompts for translation tasks
- **Tool updates**:
  - Update `create_memory` and `update_memory` tools to support `attached_to` parameter
  - Update all entity query tools (`get_character`, `get_term`, `get_chapter_info`, etc.) to use hybrid retrieval (merge attachedTo results with keyword results)
- **AI guidance**: Update prompts to teach AI when and how to use `attached_to` for better memory organization
- **Data migration**: Existing memories will be migrated to have default `{type: 'book'}` attachment

## Capabilities

### New Capabilities

- `memory-attachments`: Multi-entity attachment system for memories with automatic context injection during translation

### Modified Capabilities

- `memory-management`: Enhanced memory creation and update workflows to support explicit entity attachments
- `ai-context-building`: Translation context building now includes memories attached to entities present in the current chunk

## Impact

- **Models**: `Memory` interface in `src/models/memory.ts` gains `attachedTo: MemoryAttachment[]` field
- **Services**: `MemoryService` requires new query methods and attachment handling in create/update operations
- **Tools**: All AI tools that query entities need hybrid memory retrieval (merge attachedTo results with keyword results)
- **Context Builder**: `buildIndependentChunkPrompt()` needs to fetch and inject attached memories for terms/characters in chunk
- **IndexedDB**: New index `by-attachedTo` needed for efficient attachment-based queries
- **AI Behavior**: AI will be guided to create more structured memories with explicit entity relationships
- **Backward Compatibility**: Old memories continue to work via keyword fallback; gradual migration to attachment-based retrieval
