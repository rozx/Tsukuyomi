## Context

当前系统通过 `ChapterService.shouldUpdateChapter` 来判断已导入章节是否存在远程更新，仅对比远程与本地的 `lastUpdated` 日期。`EditChapterDialog` 不暴露 `webUrl` 字段也不展示日期信息。

关键文件：

- `src/services/chapter-service.ts`: `shouldUpdateChapter`、`isRemoteNewer`、`isChapterImported`
- `src/components/dialogs/EditChapterDialog.vue`: 编辑章节对话框 UI
- `src/composables/book-details/useChapterManagement.ts`: 编辑章节的状态管理和保存逻辑
- `src/components/dialogs/NovelScraperDialog.vue`: 爬虫对话框，使用 `shouldUpdateChapter` 渲染列表和预选

## Goals / Non-Goals

**Goals:**

- `shouldUpdateChapter` 在本地缺少 `lastUpdated` 时能回退到 `createdAt` 对比
- 远程内容加载后能通过内容对比检测变化
- 用户能在 EditChapterDialog 中编辑 `webUrl` 和查看日期信息

**Non-Goals:**

- 不改变爬虫本身的日期抓取逻辑
- 不添加内容 diff 视图（爬虫对话框已有对比功能）
- 不改变 `originalContent` 的保存时机

## Decisions

### Decision 1: `shouldUpdateChapter` 的回退对比字段

**选择**: 当本地 `lastUpdated` 为空时，使用本地 `createdAt` 作为对比基准

**替代方案考虑**:

- 使用 `lastEdited`：不合适，因为 `lastEdited` 会在本地编辑（如修改标题）时更新，不代表导入时间
- 总是标记为"有更新"：会产生过多噪声

**理由**: `createdAt` 在导入时设置后不再变更，准确代表章节进入系统的时刻

### Decision 2: `hasContentChanged` 的对比策略

**选择**: `trim()` 后直接字符串对比

**替代方案考虑**:

- 行级 diff：过于复杂，且这里只需要知道"有没有变"，不需要知道"变了什么"
- hash 对比：引入额外复杂度，直接字符串对比在此场景下性能已足够

**理由**: 章节内容在加载时已经是完整文本，直接对比最简单可靠

### Decision 3: 内容变化检测的触发时机

**选择**: 在 `loadChapterContent` 加载远程内容成功后，立即检测内容变化并更新标记

**理由**: 这是远程内容首次可用的时刻，此时本地章节可通过 `findChapterByUrl` 找到，且 `originalContent` 通常已经在内存中（不需要懒加载）

### Decision 4: webUrl 编辑的数据流

**选择**: 通过 `EditChapterDialog` props 传入，emit save 事件时包含 `webUrl` 字段，由 `useChapterManagement` 的 `handleEditChapter` 传给 `ChapterService.updateChapter`

**理由**: 与现有的 title、translation、instructions 等字段的数据流完全一致，无需引入新模式

### Decision 5: 日期统计的展示位置

**选择**: 放置在 EditChapterDialog 的 webUrl 输入框下方，特殊指令区域上方，使用小字体只读文本

**理由**: 日期信息属于元数据，与 webUrl 关联性强（都是"来源信息"），放在一起视觉上更合理

## Risks / Trade-offs

- **`originalContent` 可能为空**: 手动创建的章节或早期导入的章节可能没有 `originalContent` → 降级为总是判定有变化（保守策略），用户可以在预览中手动确认
- **字符串对比性能**: 对极长的章节文本做 `trim()` + 全文对比 → 实际情况中单章节文本量不大（几万字符），性能无问题
- **webUrl 编辑的副作用**: 用户手动修改 webUrl 可能导致与已有章节重复 → 暂不做唯一性校验，信任用户操作
