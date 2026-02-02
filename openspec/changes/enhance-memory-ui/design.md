## Architecture Overview

This change introduces a comprehensive enhancement to the Memory management UI with four main areas of improvement.

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MemoryPanel.vue                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Filter Toolbar                                          │   │
│  │ [Search] [Type Filter ▼] [Entity Filter ▼*] [Clear]    │   │
│  │ *Disabled when Type is "All" or grouped by type         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Memory Card Grid                                        │   │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │   │
│  │ │MemoryCard│ │MemoryCard│ │MemoryCard│ ...             │   │
│  │ └──────────┘ └──────────┘ └──────────┘                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ MemoryDetailDialog (modal)                              │   │
│  │ ┌─────────────────────────────────────────────────────┐│   │
│  │ │ Attachments │ Content │ Metadata │ Actions          ││   │
│  │ └─────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     ParagraphCard.vue                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Translation Result                                      │   │
│  │ ...                                                     │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ MemoryReferencePanel                                    │   │
│  │ 💡 AI 参考了 3 条记忆 [展开 ▼]                          │   │
│  │   • 📌 世界观-魔法系统                                  │   │
│  │   • 📌 主角背景设定                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. MemoryPanel loads memories
   ↓
2. useMemoryAttachments resolves entity names (lazy + cache)
   ↓
3. Filter state computed from user selection
   ↓
4. Filtered memories displayed in MemoryCard grid
   ↓
5. User clicks card → MemoryDetailDialog opens
   ↓
6. User clicks attachment → Updates filter to specific entity
7. User clicks "Open" on attachment (in Dialog) → Navigation to entity

1. User translates paragraph
   ↓
2. AI tools wrapped to track memory access
   ↓
3. TranslationResult includes referencedMemories
   ↓
4. ParagraphCard displays MemoryReferencePanel
   ↓
5. User clicks reference → MemoryDetailDialog opens
```

## Component Specifications

### MemoryCard.vue

**Purpose**: Display memory summary with attachments and metadata

**Props**:

```typescript
interface MemoryCardProps {
  memory: Memory;
  attachmentNames?: Map<string, string>; // Pre-resolved names
}
```

**Events**:

- `click` - Open detail dialog
- `edit` - Open edit dialog
- `delete` - Request deletion

**Slots**:

- None

**Key Features**:

- Responsive card layout
- Attachment tags with lazy-loaded names (limited to 3-5 with "+N" badge)
- Relative time display
- Hover actions (edit/delete)

### MemoryAttachmentTag.vue

**Purpose**: Display single attachment with icon and name

**Props**:

```typescript
interface MemoryAttachmentTagProps {
  type: 'book' | 'character' | 'term' | 'chapter';
  id: string;
  name?: string; // If not provided, shows loading state
  clickable?: boolean;
}
```

**Events**:

- `click` - Request filter by this entity

**Styling**:

- Type-specific colors
- Compact pill design
- Loading skeleton when name unavailable

### MemoryDetailDialog.vue

**Purpose**: Full memory detail view with navigation

**Props**:

```typescript
interface MemoryDetailDialogProps {
  visible: boolean;
  memory: Memory | null;
  bookId: string;
}
```

**Events**:

- `update:visible` - Close dialog
- `edit` - Request edit
- `delete` - Request delete
- `navigate` - Navigate to entity

**Sections**:

1. Header with title and close
2. Attachments list (grouped by type)
3. Summary display
4. Content display (scrollable)
5. Metadata panel
6. Action buttons

### MemoryReferencePanel.vue

**Purpose**: Show memories referenced during translation

**Props**:

```typescript
interface MemoryReferencePanelProps {
  references: MemoryReference[];
  bookId: string;
  loading?: boolean;
}
```

**Events**:

- `view-memory` - Open memory detail

**States**:

- Collapsed: Show count + expand button
- Expanded: Show list of memory summaries
- Loading: Show spinner
- Empty: Show "未参考记忆"

## Composables

### useMemoryAttachments

**Purpose**: Lazy load and cache attachment entity names

**Interface**:

```typescript
function useMemoryAttachments(options: { bookId: Ref<string>; maxCacheSize?: number }): {
  resolveNames: (attachments: MemoryAttachment[]) => Promise<AttachmentWithName[]>;
  getName: (type: string, id: string) => string | undefined;
  clearCache: () => void;
  isLoading: Ref<boolean>;
  cacheSize: Ref<number>;
};
```

**Caching Strategy**:

- LRU cache with configurable size (default 100)
- Cache key: `${type}:${id}`
- Batch requests with 50ms debounce
- Reactive updates via Vue reactivity

**Batch Resolution**:

```typescript
async function batchResolveNames(
  bookId: string,
  attachments: MemoryAttachment[],
): Promise<Map<string, string>> {
  // Group by type
  const byType = groupBy(attachments, 'type');

  // Parallel resolution per type
  const results = await Promise.all([
    resolveCharacters(bookId, byType.character),
    resolveTerms(bookId, byType.term),
    resolveChapters(bookId, byType.chapter),
  ]);

  return mergeResults(results);
}
```

### Cache Invalidation

- **Triggers**: Listen to external entity store events (Character/Term/Chapter updates)
- **Strategy**:
  - On rename: Update specific cache entry
  - On delete: Remove cache entry
  - On bulk update: Clear relevant type cache
- **Implementation**: Use store subscriptions `store.$subscribe` or global event bus

## State Management

### Filter State

**Location**: MemoryPanel.vue (local state)

```typescript
interface FilterState {
  type: 'all' | 'book' | 'character' | 'term' | 'chapter';
  entityId: string | null;
  searchQuery: string;
}

