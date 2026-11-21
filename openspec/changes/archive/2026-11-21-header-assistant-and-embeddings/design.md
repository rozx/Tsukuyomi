## Context

动机见 proposal.md「Why」。本设计以 `translation-task-queue` 已实现为前提：右侧面板只剩月詠助手，header 上有任务中心 chip 与 popup（含「其他 AI 活动」区、固定 / 收起悬浮面板），`ui.activeRightTab` 只剩 `'chat'`。

与本变更相关的现状：

- **桌面右侧**：`MainLayoutDesktop` 的右侧容器宽度为 `ui.rightPanelOpen ? rightPanelWidth : 3rem`；`AppRightPanelDesktop` 在折叠态渲染 `RightPanelRail`（助手、进度、向量三个按钮），展开态渲染可拖宽的 `AppChatPanelDesktop`（导入路由下为 `ImportChatPanel`，且强制展开）。桌面左侧菜单没有助手入口。
- **助手的其他打开方式**：段落「复制到助手 / 解释选中」写入 `ui.assistantInputMessage`，由 `AppRightPanelDesktop` 上一直挂载的 watcher 打开面板（`AppRightPanelDesktop.vue:45`）。这个 watcher 依赖折叠态组件也一直挂载。
- **平板 / 手机**：手机 `MobileTabBar` 经 `useMainNavDispatch` 打开助手。平板左侧 `TabletNavRail` 没有助手入口（2026-04 移除，commit `a96bcd68`；`tablet-shell-chrome` 规格仍写着有，已过时）。平板的助手入口只在书库页、书籍详情页各自的右侧竖栏（`TabletSideRail` 外壳，书库页内容在 `BooksTabletSideRail.vue`，书籍详情页内联在 `BookDetailsTablet.vue`），经 `useTabletRightRail` 开关；竖栏上还有左侧列表 / 目录开关，书籍详情页的竖栏另有向量按钮。列表开关状态归页面：`useBooksTabletPage().isListOpen`（`useBooksTabletPage.ts:101`）、`useBookDetailsPage().isTabletSidebarOpen`（`useBookDetailsPage.ts:241`），都按横竖屏决定默认值。平板助手面板是盖在 `<main>` 上的覆盖层，顶部信息条不在遮罩下。
- **向量化面板**：`BatchEmbeddingsPanel`（850 行）是挂在 `MainLayout` 的 `AdaptiveDrawer`（桌面 / 平板右侧抽屉，手机底部抽屉），由 `ui.batchEmbeddingsPanelOpen` 控制，入口 `BatchEmbeddingsButton` 在 `RightPanelRail`、`BookDetailsTablet` 页内栏、`MobileSysBar`。仅在书籍路由且本地嵌入开启时可用。统计只在抽屉可见时节流刷新（`BatchEmbeddingsPanel.vue:88`），订阅 `EmbeddingQueue` 的 `progress` / `batch-complete` / `idle` 和 `EmbeddingService` 的状态事件。
- **设置页**：`EmbeddingSettingsTab` 已显示模型下载与加载状态（就绪 / 加载中 / 失败）。

## Goals / Non-Goals

**Goals:**

- 桌面助手关闭时右侧零宽度；入口只在 header。
- 平板去掉页内右侧竖栏；助手在所有平板页面都能从顶部信息条打开，列表 / 目录开关挪到它控制的左侧（顶部信息条最左）。
- 向量化的查看与常用操作在任务中心内完成，三端一致。
- 统计计算成本不高于现在：只在用户看得到时刷新。

**Non-Goals:**

- 改变助手面板本身的内容、宽度拖动或导入页行为。
- 改变手机底部 Tab 栏的助手入口；在平板左侧导航栏加助手入口（助手统一在顶部信息条）。
- 改变平板列表 / 目录的开合行为与横竖屏默认值（只换按钮位置）。
- 改变嵌入队列的调度、分批或版本规则。

## Decisions

### D1 去掉折叠态：容器保留、关闭时宽度为 0

