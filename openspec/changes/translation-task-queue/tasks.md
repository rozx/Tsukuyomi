> 运行时逻辑（`services/` / `stores/` / `composables/` / `models/`）一律先写失败测试再实现（见 CLAUDE.md「TDD 是默认工作流」）。每组完成后跑 `bun run lint && bun run type-check`。

## 1. 数据模型与存储

- [ ] 1.1 新增 `TaskQueueItem` 类型与队列级状态类型（design D2），并补 `AIProcessingTask.queueItemId` 可选字段；`bun run type-check` 通过
- [ ] 1.2 先写测试：`AppSettings.taskQueueMaxConcurrent` 默认 2、加载时把越界 / 非整数值钳制到 1–5；再实现并随设置同步；`bunx vitest run settings` 通过
- [ ] 1.3 IndexedDB `DB_VERSION` 15 → 16，新增 `task-queue` 对象仓库（keyPath `id`，索引 `status`、`order`），并确认该仓库不进入 sync manifest；补升级测试（v15 数据库升级后旧仓库数据完好、新仓库存在）并通过
- [ ] 1.4 先写测试：`ui` store 持久化值 `activeRightTab: 'progress'` 加载后回退为 `'chat'` 且 `rightPanelOpen` 不变；新增任务中心状态（固定、收起、位置、展开项 ID、其他 AI 活动区折叠），随 `ui` store 持久化到 localStorage `tsukuyomi-ui-state`；同步改写 `ui-store.mobile-workspace.test.ts` 中断言 `setActiveRightTab('progress')` 会被保存的用例（第 48–54 行）；测试通过

## 2. 章节任务执行器（不依赖页面）

- [ ] 2.1 先写测试：执行器按书籍设置解析模型，无模型时以可读错误失败；包装 aiProcessing 适配器，在 `addTask` 时注入 `queueItemId` 并记下 taskId，进度按 taskId 更新（同章节存在单段落任务时不会误更新它）；实现 `src/services/chapter-task/` 下的执行器骨架；测试通过
- [ ] 2.2 先写测试：首次运行快照目标段落——`continue` 为未翻译段落、`retranslate` 为全部非空段落、润色 / 校对为有译文段落；润色 / 校对在运行时发现无译文时失败并给出原因；实现并通过
- [ ] 2.3 先写测试：翻译按 `onParagraphTranslation` 记完成；润色 / 校对按块边界记完成（第 k+1 块开始或服务返回时，第 k 块全部段落记为完成，并上有改动段落）；段落落盘成功后才写完成记录；恢复时目标 = 快照 − 已完成并过滤已删除段落；目标语言改变或快照 ID 全部消失时按原范围重新计算（覆盖 spec 中断点续跑的全部场景）；实现并通过
- [ ] 2.4 把 `useChapterTranslation` 中整章翻译 / 继续翻译 / 润色 / 校对的服务调用、标题翻译回写、进度回调迁入执行器，页面侧只保留单段落任务；`bunx vitest run use-chapter-translation chapter-execution-language` 全部通过（含 per-chunk-save、remount-state、chapter-switch-writeback 三个现有文件，必要时把断言迁到执行器测试）
- [ ] 2.5 执行器每批落盘后刷新书籍缓存并发出 `chapterWrite` 事件，同时继续写 `chapterTasksStore` 的进度与 in-flight 段落；补测试验证事件参数与 store 写入

## 3. 任务队列 store 与调度