// Computed filtered memories
const filteredMemories = computed(() => {
  return memories.value.filter((memory) => {
    // Apply type filter
    // Apply entity filter
    // Apply search query
  });
});
```

### Attachment Name Cache

**Location**: useMemoryAttachments composable

```typescript
const nameCache = ref(new Map<string, string>());

// LRU eviction
function evictIfNeeded() {
  if (nameCache.value.size > maxCacheSize) {
    const entriesToDelete = Math.floor(maxCacheSize * 0.2);
    const keys = Array.from(nameCache.value.keys()).slice(0, entriesToDelete);
    keys.forEach((key) => nameCache.value.delete(key));
  }
}
```

## Service Integration

### MemoryService Enhancements

**New Methods** (optional):

```typescript
// Track memory usage
static async recordMemoryUsage(
  memoryId: string,
  paragraphId: string
): Promise<void>;

// Get usage stats
static async getMemoryUsageStats(
  bookId: string,
  memoryId: string
): Promise<{
  useCount: number;
  lastUsedAt: number;
}>;
```

### AI Translation Integration

**Memory Tracking**:

```typescript
// Wrap memory tools in translation service
const trackedTools = memoryTools.map((tool) => ({
  ...tool,
  handler: async (args, ctx) => {
    const result = await tool.handler(args, ctx);
    trackMemoryAccess(tool.name, args, result);
    return result;
  },
}));

// Store references in translation result
const translationResult = {
  translation: generatedText,
  referencedMemories: collectedReferences,
  // ... other fields
};
```

## Performance Considerations

### Lazy Loading

- Attachment names loaded after initial render
- Skeleton placeholders during load
- Batch requests to minimize API calls

### Caching

- Entity names cached with LRU eviction
- Filter counts pre-computed
- Memory list cached in component state

### Virtualization (Future)

- For 500+ memories, consider virtual scrolling
- DataView component supports lazy loading

## Accessibility

### Keyboard Navigation

- Tab order: Filter → Cards → Dialog
- Dialog: ESC to close, Tab to navigate
- Cards: Enter to open detail

### Screen Readers

- Attachment tags: "角色: 主角, 按钮"
- Reference panel: "AI 参考了 3 条记忆, 可展开"
- Dialog: Proper aria-labels and roles

### Focus Management

- Dialog opens: Focus on close button
- Dialog closes: Return focus to triggering card
- Navigation: Maintain focus context

## Error Handling

### Entity Not Found

- Show "[已删除]" grayed out tag
- Disable navigation
- Log warning for debugging

### Load Failure

- Show retry button
- Display error toast
- Fall back to ID-only display

### Translation Tracking Failure

- Silent fail (don't block translation)
- Log error for debugging
- Show "参考记忆信息不可用" in UI

## Testing Strategy

### Unit Tests

- useMemoryAttachments composable
- Filter logic
- Component props/emits

### Integration Tests

- Full filter flow
- Detail dialog navigation
- Translation tracking

### E2E Tests

- User journey: Filter → View → Navigate
- Memory creation → Translation → Verify references

## Migration Path

### Existing Memories

- All existing memories work without changes
- `attachedTo` field already present
- Default behavior: Show as "书籍级" attachment

### Gradual Enhancement

- New features available immediately
- No breaking changes
- Users discover features organically