- `MainLayoutDesktop` 右侧容器保留，宽度改为 `rightPanelOpen || isImportRoute ? rightPanelWidth : 0`，沿用现有 220ms 宽度过渡（`MainLayoutDesktop.vue` 的 `.desktop-shell-aside` transition），开关时面板滑入滑出；宽度为 0 时不渲染面板内容和拖动手柄，中央画布占满。
- `AppRightPanelDesktop` 删除 `collapsed` 分支与 `RightPanelRail`。
- `assistantInputMessage` 的 watcher 从 `AppRightPanelDesktop` 移到 `MainLayoutDesktop`（桌面布局变体始终挂载）。否则面板关闭时组件不在，「复制到助手」会失效——这是本设计最容易漏的一点。不放进 `useMainLayoutShell`：平板和手机的助手面板本来就一直挂载（`MainLayoutTablet.vue:70` 用类名滑入、`MainLayoutMobile` 用 `v-model:visible`），由各自的 `useRightPanel` watcher 处理，放进共享壳层会重复处理。

替代方案：关闭时 `v-if` 整个容器——会丢掉现有的宽度过渡动画，面板突然出现，否决。（评审时由「不渲染容器」改为此方案。）

### D2 header 助手按钮

- `AppHeader` 在分隔线之后、通知按钮之前加「月詠」按钮（顺序：任务中心 · 同步 | 月詠 · 通知）：图标 + 文字（窄窗口只留图标），面板打开时为激活态。点击直接调用 `useMainNavDispatch().dispatch('chat')`，与平板顶部信息条（D8）、手机 Tab 栏共用同一套开 / 关逻辑，不另写一份。
- 导入路由下面板强制打开，按钮显示激活态且点击不关闭（与现在导入页不可折叠一致）。`dispatch('chat')` 本身不知道导入路由，会把 `rightPanelOpen` 切成 false（离开导入页后面板变成关闭），所以按钮在导入路由下要自己拦掉点击。
- **窄窗口**：Electron 主窗口没有 `minWidth`（`src-electron/electron-main.ts:293` 只设了默认宽度 1200），且 Electron 始终走桌面变体；而 `AppHeader` 的 chip 文字在桌面上一律显示、没有任何收起规则。加上任务中心 chip 和「月詠」按钮后，窄窗口下 header 会挤出。给 `.dsk-sysbar` 加容器查询，宽度不足时按顺序收起：先隐藏品牌副标题，再隐藏同步 chip 的倒计时，最后各 chip 只留图标（任务中心 chip 保留数字）。

### D3 任务中心后台区的数据来源

- 新 composable `useEmbeddingBackground`（放在 `src/composables/task-center/`），由 `useTaskCenter` 组合使用。它吸收 `BatchEmbeddingsPanel` 的脚本逻辑：本书章节 / 记忆统计、旧向量计数、队列进度与 ETA、当前处理任务、补齐 / 重建 / 暂停 / 继续 / 打开测试查询。其中「当前处理任务」要带上原面板的防闪烁逻辑（`BatchEmbeddingsPanel.vue:231`：队列运行期间保留最后一次看到的任务，避免批次间隙整行闪掉）。
- 初始状态用 `EmbeddingQueue.getProgress()` 同步读取（`embedding-queue.ts:404`），之后靠事件更新，因此 chip 在任务中心从未打开过时也能判断活动状态。
- 刷新时机沿用现有节流策略，触发条件从「抽屉可见」改为「任务中心可见（popup / 手机抽屉打开，或固定面板展开）且后台区展开」；队列进度事件始终订阅（只更新轻量计数，供 chip 判断活动状态）。固定面板是否在屏幕上由渲染它的桌面 / 平板任务中心上报（`setPinnedPanelShown`），手机没有固定面板，保存的固定状态在手机上不算可见。
- 当前书来自路由参数（与现在一致）；非书籍路由时不计算本书统计。
- 测试查询对话框 `BatchEmbeddingsTestQueryDialog` 改为挂在 `MainLayout` dispatcher（跨变体共享弹窗规则），由后台区「⋯」菜单打开。

### D4 后台区的显示规则

