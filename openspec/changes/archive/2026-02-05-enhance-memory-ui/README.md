# Change: enhance-memory-ui

## Overview

Improve Memory management UI with attachment visualization, entity filtering, enhanced detail dialogs, and translation context visibility.

## Status

| Artifact | Status |
| -------- | ------ |
| proposal | done   |
| design   | done   |
| tasks    | done   |

## Description

This change enhances the Memory management UI with the following features:

1. **Attachment Visualization** - Display memory attachments (book/character/term/chapter) with lazy-loaded names
2. **Entity Filtering** - Filter memories by attachment type and specific entities
3. **Enhanced Detail Dialog** - Rich memory detail view with full content, metadata, and navigation
4. **Translation Context Visibility** - Show which memories were referenced during translation

## Components

- MemoryCard.vue - New card component for memory display
- MemoryAttachmentTag.vue - Attachment tag component with icons
- MemoryDetailDialog.vue - Enhanced detail dialog
- MemoryReferencePanel.vue - Translation context panel
- Enhanced MemoryPanel.vue - Updated with filtering

## Acceptance Criteria

- [ ] Users can see which entities a memory is attached to
- [ ] Users can filter memories by attachment type
- [ ] Users can view full memory details in a dialog
- [ ] Users can see which memories were used during translation
- [ ] Attachment names are lazy-loaded with caching
