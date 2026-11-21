## Why

章节级翻译 / 润色 / 校对现在只能对「当前打开的章节」逐个手动启动，进度显示在右侧面板的「翻译进度」页签里，一次只聚焦一个任务。想整卷翻译时只能一章一章点，也没有任何并发上限，跑多个任务时容易撞服务商限流；同时 header 上的「AI 思考」入口和右侧「翻译进度」页签功能重叠。需要一个统一的任务队列和任务中心，把批量启动、并发控制和多任务进度显示放在一起。

## What Changes

- 新增**章节任务队列**：章节级翻译 / 润色 / 校对统一经队列执行，按设置里的「最大同时进行任务」（全局一个数）调度；支持暂停 / 继续 / 停止、移出、调整顺序、失败后手动重试、去重；队列只存在本设备，刷新或重启后保留并整体进入暂停，原运行中的任务回到队首并从断点继续。
- 章节任务的执行不再依赖书籍详情页当前选中的章节：任务可在任意页面后台运行，打开中的阅读页实时看到写入的译文。
- 新增 header **任务中心**：替换并合并原「AI 思考」chip。chip 显示运行数、排队数和整体进度；点开是任务 popup，上半区为章节任务队列（进行中 / 排队中 / 已完成，行内展开查看状态栏、待办、思考与工具调用流），下半区为「其他 AI 活动」（助手、单段任务、术语翻译，不排队、不占并发名额）。popup 可固定成悬浮面板、拖动位置、收起成迷你进度条；手机端为底部抽屉。
- 新增**批量启动**：章节列表进入多选模式（含卷级三态勾选、章节翻译完成度徽章、「选未翻译」），确认对话框选择任务类型、翻译范围（继续 / 全部重新翻译）和入队位置后批量入队。
- 设置新增「最大同时进行任务」（1–5，默认 2）。
- **BREAKING（界面）**：移除右侧面板的「翻译进度」页签，右侧面板只保留月詠助手；新任务启动时不再自动切换右侧面板，只让 header chip 闪烁提示。移除桌面章节工具栏的「进度」按钮和右侧图标栏的进度按钮。

## Capabilities

### New Capabilities

- `chapter-task-queue`: 章节级翻译 / 润色 / 校对任务的队列与调度——入队来源、并发上限、暂停与停止、去重、失败处理、断点续跑、刷新 / 重启后的恢复、多标签页单执行者、书籍被占用时等待、书籍或章节删除联动、批量来源任务的通知节制，以及「最大同时进行任务」设置项。
- `header-task-center`: header 上的任务中心入口与 popup——chip 各状态、队列分区与行内展开详情、其他 AI 活动区、固定 / 拖动 / 收起的悬浮面板、未读活动提示、手机底部抽屉与平板形态。
- `batch-chapter-tasks`: 从章节列表批量启动章节任务——多选模式、卷级勾选、完成度徽章、选未翻译、确认对话框与入队结果反馈。

### Modified Capabilities

- `unified-right-panel`: 右侧面板不再有「翻译进度」页签与自动切换；跨页面查看进度、经全局 store 传递进度、取消后同步书籍详情页状态等要求改由任务中心承接。
- `translation-progress-panel`: 由「单任务聚焦视图 + 下拉切换器 + 底部操作栏」改为任务中心内的「任务列表 + 行内展开」；状态栏、待办区、流式内容区、内联工具调用、未读提示等要求保留并改到展开行内。
- `tablet-component-variants`: 平板不再在右侧面板挂载翻译进度面板，改用与桌面一致的任务中心弹出层。
- `tablet-shell-chrome`: 平板顶部信息条的「AI 思考」pill 改为任务中心 chip；右侧覆盖面板只承载 AI 助手；导航栏激活条件不再依赖右侧页签值；壳层允许读取任务队列状态。
- `desktop-shell-chrome`: 桌面右侧上下文面板不再包含翻译进度，任务进度改由顶部系统条的任务中心一跳可达。

## Impact

- **执行层**：`src/composables/book-details/useChapterTranslation.ts` 中整章翻译 / 继续翻译 / 润色 / 校对的执行逻辑抽离为不依赖页面的执行器；`src/stores/chapter-tasks.ts`、`src/stores/ai-processing.ts`（任务关联队列项）、`src/services/book-execution-guard.ts`（占用者标签）受影响；新增任务队列 store 与执行服务。
- **存储**：IndexedDB 版本 15 → 16，新增任务队列对象仓库（仅本设备，不参与 Gist 同步）；`AppSettings` 新增最大并发字段；`ui` store 新增任务中心固定 / 收起 / 位置状态，`activeRightTab` 去掉 `'progress'` 值并迁移旧值。
- **界面**：`AppHeader`、`TabletSysBar`、`MobileSysBar` 的 AI 思考 chip；`ThinkingProcessPanel` / `ThinkingProcessBody` 并入任务中心；删除 `AppProgressPanelDesktop`、`TabletProgressPanel`，`MobileProgressSheet` 改为任务中心手机形态；`RightPanelRail`、`ChapterToolbar`、`useTabletRightRail`、`MainLayoutMobile`、`useBookDetailsPage` 中的进度页签入口；`VolumesList` / `VolumesListTablet` 及手机目录加多选模式；设置页新增任务队列分组。
- **复用组件**：`TaskStatusBar`、`TaskTodos`、`TaskStream` 及流式子组件放入展开行复用；`TaskSwitcher` / `TaskSwitcherItem` / `TaskActionBar` 被列表取代后删除。
- **通知**：`src/composables/main-layout/task-status-toasts.ts` 对批量来源任务改为汇总提示。
- **文案与文档**：zh-CN / zh-TW / en-US 三套 i18n；`public/help/<locale>/` 中涉及翻译进度面板的帮助文档同步更新。