- 本地嵌入未开启（`isLocalEmbeddingEffectivelyEnabled` 为假）时整个区不渲染；不再显示「未开启，去设置」提示。
- 区头：标题、待处理总数、暂停 / 继续。
- **同步闸门**：云同步期间队列会被 `applySyncGate` 挂起，此时用户点「继续」也放不行（`embedding-queue.ts:382`，闸门与用户暂停分开记录，`getProgress().syncGated` 可读）。区头此时显示「同步中，稍后继续」，暂停 / 继续按钮仍反映并修改用户自己的暂停状态，但不暗示能立即恢复。原面板通过 `BatchEmbeddingsBackendStatus` 的 `syncGated` 显示过这个状态，迁移时不能丢。`progress.paused` 是「用户暂停 ∨ 闸门」，分不出用户自己是否暂停过，因此 `getProgress()` 增加 `userPaused` 字段，按钮按它切换。
- 展开内容：
  - 队列行：正在处理的书名与类型、ETA、进度；处理的是别的书时标明。
  - 旧向量提示（版本不匹配时），带「重建」按钮——复用 `BatchEmbeddingsStaleBanner` 的判断。
  - 书籍页：本书章节、记忆两条进度与「补齐缺失」；「⋯」菜单含「重建本书章节向量」「测试查询」「嵌入设置」。
  - 非书籍页：提示「打开一本书后可补齐或重建该书的向量」。
- 区的展开 / 折叠状态与「其他 AI 活动」区一样存进 `ui` store（`taskCenterEmbeddingCollapsed`），默认折叠，只占一行区头。
- 「⋯」菜单在区内就地展开，不用浮层：任务中心本身是 popover，菜单浮层挂在 body 上会被判为外部点击而关闭任务中心。
- 「嵌入设置」跳转 `/settings?tab=embedding`，设置页按路由参数选中嵌入分区（已打开时监听参数切过去）。不改写保存的「上次打开分区」：它随设置同步，监听它会让远端同步把用户正在看的标签切走。

### D5 chip 活动指示

- 嵌入队列有待处理或正在处理的项时，视为「后台活动」，与「其他 AI 活动」同等：没有章节任务时 chip 显示活动圆点；不计入章节任务数量和进度条。队列被用户暂停或被同步闸门挂起时都不算活动；本地嵌入关闭时也不算（关闭后队列会保留未处理项，不能让 chip 一直显示活动）。

### D6 设备形态

- 后台区是任务中心内容的一部分，桌面 / 平板 popup 与固定面板、手机底部抽屉都渲染同一个 fragment 组件（`TaskCenterEmbeddingSection.vue`，书籍页的本书部分拆到 `TaskCenterEmbeddingBook.vue` 以控制模板复杂度），遵循任务中心已有的 dispatcher + 三变体结构，不新建变体。
- 删除 `BatchEmbeddingsButton` 的三个挂载点：`RightPanelRail`（整体删除）、`BookDetailsTablet` 页内图标栏（随竖栏整体删除，见 D8）、`MobileSysBar`。

### D7 模型后端状态移到设置

- `BatchEmbeddingsBackendStatus` 显示的后端（WebGPU / WASM）与模型 / 章节模型版本并入 `EmbeddingSettingsTab` 的模型分组；暂停 / 继续不进设置（已在后台区）。

### D8 平板：删除页内右侧竖栏，按钮进顶部信息条

