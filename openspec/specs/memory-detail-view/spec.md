# memory-detail-view Specification

## Purpose
定义记忆详情弹窗（`MemoryDetailDialog.vue`）：完整查看记忆摘要与内容、元信息与向量状态，并在同一弹窗内编辑、删除或手动触发向量化。

## Requirements

### Requirement: Full memory content display

The memory detail dialog SHALL show the memory's full summary and content without truncation.

#### Scenario: Opening a memory

- **GIVEN** the user clicks a memory card in the memory panel or a memory in the chapter memory preview
- **WHEN** the detail dialog opens
- **THEN** it shows the full summary and the full content, with the content in a scrollable area
- **AND** a copy button copies the content to the clipboard and shows a toast

### Requirement: Memory metadata

The dialog SHALL show the memory's metadata and embedding state.

#### Scenario: Metadata section

- **GIVEN** the detail dialog is open
- **WHEN** the metadata section renders
- **THEN** it shows the created time, the last accessed time (relative, falling back to an absolute date after 7 days), and the memory ID
- **AND** it shows the embedding status (已向量化 / 待向量化 / 向量版本过期) and, when present, the `embeddingModel` version

#### Scenario: Manual embedding

- **GIVEN** the memory's embedding status is not ready
- **WHEN** the user clicks "为此记忆生成向量"
- **THEN** the memory is enqueued in `EmbeddingQueue` and a toast confirms it
- **AND** the loading state clears when the `embedding-updated` event for that memory or a queue error arrives

### Requirement: Edit in place

The dialog SHALL let the user edit the summary and content in place.

#### Scenario: Editing and saving

- **GIVEN** the dialog is in read-only mode
- **WHEN** the user clicks 编辑, changes the summary or content, and clicks 保存
- **THEN** the dialog emits `save` with the new values and returns to read-only mode

#### Scenario: Opening directly in edit mode

- **GIVEN** the user clicks the edit button on a memory card
- **WHEN** the dialog opens
- **THEN** it starts in edit mode

#### Scenario: Closing with unsaved changes

- **GIVEN** the dialog is in edit mode with unsaved changes
- **WHEN** the user closes it
- **THEN** a confirmation asks whether to save or discard the changes

### Requirement: Delete from detail view

The dialog SHALL offer a delete action.

#### Scenario: Deleting a memory

- **GIVEN** the detail dialog is open in read-only mode
- **WHEN** the user clicks 删除
- **THEN** the dialog emits `delete` and the parent deletes the memory, closes the dialog, and refreshes its list or preview

### Requirement: Adaptive dialog layout

The dialog SHALL use `AdaptiveDialog`, 800px wide on desktop and adapted to small screens.

#### Scenario: Dialog on different screens

- **GIVEN** the memory detail dialog opens
- **WHEN** it renders on desktop
- **THEN** it is 800px wide
- **AND** on smaller screens `AdaptiveDialog` presents it in its compact form
