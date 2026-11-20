## Context

动机见 proposal.md「Why」。与方案直接相关的现状：

- **执行绑定页面**：整章翻译 / 继续翻译 / 润色 / 校对全部在 `useChapterTranslation`（书籍详情页 composable）里实现。`guarded` 包装器从 `selectedChapter` 取章节 ID，拿到锁后若用户已换章就直接放弃；段落来源是 `selectedChapterParagraphs`，写入后通过页面传入的 `updateSelectedChapterWithContent` 刷新阅读区。没有页面就无法启动任务。
- **锁**：`BookExecutionGuard.write` 以共享锁持有整个任务时长（同书多章并发在锁层面已可行），`commit`（书籍同步、导入应用）取独占锁；两者都用 `ifAvailable`，拿不到立即抛 `BookBusyError`。
- **任务记录**：`aiProcessingStore` 持久化到 `thinking-processes`，历史上限 30 条；刷新后把 `thinking` / `processing` 任务改写为「已中断」错误。`useMainLayoutShell` 监听任务变为 `error` / `cancelled` 时弹全局 toast。
- **持久化粒度**：所有翻译路径都已按批（chunk）落盘，中断只丢当前批。
- **UI**：右侧面板 `activeRightTab: 'chat' | 'progress'`；`useChapterTranslation` 有 3 处、`useBookDetailsPage` 有 1 处在启动时 `setActiveRightTab('progress')`；header 的「AI 思考」chip 打开 `ThinkingProcessPanel`，列出全部 AI 任务。
- **章节完成度**：章节元数据没有翻译统计；平板书库页已有按需批量读取章节内容并用 `getChapterTranslationStats` 计算的先例。
- **并发设置先例**：`AppSettings.scraperConcurrencyLimit` 随设置一起同步。
- `AIModel.rateLimit` 字段可配置但从未生效（本变更不处理）。

## Goals / Non-Goals

**Goals:**

- 章节任务的执行与页面解耦，任意页面都能启动、观察、取消。
- 一个全局并发上限覆盖翻译 / 润色 / 校对三类章节任务。
- 队列跨刷新 / 重启保留，恢复后不重做已完成段落、也不跳过未处理段落。
- 批量运行时通知不刷屏。

**Non-Goals:**

- 按模型 / 供应商分别限并发，以及让 `AIModel.rateLimit` 生效（调度判定留扩展点）。
- 失败自动重试、批次完成后的系统通知（mockup 中出现过，本次不做）。
- 单段落任务、助手、术语翻译进入队列。
- 修复 Gist 同步与翻译写入的互斥问题（已知遗留问题，见 Risks）。
- 队列跨设备同步。

## Decisions

### D1 执行器 + 队列 store 分层

- `src/services/chapter-task/`：纯逻辑执行器 `ChapterTaskExecutor`，输入为队列项与依赖适配器（AI 服务、段落读写、进度回调、任务记录适配器——沿用现有 `createAIProcessingStoreAdapter` 写法），不依赖 Vue / Pinia。负责：按书籍设置解析模型、从 IndexedDB 读章节内容、计算目标段落、调用 `TranslationService` / `PolishService` / 校对服务、按批落盘并回报已完成段落 ID。章节 / 书籍级特殊指令不需要执行器处理：服务内部已从持久化数据读取（`context-builder.ts:949`），现有 UI 调用也从未传入 `customInstructions` 参数。
- 任务记录关联：执行器包装传给服务的 aiProcessing 适配器，在其 `addTask` 中注入 `queueItemId` 并记下返回的 taskId（服务每次运行只创建一条记录，见 `text-task-processor.ts:392`）；之后进度等更新按 taskId 写入，不再沿用 `syncProgressToStore` 按「类型 + 章节」查找的做法——同章节的单段落任务也是同类型，会被误命中。
- `src/stores/task-queue.ts`：Pinia store，持有队列项、调度循环、暂停状态、执行者身份，持久化到新对象仓库 `task-queue`。
- `useChapterTranslation` 的整章入口改为 `taskQueue.enqueue(...)`；单段落任务保持原样。

替代方案：把执行逻辑留在 composable、用全局单例页面实例跑任务——无法在离开书籍详情页后启动批量任务，否决。

### D2 队列项模型

```
TaskQueueItem {
  id; bookId; chapterId;
  kind: 'translation' | 'polish' | 'proofreading';
  mode?: 'continue' | 'retranslate';      // 仅 translation
  origin: 'manual' | 'batch';
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  order: number;                          // 排队顺序
  targetParagraphIds?: string[];          // 首次启动时快照
  targetLanguage?: AppLocale;             // 快照时的书籍目标语言
  completedParagraphIds: string[];        // 每批落盘后追加并持久化
  cancelRequested?: boolean;              // 期望状态：请求执行者中止（D9）
  aiTaskIds: string[];                    // 每次运行对应的 aiProcessing 记录
  waitingReason?: 'book-busy';
  error?: { code; message };
  enqueuedAt; startedAt?; endedAt?;
}
```