- 删除 `TabletSideRail.vue`、`BooksTabletSideRail.vue` 与 `BookDetailsTablet.vue` 内的竖栏；`useTabletRightRail` 不再有调用方，删除（助手开关统一走 `useMainNavDispatch().dispatch('chat')`，行为相同）；`rail-base.css` 在 `RightPanelRail` 与平板竖栏都删除后不再被引用，一并删除。
- **助手**：`TabletSysBar` 与桌面同位置（分隔线之后、通知按钮之前）加「月詠」按钮，规则与 D2 相同：面板打开时为激活态；导入路由横屏时显示激活态且拦掉点击（平板横屏导入页的 `ImportChatPanel` 常驻停靠，见 `MainLayoutTablet.vue` 的 `.tablet-import-chat`）；竖屏时导入对话改在右侧滑入面板（见 `import-guided-steps`），按钮照常调用 `dispatch('chat')` 开关它。平板只显示图标，带 `aria-label` 与 title。覆盖层的遮罩只盖 `<main>`，面板打开时再点顶部栏按钮即可关闭。
- **列表 / 目录开关**：`TabletSysBar` 品牌文字左侧放一个空挂载点 `<div id="tablet-sysbar-leading">`。`BooksPageTablet` 与 `BookDetailsTablet` 用 `<Teleport to="#tablet-sysbar-leading" defer>` 把各自的开关按钮渲染进去；状态仍是页面 composable 的 `isListOpen` / `isTabletSidebarOpen`，竖屏叠层遮罩、横屏参与布局的行为不变。
  - 不把状态搬进 `ui` store 让顶部栏自己渲染：顶部栏在布局里，拿不到页面 provide 的 composable；搬进 store 等于给壳层加平板专属状态，违反 `tablet-shell-chrome`「平板壳层不引入新业务状态」。Teleport 只需要一个空节点，按钮与状态都留在页面里；离开页面或断点切到桌面时，按钮随页面变体卸载，挂载点为空、不占宽度。
  - `defer`（Vue 3.5）让 Teleport 在同一轮挂载完成后再解析目标，避免页面先于顶部栏挂载时找不到挂载点。
  - 按钮沿用竖栏按钮的标题（「收起 / 展开书籍列表」「收起 / 展开目录」）、`aria-pressed` 与图标切换（`pi-angle-double-left` / `pi-bars`），外观改用顶部栏 chip 规格。
- **窄宽度**：平板竖屏最窄约 768px，顶部栏左侧多一个开关、右侧多一个图标按钮。`.tst-brand` 已是 `flex: 1`，给品牌文字加 `min-width: 0` 与省略号，右侧按钮组不换行、不被挤出。
- 替代方案：开关放进左侧列表头（收起）+ 内容区左上角（展开）——开合两种状态下按钮在不同位置，否决；放进 `TabletNavRail`——那是全局导航，混入只对当前页有效的开关，否决。

## Risks / Trade-offs

- [「复制到助手 / 解释选中」在面板关闭时失效] → D1 把 watcher 移到始终挂载处，并加回归测试。
- [没开本地嵌入的用户看不到任何向量入口，可能不知道这个功能] → 设置 → 嵌入是唯一入口，与现在面板里「去设置」提示的终点相同；帮助文档说明。
- [任务中心内容变长] → 后台区默认折叠时只占一行；只有本地嵌入开启的用户才会出现。
- [平板竖屏顶部栏拥挤] → D8 窄宽度规则；浏览器在 768×1024 与 1024×768 验证按钮都可点、不溢出。
- [Teleport 目标在页面挂载时还不存在，按钮丢失或报警告] → `defer`；加组件测试：挂载平板布局 + 书库页后挂载点内有开关按钮，切换到首页后挂载点为空。
- [平板 `tablet-shell-chrome` 两条要求同时被 `translation-task-queue` 修改] → 本变更的 MODIFIED 内容以 `translation-task-queue` 的版本为底；与 `desktop-shell-chrome` 一样，必须按 translation-task-queue → 本变更的顺序归档。
- [两个 change 修改同一条 `desktop-shell-chrome` 要求] → 本变更的 MODIFIED 内容已包含 `translation-task-queue` 加入的「任务进度从顶部系统条一跳可达」场景；必须按 translation-task-queue → 本变更的顺序归档。

## Migration Plan

1. 在 `translation-task-queue` 实现完成后的同一功能分支上继续。
2. 先做 D1 / D2（右侧栏与助手按钮），浏览器验证助手开关、拖宽、导入页、「复制到助手」。
3. 再做 D8（平板竖栏），浏览器在平板横竖屏验证助手开关、列表 / 目录开关与导入页。
4. 再做后台区并删除旧面板与按钮。
5. 归档顺序：`translation-task-queue` 先归档，本变更后归档。
