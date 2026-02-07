# Capability: Memory Entity Filtering

## Overview

Filter memories by attachment type and specific entities with real-time search.

## User Stories

- As a user, I want to filter memories by type (character/term/chapter) to focus on specific content
- As a user, I want to filter by a specific entity to see all memories about that character/term/chapter
- As a user, I want text search to work together with filters
- As a user, I want filter counts to show how many memories match each option

## Functional Requirements

### Filter Types

- [ ] Primary filter: Type dropdown
  - Options: 全部, 📚 书籍级, 👤 角色, 📝 术语, 📖 章节
  - Default: 全部
  - Show count badge for each option

- [ ] Secondary filter: Entity dropdown (when type ≠ 全部)
  - Dynamic options based on selected type
  - Options sorted alphabetically
  - Show count badge for each entity
  - Searchable dropdown for large lists

- [ ] Text search: Works with filters (AND logic)
  - Searches summary and content
  - Case-insensitive
  - Real-time filtering (debounce 200ms)

### Filter State

- [ ] Filters must persist during session
- [ ] Clear all filters button
- [ ] Visual indicator when filters active
- [ ] Filter chips showing current selection

### Performance

- [ ] Filter must work client-side (no server roundtrip)
- [ ] Filter 500 memories in <100ms
- [ ] Smooth UI updates (no jank)

## Technical Requirements

### Data Structure

```typescript
interface FilterState {
  type: 'all' | 'book' | 'character' | 'term' | 'chapter';
  entityId: string | null;
  searchQuery: string;
}

interface FilterOptions {
  types: Array<{
    value: FilterState['type'];
    label: string;
    icon: string;
    count: number;
  }>;
  entities: Array<{
    id: string;
    name: string;
    count: number;
  }>; // Populated when type selected
}
```

### Filtering Logic

```typescript
const filteredMemories = computed(() => {
  return memories.value.filter((memory) => {
    // Type filter
    if (filter.value.type !== 'all') {
      const hasType = memory.attachedTo.some((att) => att.type === filter.value.type);
      if (!hasType) return false;
    }

    // Entity filter
    if (filter.value.entityId) {
      const hasEntity = memory.attachedTo.some((att) => att.id === filter.value.entityId);
      if (!hasEntity) return false;
    }

    // Text search
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      const inSummary = memory.summary.toLowerCase().includes(query);
      const inContent = memory.content.toLowerCase().includes(query);
      if (!inSummary && !inContent) return false;
    }

    return true;
  });
});
```

### Count Calculation

```typescript
// Pre-calculate counts for filter options
const filterCounts = computed(() => {
  const counts = {
    all: memories.value.length,
    book: 0,
    character: 0,
    term: 0,
    chapter: 0,
    entities: new Map<string, number>(),
  };

  memories.value.forEach((memory) => {
    memory.attachedTo.forEach((att) => {
      counts[att.type]++;
      const key = `${att.type}:${att.id}`;
      counts.entities.set(key, (counts.entities.get(key) || 0) + 1);
    });
  });

  return counts;
});
```

## UI/UX Requirements

### Filter Toolbar Layout

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 搜索记忆...    [全部 ▼] [按实体筛选 ▼]    [清除筛选]      │
│                 (类型筛选)  (实体筛选)                        │
└─────────────────────────────────────────────────────────────┘
```

### Active Filters Display

```
当前筛选: [📚 书籍级 ✕] [👤 主角 ✕] "魔法" [清除全部]
```

### Empty State

```
未找到匹配的记忆
[清除筛选条件]
```

## Acceptance Criteria

- [ ] User can filter by attachment type
- [ ] User can filter by specific entity
- [ ] User can combine filters with text search
- [ ] Filter counts update in real-time
- [ ] Clear filters restores full list
- [ ] Filters perform smoothly with 500+ memories

## Dependencies

- MemoryPanel.vue (existing)
- Book data (characters, terms, chapters)
- PrimeVue Dropdown component
