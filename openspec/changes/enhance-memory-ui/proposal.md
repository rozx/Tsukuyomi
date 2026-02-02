## Why

The current MemoryPanel provides basic CRUD operations but lacks visibility into how memories relate to the novel's entities. Users cannot see which characters, terms, or chapters a memory is attached to without opening the edit dialog. This makes it difficult to:

1. **Understand memory context** - Users can't quickly see what a memory is about or which entities it relates to
2. **Navigate related content** - There's no way to jump from a memory to the character/term/chapter it describes
3. **Filter and organize** - With potentially hundreds of memories per book, users need filtering by entity type to manage them effectively
4. **Trust AI translations** - Users have no visibility into which memories the AI actually used during translation, making it hard to verify context was considered

The recent addition of `attachedTo` field to the Memory model provides the data foundation, but the UI doesn't expose this information in a user-friendly way.

## What Changes

### New Components

- **MemoryCard.vue** - Redesigned card component replacing SettingCard for memory display
  - Shows memory summary and content preview
  - Displays attachment tags (book/character/term/chapter) with icons
  - Shows last accessed time with relative formatting
  - Supports click-to-open detail view

- **MemoryAttachmentTag.vue** - Reusable attachment tag component
  - Type-specific icons (📚 book, 👤 character, 📝 term, 📖 chapter)
  - Displays entity name (lazy-loaded with caching)
  - Clickable navigation to entity detail
  - Color-coded by type

- **MemoryDetailDialog.vue** - Enhanced detail dialog
  - Full content display with syntax highlighting
  - Complete attachment list with navigation links
  - Metadata panel (created time, access history, usage stats)
  - Quick actions (edit, delete, jump to entity)

- **MemoryReferencePanel.vue** - Translation context visibility
  - Shows which memories were referenced during translation
  - Expandable list with memory summaries
  - Links to open memory detail
  - Usage count indicator

### Enhanced Components

- **MemoryPanel.vue** updates:
  - Filter toolbar with type dropdown (all/book/character/term/chapter)
  - Secondary filter dropdown for specific entities
  - Search integration with filters
  - Uses new MemoryCard grid layout

### Service Enhancements

- **useMemoryAttachments composable** - Lazy loading with caching
  - Batch name resolution for attachments
  - LRU cache for entity names
  - Reactive updates when entities change

- **Memory usage tracking** - Optional enhancement
  - Track which memories are used in translations
  - Store reference count and last used time
  - Provide data for MemoryReferencePanel

## Capabilities

### New Capabilities

- `memory-attachment-visualization`: Display memory-to-entity relationships with lazy-loaded names and navigation
- `memory-entity-filtering`: Filter memories by attachment type and specific entities with real-time search
- `memory-detail-view`: Rich detail dialog with full content, metadata, and entity navigation
- `translation-memory-visibility`: Show which memories were referenced during AI translation

### Modified Capabilities

- `memory-management`: Enhanced MemoryPanel with filtering, new card design, and detail view
- `memory-creation`: Support for setting attachments during manual memory creation

## Impact

- **Components**:
  - New: MemoryCard.vue, MemoryAttachmentTag.vue, MemoryDetailDialog.vue, MemoryReferencePanel.vue
  - Modified: MemoryPanel.vue (filtering, card grid), ParagraphCard.vue (add MemoryReferencePanel)
- **Composables**:
  - New: useMemoryAttachments.ts (lazy loading + caching)
- **Services**:
  - Enhanced: MemoryService (optional usage tracking methods)
  - AI translation service (track referenced memories)
- **Models**:
  - No changes to existing models (uses existing `attachedTo` field)
  - Optional: MemoryUsageStats interface for tracking
- **AI Integration**:
  - Translation tasks record which memories are accessed
  - Memory tools may need to expose usage to UI
- **User Experience**:
  - Memories are more discoverable and contextual
  - Users can navigate from memories to related entities
  - Translation quality becomes more transparent
  - Memory management scales better with filtering

## Non-Goals

- Editing attachments in UI (AI manages attachments)
- Complex memory relationships (graph view)
- Memory versioning or history
- Automatic memory creation from UI
