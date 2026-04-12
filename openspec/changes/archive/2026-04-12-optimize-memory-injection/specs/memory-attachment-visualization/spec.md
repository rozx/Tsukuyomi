## REMOVED Requirements

### Requirement: Memory attachment visualization

**Reason**: The attachment system itself is removed in this change (see `memory-attachments` capability). With no attachments to visualize, all UI elements that rendered attachment chips, tags, colors, and navigation links are deleted. The `MemoryCard` component's attachment tag area and the `useMemoryAttachments` composable are removed entirely.

**Migration**:
- Delete `src/composables/useMemoryAttachments.ts`
- Delete `MemoryAttachmentTag.vue` component (if present)
- Remove attachment chip rendering from `MemoryCard.vue`
- Remove attachment name lookup cache
- Replace the visual real estate previously used by attachment chips with the new embedding status badge (see `memory-management` delta)
- i18n keys for attachment labels (book/character/term/chapter emoji + color-coded chips) are removed

**Historical context preserved via git history**: Prior attachment visualization used colored type-prefixed tags (📚 📝 📖 👤) with batched lazy name resolution and a 100-entry LRU cache. This visual pattern is gone; the new UI surfaces memory origin through the reference panel's score breakdown tooltip instead.