- [ ] 3.1 先写测试：入队（手动插队首、批量追加或插队首、按书中章节顺序）、去重（同章同类型跳过、不同类型并存）、润色 / 校对不适用章节跳过并计数；实现 `src/stores/task-queue.ts`；测试通过
- [ ] 3.2 先写测试：调度遵守全局上限；调高立即补位、调低不打断运行中任务；暂停时不启动新项、继续后按序补满；同一章节同时只运行一项且不阻塞后面其他章节；实现 `canStart` 判定与调度循环；测试通过
- [ ] 3.3 先写测试：停止单项（已落盘保留、标为已取消、补位）、全部停止（中止运行项并暂停、排队项保留）、移出、拖动排序、全部移除、失败不影响其他项、手动重试从断点继续；实现并通过
- [ ] 3.4 先写测试：拿锁抛 `BookBusyError` 时该项保持排队并记录等待原因、跳到下一本书的项、30 秒后重试；`BookExecutionGuard` 占用者标签改为「任务队列 · 类型 · 章节」；实现并通过
- [ ] 3.5 先写测试：持久化与恢复——刷新后运行项回到队首保持相对顺序、队列暂停且不自动开始；`loadThinkingProcesses` 跳过带 `queueItemId` 的记录（不改状态、不删待办）；执行者在恢复 / 接管时把原运行记录对账为已取消并附说明；`useMainLayoutShell` 的错误 / 取消监听跳过带 `queueItemId` 的任务；实现并通过
- [ ] 3.6 先写测试：执行者监听 `booksStore` 的章节 ID 集合，章节或书籍消失（含云同步、导入替换造成的）时移除排队项、中止运行项；启动前再检查章节存在；已结束项超过 200 条时删除最旧的；实现并通过
- [ ] 3.7 先写测试（mock `navigator.locks` 与 `BroadcastChannel`）：只有持锁标签页执行；启动即拿到锁走「恢复」（暂停），等待后被授予走「接管」（不改变暂停状态）；所有队列修改在单个 readwrite 事务内完成判重与定序（两个标签页同时入队同一章节只留一项）；停止 / 全部停止 / 暂停写成期望状态（`cancelRequested`、`paused`）由执行者收到广播后处理；`chapterWrite` 广播到非执行者；打开第二个标签页不改写执行者的运行记录与待办；无 `navigator.locks` 时当前标签页直接执行；实现并通过
- [ ] 3.8 先写测试：`DesktopRestartGuard` 暴露只读的准备 / 已提交状态，该状态下 `canStart` 为 false 且项不计失败；启动瞬间撞上 `RESTART_PREPARING` 按等待处理；有运行项时更新重启的拒绝提示包含「暂停队列或全部停止」；只有排队项时不阻止重启；实现并通过
- [ ] 3.9 设置变化、`chapterWrite`、队列状态变化接入应用启动流程（在 `MainLayout` dispatcher 或 `useMainLayoutShell` 中只初始化一次），浏览器中用 mock AI 服务（见 memory「Translation persistence map」的复现方法）驱动 3 章批量翻译，确认并发与落盘正确

## 4. 页面接入与通知

- [ ] 4.1 `useChapterTranslation` 的整章入口改为入队；阅读页按钮显示「排队中（第 N 位）」/ 运行中状态，取消、移出后按钮恢复可用；把 `use-chapter-translation.test.ts` 中「应该能够取消翻译 / 润色」改写为经队列项状态驱动，并新增「移出排队项后按钮恢复」测试，全部通过
- [ ] 4.2 `useBookDetailsPage` 监听 `chapterWrite`，命中当前选中章节时刷新阅读区；浏览器中验证批量任务写入当前打开章节后无需刷新即可看到译文与段落高亮
- [ ] 4.3 先写测试：批量来源任务不弹单章完成 / 失败 / 取消 toast、AI 动作通知只写入消息历史、批量项全部结束时弹一次汇总 toast；「全部停止」只弹一条；对账改写的中断记录不弹任何 toast；手动来源项的完成 / 错误 / 取消提示由队列按队列项状态发出，文案与原先一致；修改 `task-status-toasts.ts` 与执行器回调并通过
- [ ] 4.4 删除所有 `setActiveRightTab('progress')` 调用（`useChapterTranslation` 3 处、`useBookDetailsPage` 1 处）；`ActiveRightTab` 收窄为 `'chat'`；`bun run type-check` 通过

## 5. 任务中心（header）

- [ ] 5.1 先写测试：`useTaskCenter` 计算 chip 状态（空闲、仅运行、运行 + 排队、仅其他 AI 活动、批次结束含失败、暂停）、分组列表、未读圆点、单行展开切换；实现 `src/composables/task-center/useTaskCenter.ts`（provide / inject）并通过
- [ ] 5.2 实现 `TaskCenterChip.vue`（含新任务提示动效），替换 `AppHeader`、`TabletSysBar`、`MobileSysBar` 中的 AI 思考 chip，并改写 `tablet-sysbar-popover-anchor.test.ts` 中对 `ThinkingProcessPanel` 的 mock；浏览器中检查三种断点下只有一个 AI 入口
- [ ] 5.3 按 dispatcher + 三变体实现 `TaskCenter.vue` / `TaskCenterDesktop.vue` / `TaskCenterTablet.vue`（wrapper）/ `TaskCenterMobile.vue`；队列行、分组标题、其他 AI 活动行等重复片段抽成 fragment 组件；浏览器中验证 popup 分组、并发显示、空状态
- [ ] 5.4 展开行复用 `TaskStatusBar`、`TaskTodos`、`TaskStream`（流式区限高滚动、跨行切换保持滚动位置），提供停止 / 移出 / 重试 / 打开章节，日志已清理时显示摘要；非执行者标签页展开运行中的行只显示进度并提示「详细过程在另一个标签页中」；浏览器中验证
- [ ] 5.5 「其他 AI 活动」区迁入 `ThinkingProcessBody` 的列表、停止与清理能力，折叠状态持久化；删除 `ThinkingProcessPanel`；浏览器中验证助手对话、单段润色出现在该区且不计入 chip 进度
- [ ] 5.6 固定悬浮面板挂到 `MainLayout` dispatcher：点击外部不关闭、拖动并限制在视口内、位置刷新后恢复、导航与断点切换后保持、手机断点隐藏但保留固定状态；收起为迷你进度条并可展开；浏览器中逐项验证
- [ ] 5.7 手机形态：底部抽屉 + 全屏任务详情；`BookDetailsMobileReader` 的进度按钮改为打开任务中心抽屉；浏览器手机视口验证

