# Capability: Memory Detail View

## Overview

Rich detail dialog with full content, metadata, and entity navigation.

## User Stories

- As a user, I want to view full memory content without truncation
- As a user, I want to see when a memory was created and last accessed
- As a user, I want to see all entities a memory is attached to and navigate to them
- As a user, I want to edit or delete a memory from the detail view

## Functional Requirements

### Content Display

- [ ] Show full memory content (not truncated)
- [ ] Content area must be scrollable for long text
- [ ] Syntax highlighting for structured content (optional)
- [ ] Copy content button

### Metadata Panel

- [ ] Created time (absolute + relative)
- [ ] Last accessed time (absolute + relative)
- [ ] Access count (how many times used in translations)
- [ ] Memory ID (for debugging)

### Attachment List

- [ ] Show all attachments with full details
- [ ] Group by type (characters, terms, chapters)
- [ ] Each attachment shows: icon + name + type label
- [ ] Click to navigate to entity
- [ ] Show "no attachments" message if empty

### Actions

- [ ] Edit button → opens edit dialog
- [ ] Delete button → shows confirmation
- [ ] Close button
- [ ] Keyboard shortcut: ESC to close

## Technical Requirements

### Component Interface

```typescript
interface MemoryDetailDialogProps {
  visible: boolean;
  memory: Memory | null;
  bookId: string;
}

interface MemoryDetailDialogEmits {
  'update:visible': (visible: boolean) => void;
  edit: (memory: Memory) => void;
  delete: (memory: Memory) => void;
  navigate: (type: string, id: string) => void;
}
```

### Dialog Layout

```
┌─────────────────────────────────────────────────────────────┐
│ 📌 记忆标题                                          [×]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📎 关联实体                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 角色                                                 │   │
│  │ • 👤 主角                                            │   │
│  │ • 👤 导师                                            │   │
│  │                                                      │   │
│  │ 章节                                                 │   │
│  │ • 📖 第一章：魔法学院                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  📝 摘要                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 世界观-魔法系统                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  📄 内容                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ (scrollable area)                                   │   │
│  │ 在这个世界中，魔法分为以下几类：                     │   │
│  │ 1. 元素魔法：火、水、风、土                           │   │
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ℹ️ 元信息                                                   │
│  • 创建时间：2024-01-15 10:30                              │
│  • 最后访问：2024-01-15 14:22 (2分钟前)                     │
│  • 使用次数：15次                                          │
│  • ID：a1b2c3d4                                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                    [编辑] [删除] [关闭]     │
└─────────────────────────────────────────────────────────────┘
```

### Styling

- [ ] Dialog width: 800px max
- [ ] Content area: max-height 400px with scroll
- [ ] Section headers: bold, muted color
- [ ] Metadata: small text, muted color
- [ ] Responsive: Full screen on mobile

## UI/UX Requirements

### Opening the Dialog

- [ ] Click memory card opens detail
- [ ] Smooth fade-in animation
- [ ] Focus trap within dialog
- [ ] Background overlay clickable to close

### Navigation

- [ ] Attachment links open entity popover/panel
- [ ] Does not close memory dialog (stacked modals)
- [ ] Breadcrumb or back button if needed

### Edit Flow

- [ ] Edit button opens edit dialog
- [ ] Memory detail stays open in background
- [ ] After save, detail updates automatically

### Delete Flow

- [ ] Delete button shows confirmation dialog
- [ ] Confirm → close detail + show toast
- [ ] Cancel → stay in detail view

## Acceptance Criteria

- [ ] User can view full memory content
- [ ] User can see complete metadata
- [ ] User can navigate to attached entities
- [ ] User can edit memory from detail view
- [ ] User can delete memory from detail view
- [ ] Dialog is responsive and accessible

## Dependencies

- Memory model (existing)
- MemoryAttachmentTag component (new)
- CharacterPopover, TermPopover (existing)
- PrimeVue Dialog component