队列级状态：`paused: boolean`、`pausedReason?: 'user' | 'restored'`。

### D3 调度

- 判定函数 `canStart(item, ctx)`：未暂停、运行数 < `settings.taskQueueMaxConcurrent`、同一章节没有其他运行中的队列项（翻译与校对同章并行会互相覆盖写入）、书籍未被独占、桌面端不处于更新重启准备阶段（D14）。以后加每模型上限只扩展此函数。不满足「同章唯一」的项保持排队并让后面其他章节的项先启动。
- 触发时机：入队、任务结束、继续队列、设置变化、等待重试定时器（30 秒）。
- 运行中的任务继续持有 `BookExecutionGuard.write` 共享锁；占用者标签改为带章节名的「任务队列 · 翻译 · <章节>」。
- 拿锁抛 `BookBusyError` 时：队列项回到 `queued` 并记 `waitingReason: 'book-busy'`，跳过它继续调度后面的项，30 秒后重试；不计为失败。

### D4 入队规则

- **手动启动**（阅读页「翻译本章 / 继续翻译 / 重新翻译 / 润色 / 校对」）：`origin: 'manual'`，插到队首；有空位立即启动，没有空位则排第一位等待。不超过并发上限（用户明确要求的上限优先于「插队」）。
- **批量启动**：`origin: 'batch'`，按章节在书中的顺序追加到队尾或插到队首（对话框选择）。
- **去重**：同一章节同一 `kind` 已存在 `queued` / `running` 项时跳过，入队结果返回跳过数。
- **润色 / 校对前置条件**在入队时检查（章节须有目标语言译文），不满足的章节跳过并计入「不适用」数。由于此时可能未加载章节内容，检查使用与徽章相同的统计（D8）；运行时再检查一次，若已不满足则标为失败并说明原因。

### D5 断点续跑（Q2）

- 首次启动时把目标段落 ID 快照进 `targetParagraphIds`：`continue` 为未翻译段落，`retranslate` 为全部非空段落，润色 / 校对为有译文的段落。
- 已完成段落的来源按任务类型不同：
  - 翻译：`onParagraphTranslation` 回报的段落。
  - 润色 / 校对：服务只回报「有改动」的段落（`paragraph-task-shared.ts:44` 过滤掉未改动的），只靠它会把「看过但没改」的段落当成未完成。因此改为按块记录：`onProgress` 在每块开始时带上该块的段落 ID（`text-task-processor.ts:757`），第 k+1 块开始或服务成功返回时，把第 k 块（最后一块）的全部段落记为完成，再并上有改动的段落。
- 顺序：段落译文落盘成功后，才把对应 ID 写进 `completedParagraphIds` 并持久化队列项，避免崩溃时「记了完成但没存上译文」。
- 恢复运行时目标 = `targetParagraphIds − completedParagraphIds`（过滤掉已被删除的段落）。这样 `retranslate` 不会因旧译文存在而跳过，润色 / 校对也有了续跑能力。
- 首次启动时同时记下书籍目标语言。恢复时若目标语言已改，或快照里的段落 ID 已全部不存在（例如章节被重新导入、段落 ID 全换），丢弃快照与已完成记录，按原 `mode` 重新计算目标。
- 恢复（无存活执行者，见 D9 的「启动即拿到锁」）：`status: 'running'` 的项改回 `queued`，排到队首（保持原有相对顺序），队列置为 `paused`、`pausedReason: 'restored'`。
- 接管（另一个已打开的标签页在原执行者离开后拿到锁）：同样把遗留 `running` 项改回队首，但不改变队列的暂停状态——应用并未关闭，用户只是刷新或关掉了其中一个标签页。

### D6 与 aiProcessing 记录的对账

