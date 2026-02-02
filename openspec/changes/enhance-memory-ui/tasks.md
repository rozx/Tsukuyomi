## Implementation Tasks

### Phase 1: Foundation

#### Composables

- [x] **Create `useMemoryAttachments.ts` composable**
  - [x] Implement LRU cache for entity names
  - [x] Implement batch name resolution
  - [x] Add reactive state management
  - [x] Implement cache invalidation listeners (entity updates)
  - [x] Add loading states
  - [ ] Write unit tests

#### Base Components

- [x] **Create `MemoryAttachmentTag.vue` component**
  - [x] Implement type-specific icons and colors
  - [x] Add loading skeleton state
  - [x] Add click event (for filtering)
  - [x] Add tooltip with full name
  - [x] Style with Tailwind CSS

- [x] **Create `MemoryCard.vue` component**
  - [x] Design card layout with summary, content preview, attachments
  - [x] Integrate MemoryAttachmentTag
  - [x] Implement tag overflow handling (show max 3 + badge)
  - [x] Add relative time formatting
  - [x] Add hover actions (edit/delete buttons)
  - [x] Add click-to-open detail
  - [x] Style with Tailwind CSS

### Phase 2: Memory Panel Enhancement

- [x] **Update `MemoryPanel.vue` with filtering**
  - [x] Add filter toolbar with type dropdown
  - [x] Add entity dropdown (disabled when type is All)
  - [x] Add search integration
  - [x] Implement filter logic (client-side)
  - [x] Implement "Filter by Tag" action from cards
  - [x] Add filter count badges
  - [x] Add clear filters button
  - [x] Replace SettingCard with MemoryCard
  - [ ] Test with 500+ memories

- [x] **Create `MemoryDetailDialog.vue` component**
  - [x] Design dialog layout with sections
  - [x] Implement attachments list with grouping
  - [x] Add full content display (scrollable)
  - [x] Add metadata panel (created, accessed, usage)
  - [x] Add action buttons (edit, delete, close)
  - [x] Add keyboard navigation (ESC to close)
  - [ ] Integrate with MemoryPanel
  - [x] Style with Tailwind CSS

### Phase 3: Translation Context

- [ ] **Enhance AI translation service**
  - [ ] Create memory tool wrapper for tracking
  - [ ] Implement reference collection during translation
  - [ ] Store references in TranslationResult
  - [ ] Handle errors gracefully
  - [ ] Test with various translation scenarios

- [x] **Create `MemoryReferencePanel.vue` component**
  - [x] Design collapsed/expanded states
  - [x] Show reference count and list
  - [x] Add click to view memory detail
  - [x] Add loading and empty states
  - [ ] Integrate with ParagraphCard
  - [x] Style with Tailwind CSS

- [ ] **Update `ParagraphCard.vue`**
  - [ ] Add MemoryReferencePanel below translation
  - [ ] Pass referenced memories from translation
  - [ ] Handle navigation to memory detail
  - [ ] Test integration

### Phase 4: Integration & Polish

- [ ] **Integration testing**
  - [ ] Test filter + search combinations
  - [ ] Test navigation flow: Card → Detail → Entity
  - [ ] Test translation → reference → memory detail
  - [ ] Test with real book data
  - [ ] Performance test with 500 memories

- [ ] **Error handling**
  - [ ] Handle entity not found (deleted)
  - [ ] Handle name resolution failures
  - [ ] Handle translation tracking failures
  - [ ] Add user-friendly error messages

- [ ] **Accessibility**
  - [ ] Add keyboard navigation
  - [ ] Add screen reader labels
  - [ ] Test focus management
  - [ ] Verify color contrast

- [ ] **Documentation**
  - [ ] Update component README files
  - [ ] Add JSDoc comments
  - [ ] Update user guide (if exists)

## Testing Checklist

### Unit Tests

- [ ] `useMemoryAttachments` - cache behavior, batching, reactivity
- [ ] `MemoryAttachmentTag` - props, events, rendering
- [ ] `MemoryCard` - props, events, interactions
- [ ] Filter logic - all combinations

### Integration Tests

- [ ] MemoryPanel filtering flow
- [ ] Detail dialog navigation
- [ ] Translation tracking end-to-end

### E2E Tests

- [ ] User journey: Browse → Filter → View → Navigate
- [ ] Translation workflow with memory references

## File Structure

```
src/
├── components/
│   ├── novel/
│   │   ├── MemoryCard.vue                    # NEW
│   │   ├── MemoryAttachmentTag.vue           # NEW
│   │   ├── MemoryDetailDialog.vue            # NEW
│   │   ├── MemoryReferencePanel.vue          # NEW
│   │   └── MemoryPanel.vue                   # MODIFY
│   └── translation/
│       └── ParagraphCard.vue                 # MODIFY
├── composables/
│   └── useMemoryAttachments.ts               # NEW
├── services/
│   └── ai/
│       └── tasks/
│           └── translation-service.ts        # MODIFY
└── __tests__/
    ├── useMemoryAttachments.test.ts          # NEW
    ├── MemoryCard.test.ts                    # NEW
    └── ...
```

## Dependencies

### New Dependencies

- None (using existing PrimeVue, Vue 3, Tailwind)

### Modified Files

- `src/components/novel/MemoryPanel.vue`
- `src/components/novel/ParagraphCard.vue`
- `src/services/ai/tasks/translation-service.ts`

## Estimates

| Phase                         | Estimated Time  |
| ----------------------------- | --------------- |
| Phase 1: Foundation           | 4-6 hours       |
| Phase 2: Memory Panel         | 6-8 hours       |
| Phase 3: Translation Context  | 4-6 hours       |
| Phase 4: Integration & Polish | 4-6 hours       |
| **Total**                     | **18-26 hours** |

## Notes

- All components use existing design system (Tailwind + PrimeVue)
- No breaking changes to existing APIs
- Lazy loading ensures performance with large memory sets
- Translation tracking is optional enhancement - UI handles missing data gracefully
