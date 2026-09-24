# Proposal

## Why

`add-book-sync-core` 让书籍可以按配方确定性地检查更新，但 AI 导入器导入的书目前不会留下任何配方，也不写 `book.webUrl`。因此不管来源是不是内置站点，这些书都无法检查更新。哪个页面是目录、哪些链接是正文、用了哪些提取和清理规则，只有导入 Agent 最清楚，所以配方应该在导入时由 Agent 声明，并由宿主用已保存的快照验证。站点改版导致配方失效时，也需要一条回到导入器修复的通路。

## What Changes

- 新增导入 Agent 工具 `record_update_recipe`：声明目录网址、章节链接筛选、正文规则、清理规则、标题剥离设置和固定正文章节。目录属于内置站点时，宿主自动采用内置站点引擎。
- 宿主**离线自测**：在任务已保存的目录页和章节页快照上回放配方，要求草稿中来自该站点的已选章节与目录链接一一对应，并且逐段复现草稿正文（固定正文章节除外，且数量有上限）。不通过就拒绝，并给出差异示例；通过后写入草稿。
- 每次生成导入方案时自动重跑自测。方案里单列「更新配方」一项（新增、替换或保留，以及可复现的章节数）；自测失效时只提示，不阻断导入，并保留目标书原有的配方。
- 应用导入时，把配方和目录网址写入书籍（`webUrl` 去重后置于首位），并自动计算已跳过章节（草稿中未选中、且与目录一一对应的章节），与原有列表合并，同时移除本次已导入的网址。Agent 没有声明配方时，保留目标书原有配方，只维护跳过列表。
- 导入撤销时，一并恢复书籍原来的配方和 `webUrl`。
- 允许「只修配方」的方案应用：目标为已有书籍、没有选中章节、但配方有变化时，不再报「空选择」冲突。
- 修复入口：书籍同步工作区中，配方缺失或失效时提供「用 AI 导入器建立/修复」。点击后创建（或重新打开这本书尚未完成的）修复任务，预先填好任务名、目标书、目录来源和失效原因；Agent 能看到旧配方作为参考。不绕过单 Agent 锁，也不自动启动。
- 导入 Agent 提示词补充配方录入和修复任务的工作方式。

## Capabilities

### New Capabilities

- `import-update-recipe`：导入过程中配方的声明、离线自测、方案展示、应用写入、跳过列表计算、撤销恢复，以及从同步工作区发起的修复任务。

### Modified Capabilities

（无：新增行为都集中在 `import-update-recipe`。已有导入规格中关于方案确认、撤销快照和单 Agent 执行的要求保持不变，本变更只在这些要求之上新增配方相关的内容。）

## Impact

- 导入模型：`ImportDraft` 增加配方声明和自测结果，`ImportPlan` 增加配方变化，`ImportTask` 增加 `purpose`（用于识别修复任务）。
- 导入服务：`import-tool-definitions.ts`、`import-tool-executor.ts`（新工具）、新增 `import-update-recipe.ts`（离线自测）、`import-plan-service.ts` / `import-plan-layout.ts`（方案中的配方、跳过列表、`webUrl`、放宽 `EMPTY_SELECTION`）、`import-agent-prompt.ts`。
- 界面：导入预览中显示配方变化；书籍同步工作区的修复入口（`redesign-book-sync-ui` 中的 `HandoffNotice`）。
- 依赖：必须在 `add-book-sync-core` 之后（复用 `normalizeChapterText` 和引擎的离线解析），并约定排在 `redesign-book-sync-ui` 之后。
