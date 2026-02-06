# Capability: Memory Attachment Visualization

## Overview

Display memory-to-entity relationships with lazy-loaded names and navigation capabilities.

## User Stories

- As a user, I want to see which entities a memory is attached to so I can understand its context
- As a user, I want to click on an attachment to navigate to that entity's detail page
- As a user, I want attachment names to load quickly without blocking the UI

## Functional Requirements

### Display

- [ ] Memory cards must show all attachments as tags
- [ ] Each tag must display: type icon + entity name
- [ ] Tags must be color-coded by type:
  - Book: 📚 blue
  - Character: 👤 green
  - Term: 📝 purple
  - Chapter: 📖 orange
- [ ] Tags must show tooltip with full entity name on hover
- [ ] Tags must be clickable and navigate to entity detail

### Lazy Loading

- [ ] Attachment names must be loaded lazily (not in initial memory fetch)
- [ ] Names must be cached to avoid repeated queries
- [ ] Cache must use LRU strategy with max 100 entries
- [ ] Cache must be reactive - updates when entities change
- [ ] Loading state must show skeleton or placeholder

### Navigation

- [ ] Clicking character tag opens CharacterPopover
- [ ] Clicking term tag opens TermPopover
- [ ] Clicking chapter tag navigates to that chapter
- [ ] Clicking book tag does nothing (already in book context)

## Technical Requirements

### Data Flow

```
MemoryCard
  ├── receives: Memory (with attachedTo: {type, id}[])
  ├── uses: useMemoryAttachments(bookId)
  │         ├── batchResolveNames(attachments)
  │         ├── cache: Map<`${type}:${id}`, name>
  │         └── returns: Reactive attachment list with names
  └── renders: MemoryAttachmentTag[]
```

### API

```typescript
// composables/useMemoryAttachments.ts
interface UseMemoryAttachmentsOptions {
  bookId: Ref<string>;
  maxCacheSize?: number; // default: 100
}

interface AttachmentWithName extends MemoryAttachment {
  name: string;
  loading: boolean;
}

function useMemoryAttachments(options: UseMemoryAttachmentsOptions): {
  resolveNames: (attachments: MemoryAttachment[]) => Promise<AttachmentWithName[]>;
  getName: (type: string, id: string) => string | undefined;
  clearCache: () => void;
  isLoading: Ref<boolean>;
};
```

### Performance

- [ ] Initial render must not wait for name resolution
- [ ] Name resolution must batch requests (debounce 50ms)
- [ ] Cache hit rate should be >80% for typical usage
- [ ] Maximum 3 concurrent batch requests

## UI/UX Requirements

### MemoryCard Layout

```
┌─────────────────────────────────────┐
│ 📌 记忆摘要                          │
│ 内容预览文字...                      │
│                                     │
│ 📚 书籍名  👤 主角  📖 第一章        │
│ 🕐 2分钟前                          │
└─────────────────────────────────────┘
```

### Loading States

- Names loading: Show spinner or "..." in tag
- Navigation loading: Show progress indicator

### Error Handling

- Entity not found: Show "[已删除]" grayed out tag
- Load failed: Show retry button on tag

## Acceptance Criteria

- [ ] User can see all attachments on memory cards
- [ ] User can click attachment to navigate to entity
- [ ] Names load without blocking UI
- [ ] Cache prevents redundant queries
- [ ] Works with 500+ memories per book

## Dependencies

- Memory model with `attachedTo` field (existing)
- CharacterSettingService.getCharacter() (existing)
- TerminologyService.getTerminology() (existing)
- ChapterService.getChapter() (existing)