- `AIProcessingTask` 新增可选 `queueItemId`。
- 现状问题：`App.vue:57` 在**每个标签页**启动时调用 `loadThinkingProcesses`，它会把 DB 里所有 `thinking` / `processing` 记录改写为「已中断」错误，并删除其待办（待办存在共享的 localStorage）。第二个标签页打开时会把执行者标签页里仍在运行的任务改写掉。
- 因此：`loadThinkingProcesses` 跳过带 `queueItemId` 的记录（不改状态、不删待办）。这些记录由拿到执行者锁的标签页在「恢复」或「接管」时统一对账：把原运行记录标为 `cancelled`，说明为「已中断，从断点继续」。
- 通知完全由队列负责：`useMainLayoutShell` 的错误 / 取消监听跳过所有带 `queueItemId` 的任务。手动来源项的错误、取消提示改由队列根据队列项状态发出，文案沿用 `task-status-toasts`。这样对账发生在何时都不会误弹 toast。
- 任务中心按 `queueItemId` 去重，同一章节同一任务只显示一行（以队列项为准）。升级前遗留的章节级记录（没有 `queueItemId`、非单段任务）归入「其他 AI 活动」的历史，只供查看。
- 不带 `queueItemId` 的运行中记录（助手、单段任务）被第二个标签页改写的问题是已有行为，本次不处理。
- 已完成区展示队列项自身的终态，不依赖 aiProcessing 的 30 条历史上限；展开时若对应日志已被裁剪，显示「日志已清理」。队列项终态保留到用户清除，超过 200 条时自动删除最旧的已结束项。

### D7 页面实时更新

- 执行器每批落盘后调用 `booksStore.refreshBookFromStorage(bookId, chapterId)`，并在 task-queue store 上发出 `chapterWrite { bookId, chapterId, at }`。
- `useBookDetailsPage` 监听 `chapterWrite`，命中当前选中章节时调用现有 `updateSelectedChapterWithContent`。
- `chapterWrite` 同时经 D9 的 `BroadcastChannel` 广播；非执行者标签页收到后先 `refreshBookFromStorage` 再走同一监听逻辑，保证在别的标签页打开的阅读页也能实时更新。
- 段落高亮（in-flight 段落）继续写入 `chapterTasksStore`，页面读取逻辑不变。
- 原 `useChapterTranslation` 中监听 aiProcessing 取消事件重置局部状态的 watch 改为读取队列项状态。

### D8 章节完成度统计

- 进入多选模式时，对已展开卷的章节按需批量读取内容（复用 `ChapterContentService.loadChapterContentsBatch` + `getChapterTranslationStats`），按书籍目标语言计算；结果缓存在多选会话内，`chapterWrite` 命中时失效对应章节。
- 「选未翻译」对全书计算，期间显示加载态。
- 不新增章节元数据字段，不影响同步。

### D9 多标签页单执行者

- 每个标签页加载队列状态；只有持有 Web Lock `tsukuyomi:task-queue-runner` 的标签页执行调度。
- 所有标签页（含执行者）对队列的修改都在 `task-queue` 仓库的单个 readwrite 事务内完成「读取 → 判重 / 定序 → 写入」，IndexedDB 事务跨标签页串行，避免两个标签页同时入队时判重和排序出错；提交后经 `BroadcastChannel('tsukuyomi:task-queue')` 广播。
- 需要执行者动手的操作（停止运行项、全部停止、暂停 / 继续）写成「期望状态」：队列项 `cancelRequested: true`、队列级 `paused`。执行者收到广播后按期望状态中止任务或调整调度，非执行者不直接碰 AbortController。
- 非执行者标签页的 aiProcessing store 里没有执行者的实时流（思考、工具调用），展开运行中的行时只显示由队列项字段推导的进度，并提示「详细过程在另一个标签页中」。
- 区分「恢复」与「接管」：标签页启动时先用 `ifAvailable` 请求执行者锁——立即拿到说明当前没有存活执行者，按 D5「恢复」处理（暂停）；拿不到则挂一个等待中的锁请求，之后被授予时说明是原执行者离开，按 D5「接管」处理（保持暂停状态，未暂停则继续）。
- 队列项状态变化与 `chapterWrite` 都经 `BroadcastChannel` 广播，非执行者据此刷新显示。
- 无 `navigator.locks` 时当前标签页直接充当执行者，不做跨标签页协调（风险见下）。

### D10 通知节制

- `origin: 'manual'` 保留现有 toast（完成、部分保存、动作通知、错误）。
- `origin: 'batch'`：不弹单章完成 toast；动作通知（新增术语 / 角色等）只用 `recordToastInHistory` 写入消息历史；单项错误和取消都不弹 toast（全局监听已按 D6 跳过所有队列任务，队列对批量项不发单项提示）；当队列从「有批量项」变为「无运行无排队」时弹一次汇总 toast（N 完成 · M 失败 · K 已取消）。
- 「全部停止」不论来源，只弹一条「已停止 N 个任务」，不逐项弹取消 toast。
- D6 对账时改写的中断记录不触发任何 toast（全局监听本来就只在已见过的任务发生状态变化时提示，见 `useMainLayoutShell.ts:72`；再加上跳过队列任务，对账时机不影响提示）。

### D11 任务中心形态（设备变体）

