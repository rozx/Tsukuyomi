## Why

当前判断章节是否需要从网络源更新的逻辑过于单一——仅依赖 `lastUpdated` 日期对比。部分网站不提供改稿日期，或者本地章节因为早期导入而缺少 `lastUpdated` 字段，导致系统无法正确识别远程更新。同时，编辑章节对话框中缺少对 `webUrl`（网络来源地址）的编辑能力和日期统计信息的展示，用户无法手动关联/修正/解除章节与网络源的绑定关系，也无法直观了解章节的时间信息。

## What Changes

- **增强 `shouldUpdateChapter` 检测逻辑**：当本地章节缺少 `lastUpdated` 时，回退对比远程 `lastUpdated` 与本地 `createdAt`（导入日期）；远程无 `lastUpdated` 时采用宽松策略不标记更新
- **新增 `hasContentChanged` 内容对比方法**：在远程章节内容实际加载后，对比远程文本与本地 `originalContent`，动态标记"已导入（有更新）"
- **EditChapterDialog 新增 `webUrl` 可编辑字段**：允许用户手动设置、修正或清除章节的网络来源地址
- **EditChapterDialog 新增只读日期统计区域**：展示网站更新时间 (`lastUpdated`)、本地编辑时间 (`lastEdited`)、创建时间 (`createdAt`)
- **NovelScraperDialog 增强标记逻辑**：内容加载后利用 `hasContentChanged` 动态更新章节的导入状态标记

## Capabilities

### New Capabilities

- `chapter-update-detection`: 增强章节远程更新检测逻辑，包括日期回退对比和内容变化检测
- `chapter-metadata-editing`: EditChapterDialog 中 webUrl 可编辑字段和只读日期统计信息展示

### Modified Capabilities

<!-- 无需修改现有 spec -->

## Impact

- `src/services/chapter-service.ts`: `shouldUpdateChapter` 逻辑增强 + 新增 `hasContentChanged` 静态方法
- `src/components/dialogs/EditChapterDialog.vue`: 新增 webUrl 输入框 + 日期统计区域 + 对应 props
- `src/composables/book-details/useChapterManagement.ts`: 新增 `editingChapterWebUrl` ref + 日期 refs，打开/保存逻辑更新
- `src/components/dialogs/NovelScraperDialog.vue`: 内容加载后调用 `hasContentChanged` 动态更新标记