## 6. 移除右侧进度页签

- [ ] 6.1 删除 `AppProgressPanelDesktop`、`TabletProgressPanel`、`TranslationProgress*` 容器、`TaskSwitcher`、`TaskSwitcherItem`、`TaskActionBar`、`useTranslationProgressPanel` 中不再使用的部分；`MobileProgressSheet` 并入任务中心手机形态
- [ ] 6.2 移除 `RightPanelRail` 的进度按钮、`ChapterToolbar` 的进度按钮、`useTabletRightRail` 与 `MainLayoutMobile` 中的进度分支，以及平板页面级 rail 上的进度按钮（`BooksTabletSideRail.vue:56`、`BookDetailsTablet.vue:92`，及 `useBooksTabletPage` 透出的 `isProgressActive`）；顺带删除无人使用的 `BookWorkspaceMode` 值 `'progress'`；`bun run lint && bun run type-check && bun run quality-check` 通过且无新增未使用导出

## 7. 批量启动

- [ ] 7.1 先写测试：多选状态 composable——章节勾选切换、卷级三态、全选整卷、「选未翻译」、退出清空；实现并通过
- [ ] 7.2 先写测试：完成度统计按已展开卷懒加载、按书籍目标语言计算、`chapterWrite` 后失效重算；实现（复用 `loadChapterContentsBatch` + `getChapterTranslationStats`）并通过
- [ ] 7.3 `VolumesList`、`VolumesListTablet` 与手机目录加入多选模式（复选框、卷级复选框、完成度 / 队列状态徽章、隐藏拖拽与编辑删除、Esc 退出）；三种断点浏览器验证
- [ ] 7.4 实现批量确认对话框（任务类型、翻译范围、入队位置、预计模型、并发与队列数量、不适用章节提示）与入队结果 toast；浏览器中验证「6 章中 1 章已在队列」显示「已加入 5 章，1 章已在队列中」

## 8. 设置、文案与文档

- [ ] 8.1 设置页新增「任务队列」分组与「最大同时进行任务」步进器（1–5）；浏览器中验证修改后调度立即生效
- [ ] 8.2 新增与修改的界面文案补齐 zh-CN / zh-TW / en-US 三套 i18n，删除不再使用的进度页签与 AI 思考相关文案；`bun run type-check` 通过
- [ ] 8.3 更新 `public/help/<locale>/` 中提到翻译进度面板或 AI 思考入口的帮助文档（zh-CN 中命中的有 `book-details-translation`、`book-details-overview`、`front-page`、`toolbar-guide`、`chat-assistant-guide`、`local-embedding` 与 `index.json`，逐个确认后修改；以 zh-CN 为源同步 zh-TW / en-US，`{#id}` 锚点一致）

## 9. 整体验证

- [ ] 9.1 运行 `bun run test`，全部通过
- [ ] 9.2 运行 `bun run test:coverage` 后执行 `bun run lint && bun run type-check && bun run quality-check`，全部通过
- [ ] 9.3 浏览器端到端（mock AI 服务）：批量入队 5 章 → 并发 2 运行 → 刷新 → 队列暂停且原运行项在队首 → 继续 → 断点续跑完成 → 汇总 toast；同时开第二个标签页确认每章只执行一次
- [ ] 9.4 归档前更新 `openspec/specs/translation-progress-panel/spec.md` 与 `openspec/specs/unified-right-panel/spec.md` 的 Purpose，使其不再描述已移除的单任务视图与页签切换