- 遵循 dispatcher + 三变体规则：`src/components/task-center/TaskCenter.vue`（dispatcher）、`TaskCenterDesktop.vue`（PrimeVue Popover + 固定后的悬浮面板）、`TaskCenterTablet.vue`（`<TaskCenterDesktop />` wrapper）、`TaskCenterMobile.vue`（`MobileBottomSheet` + 全屏详情）。逻辑在 `src/composables/task-center/useTaskCenter.ts`，以 provide / inject 共享。
- chip 本体是 `TaskCenterChip.vue`，由 `AppHeader` / `TabletSysBar` / `MobileSysBar` 各自放在原 AI 思考 chip 位置。
- 固定后的悬浮面板挂在 `MainLayout` dispatcher（跨断点存活）；固定 / 收起 / 位置 / 当前展开项存 `ui` store，随它一起持久化到 localStorage（`tsukuyomi-ui-state`，不是 IndexedDB 的 `ui-state` 仓库）。手机断点下固定面板不渲染，状态保留。
- 展开行复用 `TaskStatusBar`、`TaskTodos`、`TaskStream`；流式区限高约 200px 内滚动。删除 `TaskSwitcher`、`TaskSwitcherItem`、`TaskActionBar`、`AppProgressPanelDesktop`、`TabletProgressPanel`；`ThinkingProcessBody` 的列表与清理能力并入「其他 AI 活动」区。

### D12 设置与迁移

- `AppSettings.taskQueueMaxConcurrent`（1–5，默认 2，越界钳制），随设置同步，与 `scraperConcurrencyLimit` 一致——并发上限多半由 API 额度决定，额度跟账号走而非设备。
- IndexedDB `DB_VERSION` 15 → 16，新增 `task-queue` 对象仓库（keyPath `id`，索引 `status`、`order`）。该仓库不进入 sync manifest。
- `ActiveRightTab` 收窄为 `'chat'`；持久化值为 `'progress'` 时按现有 `isActiveRightTab` 回退到 `'chat'`，打开状态保持。

### D13 删除联动的触发方式

章节和书籍的删除不只来自界面上的删除按钮（`booksStore.deleteBook`、`useChapterManagement` 的删章 / 删卷），还会来自云同步应用远端删除、导入替换、书籍同步和 Agent MCP 工具。逐个调用点挂钩容易漏，因此：

- 执行者监听 `booksStore` 中各书的章节 ID 集合；某章节或书籍从中消失时，移除其排队项并中止运行项。
- 执行器启动每个项前再检查一次章节是否存在，不存在就直接移除该项。

### D14 桌面更新重启

- 保持 `desktop-app-updates` 现有规则不变：有运行中的章节任务（持有 `desktopRestartGuard.track` 的工作）时安装更新被拒绝并说明原因；拒绝提示补一句「可在任务中心暂停队列或全部停止后重试」。只有排队项、没有运行项时不阻止重启。
- `DesktopRestartGuard` 暴露只读的「是否处于准备 / 已提交阶段」；处于这两个阶段时 `canStart` 返回 false，队列不启动新项（避免让准备失败），项保持排队且不计为失败。若启动瞬间仍撞上 `RESTART_PREPARING`，按 book-busy 同样处理为等待。
- 重启后按 D5「恢复」规则进入暂停。

## Risks / Trade-offs

- [Gist 同步 apply 与翻译写入无互斥（遗留问题 #1），长时间批量运行会放大窗口期丢段落的概率] → 本次不修；断点续跑以 `completedParagraphIds` 为准，被吞掉的段落在用户重跑「继续翻译」时会被补上；建议后续单独变更处理。
- [运行中任务持有共享锁，长批量期间导入应用 / 书籍同步会因拿不到独占锁而失败] → 占用者标签显示「任务队列 · …」，错误提示里说明可暂停队列后重试。
- [「选未翻译」对大书需要读取全部章节内容，可能较慢] → 只在用户点击时计算并显示加载态；徽章只算已展开的卷。
- [无 Web Locks 的环境下多个标签页可能各自执行队列] → 目标运行环境（现代浏览器、Electron）都支持；无锁时在任务中心显示提示，建议只开一个标签页。
- [手动启动遇上限需要排队，用户可能以为点击无效] → chip 闪烁，按钮显示「排队中（第 1 位）」状态。
- [`targetParagraphIds` 快照后用户编辑章节（增删段落）] → 恢复时过滤已删除段落；新增段落不在本次目标内，需用户再次启动。

## Migration Plan

1. 先上线执行器与队列（UI 入口暂时仍用旧面板验证），确认手动单章流程与原行为一致。
2. 再切换到任务中心并移除右侧进度页签；IndexedDB 升级与 `activeRightTab` 回退在同一版本发布。
3. 回滚：旧版本读取到 DB v16 不会降级（IndexedDB 不支持降版本打开），因此回滚需发布带 v16 的旧 UI 版本；`task-queue` 仓库对旧逻辑无影响。
