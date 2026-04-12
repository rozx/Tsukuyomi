## REMOVED Requirements

### Requirement: Attachment list in memory detail

**Reason**: The memory attachment system is removed in this change (see `memory-attachments` capability). The `MemoryDetailDialog` "关联实体" section, which grouped attachments by type and provided click-to-navigate links, is deleted. Memories are no longer attached to specific entities and therefore cannot display such a list.

**Migration**:
- Remove the "📎 关联实体" section from `MemoryDetailDialog.vue`
- Remove the attachment grouping logic (group by `character / term / chapter`)
- Remove the `navigate` emit for attachment clicks
- The visual space previously occupied by the attachment list is now used by:
  - Embedding metadata footer (model version + embedding timestamp)
  - Manual "为此记忆生成向量" button (when vector is missing or stale)
- See `memory-management` capability delta for the new embedding-related additions to the detail dialog

**Preserved**:
- Full content display with scrolling
- Created time / last accessed time / access count / memory ID metadata
- Edit / Delete / Close actions
- Keyboard shortcuts (ESC to close)
- Responsive layout
- Copy content button
