# Capability: Translation Memory Visibility

## Overview

Show which memories were referenced during AI translation to provide transparency and build user trust.

## User Stories

- As a user, I want to see which memories the AI used when translating a paragraph
- As a user, I want to understand why a translation turned out a certain way
- As a user, I want to verify that important context was considered by the AI
- As a user, I want to click on a referenced memory to view its details

## Functional Requirements

### Display in Translation Context

- [ ] Show reference panel below translation result
- [ ] Display count: "参考了 X 条记忆"
- [ ] Expandable list of memory summaries
- [ ] Each memory shows: icon + summary + click to view

### Memory Reference Data

- [ ] Track which memories are accessed during translation
- [ ] Store: memoryId, summary (snapshot), timestamp
- [ ] Persist with translation result
- [ ] Update when translation is regenerated

### Reference Types

- [ ] Explicit references: AI called `get_memory` or `search_memory_by_keywords`
- [ ] Implicit references: Memories attached to entities in context
- [ ] Distinguish between search results and actually used memories

### UI States

- [ ] Loading: Show spinner while translating
- [ ] Success: Show reference list
- [ ] No references: Show "未参考记忆" message
- [ ] Error: Show error state

## Technical Requirements

### Data Structure

```typescript
interface MemoryReference {
  memoryId: string;
  summary: string; // Snapshot at translation time
  accessedAt: number;
  toolName: 'get_memory' | 'search_memory_by_keywords';
}

interface TranslationResult {
  // ... existing fields
  referencedMemories: MemoryReference[];
}
```

### Tracking Implementation

```typescript
// Wrap memory tools to track access
function createTrackedMemoryTools(onMemoryAccess: (ref: MemoryReference) => void) {
  return memoryTools.map((tool) => ({
    ...tool,
    handler: async (args: any, ctx: ToolContext) => {
      const result = await tool.handler(args, ctx);

      // Track access
      if (tool.name === 'get_memory' && args.memory_id) {
        onMemoryAccess({
          memoryId: args.memory_id,
          summary: extractSummaryFromResult(result),
          accessedAt: Date.now(),
          toolName: 'get_memory',
        });
      } else if (tool.name === 'search_memory_by_keywords') {
        const memories = extractMemoriesFromResult(result);
        memories.forEach((m) =>
          onMemoryAccess({
            memoryId: m.id,
            summary: m.summary,
            accessedAt: Date.now(),
            toolName: 'search_memory_by_keywords',
          }),
        );
      }

      return result;
    },
  }));
}
```

### Component Interface

```typescript
interface MemoryReferencePanelProps {
  references: MemoryReference[];
  bookId: string;
  loading?: boolean;
}

interface MemoryReferencePanelEmits {
  'view-memory': (memoryId: string) => void;
}
```

### Storage

- [ ] Store references in paragraph.translations[n].referencedMemories
- [ ] Update on each translation regeneration
- [ ] Include in export/import

## UI/UX Requirements

### Reference Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│ 译文：                                                       │
│ 在这个魔法世界中，主角开始学习...                             │
│                                                             │
│ 💡 AI 参考了 3 条记忆                              [查看 ▼]  │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ • 📌 世界观-魔法系统                                 │    │
│ │ • 📌 主角背景设定                                    │    │
│ │ • 📌 魔法学院介绍                                    │    │
│ └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Collapsed State

```
💡 AI 参考了 3 条记忆  [展开 ▼]
```

### Empty State

```
💡 未参考记忆
```

### Loading State

```
💡 检索记忆中...
```

### Interaction

- [ ] Click memory opens MemoryDetailDialog
- [ ] Expand/collapse with smooth animation
- [ ] Hover shows tooltip with memory preview

## Integration Points

### ParagraphCard.vue

```vue
<template>
  <!-- ... existing content ... -->

  <MemoryReferencePanel
    v-if="translation.referencedMemories?.length > 0"
    :references="translation.referencedMemories"
    :book-id="bookId"
    @view-memory="openMemoryDetail"
  />
</template>
```

### Translation Service

- [ ] Modify translation task to track memory access
- [ ] Pass tracked references to result
- [ ] Handle errors gracefully

## Acceptance Criteria

- [ ] User can see which memories were referenced
- [ ] Reference list shows memory summaries
- [ ] User can click to view memory details
- [ ] References persist with translation
- [ ] Works for both new and regenerated translations
- [ ] Handles cases where memory is deleted after reference

## Dependencies

- MemoryService (existing)
- MemoryDetailDialog component (new)
- ParagraphCard.vue (modification)
- Translation service (modification)
- Memory tools (wrap for tracking)

## Non-Goals

- Real-time memory usage analytics
- Memory effectiveness scoring
- Automatic memory suggestions based on references
