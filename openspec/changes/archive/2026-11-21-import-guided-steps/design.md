## Context

导入页是 dispatcher + Desktop / Tablet / Mobile 三个变体，业务状态在 `useImportPage` 的 provide / inject 里。`section` 记录正在看哪一块（`tasks` / `chat` / `sources` / `draft` / `plan`），断点切换时保留。任务状态（`draft` → `ready` → `applied` 等）、来源与草稿在 `import-workspace` store 里。

改动前，各端的布局如下：

- 桌面和平板横屏的工作区用 PrimeVue Tabs 切换三个分区，运行条上有继续 / 暂停按钮。
- 平板竖屏多出一个「对话」标签。
- 手机把对话也当作一个分区。

助手面板由 `ui.rightPanelOpen && ui.activeRightTab === 'chat'` 控制，通过 `useMainNavDispatch().dispatch('chat')` 开关。桌面在导入路由下强制展开；平板横屏另有一个常驻停靠的 `<aside>`。动机见 proposal.md「Why」。

## Goals / Non-Goals

**Goals:**

- 三端共用同一套步骤判断、步骤进度条和底部主按钮，变体只决定摆放位置。
- 步骤状态由任务状态推导，不新增持久化字段，刷新或换设备后结果一致。
- 平板竖屏和手机的对话走壳层已有的开关状态，不在页面里另造一套。

**Non-Goals:**

- 不改导入 Agent、提取、方案生成与确认导入的行为，主按钮只调用 store 已有的 `send` / `pause` / `previewPlan`。
- 不改导入方案面板内部的布局与确认流程。
- 不改桌面右栏「导入路由强制展开」的规则。

## Decisions

### D1 三步映射到已有分区

`import-steps.ts` 用纯函数表达规则：

- `STEP_SECTION` 把三步映射到 `sources` / `draft` / `plan`；
- `importStepStates` 由来源数与任务状态推出每步是否完成以及当前该做的一步：
  - 来源数 > 0：来源完成；
  - 状态属于 ready / applying / applied / reverting / reverted：整理完成；
  - 状态为 applied：导入完成；
- `importStepAction` 由正在查看的分区、是否运行中、`canContinue`、来源数、章节数推出主按钮：
  - `pause`：运行中；
  - `preview`：整理且已有章节，任务没有中途暂停（`paused`）也没有待执行的调用（`checkpoint.remainingCalls`）；
  - `continue`：其他情况，无来源或不可继续时禁用；
  - `plan`：返回 null。

不新增 `step` 状态：继续用 `section` 记录正在查看的一步，所以断点、横竖屏切换后自然保留，也不用改持久化。备选方案是在 store 里加 `currentStep`，但它与 `section` 重复，还要处理两者不一致的情况。

### D2 打开任务时的落点

`useImportPage.landingSection` 等于 `STEP_SECTION[importStepStates(...).current]`。`section` 为 `tasks` 或 `chat`（旧分区，或刚打开任务）时，`useImportFlow.current` 取落点，否则取用户点选的分区。用户点选的步骤不会被状态变化覆盖。只有两个主按钮会主动切换：开始整理切到 `draft`，生成方案切到 `plan`。

### D3 共用的 `useImportFlow` 与两个组件

`useImportFlow()` 把纯函数接上 store 与 i18n，返回 `current`、`steps`（标签、进度文字、done / active / viewing）、`selectStep`、`action`、`actionHint`、`actionLabel`、`runAction`。

- `ImportStepBar` 渲染三步。
- `ImportStepFooter` 渲染主按钮，用容器查询区分宽窄：窄时按钮占满宽度、说明在上方；宽时按钮靠右、说明在左侧同一行。
- 桌面和平板的 `ImportTaskWorkspace` 与手机的 `ImportMobileTask` 只负责摆放：
  - 桌面和平板把底部栏放在工作区底部，正文在中间滚动；
  - 手机用文档滚动，底部栏 sticky 在底部标签栏上方。

### D4 运行条精简与提示组件

运行条去掉继续、暂停和来源数，只保留任务名、状态 Tag 和章节进度。存储异常、等待回答、其他任务运行中、没有模型、最近错误、工作区错误这些提示抽成 `ImportRunNotices`：桌面和平板放在运行条里，手机放在正文顶部。抽组件的另一个原因是把它们留在 `ImportRunBar` 会让模板复杂度超过 Fallow 门禁。

### D5 对话位置

- **平板**：`MainLayoutTablet` 按 `usePortrait()` 区分。
  - 横屏保留停靠的 `<aside>`。
  - 竖屏复用已有的右侧滑入覆盖层：导入路由下渲染 `ImportChatPanel`（外面包一层与停靠面板相同的底色），其他路由仍是 `TabletChatPanel`。
  - 开关仍走 `ui.rightPanelOpen && activeRightTab === 'chat'`；月詠预览与顶部栏按钮都调用 `dispatch('chat')`。
  - `isImportRoute` 变化时关闭面板，防止导入对话的开关状态带到别的页面。
- **手机**：`MainLayoutMobile` 在导入路由下把底部栏「月詠」与预览接到 `ImportChatSheet`（底部抽屉），离开路由时同样关闭。
- **备选方案**：把对话做成页面内组件，由页面自己管开关。没有采用，因为壳层的遮罩、动画和顶部栏按钮都已经接在 `ui` store 上，页面内另做一套会出现两个开关源。

### D6 月詠预览

`buildImportAssistantPreview` 是纯函数，优先级为：问题、错误、压缩中、运行中（正在输出内容的最后一行，超过 60 字从开头截断），然后是空闲（最近一条回复的开头 60 字，没有回复时显示点击提示）。`ImportAssistantPreview` 从 `store.events` 末尾向前找最近一条助手消息。

### D7 未发送输入按任务保留

`useImportChatPanel` 的输入框改为按 `selectedTaskId` 读写模块级 `reactive` 记录。抽屉和滑入面板卸载、重新挂载后，输入不会丢失；切换任务也不会把上一个任务的输入带过去。

### D8 内容优先

- `ImportSourcePanel list-first`：已有来源时，列表排在添加区之前，添加区收成「添加来源」按钮。
- `ImportDraftPanel structure-first`：卷章结构排在前面，基本信息可折叠，折叠时显示书名与作者摘要。

两个开关都只在三步工作区里打开，其他调用方的布局不变。

## Risks / Trade-offs

- [平板竖屏和手机的对话可以关闭，与旧 spec「不能被收起」冲突] → spec 修改为按设备区分：停靠时仍不可收起；不停靠时由月詠预览常驻显示动态，随时一键打开。
- [`header-assistant-and-embeddings` 计划让平板顶部栏「月詠」按钮在导入路由下一律拦截点击] → 该 change 已同步修改：横屏仍拦截，竖屏正常开关滑入的导入对话。
- [旧 `section` 值 `chat`、`tasks` 可能残留在页面状态里] → `useImportFlow.current` 把它们映射到落点，不会出现空白分区。
- [生成方案的主按钮在 store 拒绝时（如方案过时、任务运行中）仍会切到「导入」] → 「导入」这一步本身会显示方案状态和重新生成入口，切过去不会造成误写。

## Migration Plan

纯前端界面调整，不涉及数据迁移。旧 i18n 键（`page.sourcesTab`、`draftTab`、`plan`、`chat` 等）随组件一起删除。回滚时还原组件与布局即可。
