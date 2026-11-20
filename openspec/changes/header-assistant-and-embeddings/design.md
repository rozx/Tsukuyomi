## Context

动机见 proposal.md「Why」。本设计以 `translation-task-queue` 已实现为前提：右侧面板只剩月詠助手，header 上有任务中心 chip 与 popup（含「其他 AI 活动」区、固定 / 收起悬浮面板），`ui.activeRightTab` 只剩 `'chat'`。

与本变更相关的现状：

- **桌面右侧**：`MainLayoutDesktop` 的右侧容器宽度为 `ui.rightPanelOpen ? rightPanelWidth : 3rem`；`AppRightPanelDesktop` 在折叠态渲染 `RightPanelRail`（助手、进度、向量三个按钮），展开态渲染可拖宽的 `AppChatPanelDesktop`（导入路由下为 `ImportChatPanel`，且强制展开）。桌面左侧菜单没有助手入口。
- **助手的其他打开方式**：段落「复制到助手 / 解释选中」写入 `ui.assistantInputMessage`，由 `AppRightPanelDesktop` 上一直挂载的 watcher 打开面板（`AppRightPanelDesktop.vue:45`）。这个 watcher 依赖折叠态组件也一直挂载。
- **平板 / 手机**：平板 `TabletNavRail`、手机 `MobileTabBar` 经 `useMainNavDispatch` 打开助手；平板书籍详情页还有一条页内图标栏（`BookDetailsTablet.vue`），含助手、进度、向量按钮。
- **向量化面板**：`BatchEmbeddingsPanel`（850 行）是挂在 `MainLayout` 的 `AdaptiveDrawer`（桌面 / 平板右侧抽屉，手机底部抽屉），由 `ui.batchEmbeddingsPanelOpen` 控制，入口 `BatchEmbeddingsButton` 在 `RightPanelRail`、`BookDetailsTablet` 页内栏、`MobileSysBar`。仅在书籍路由且本地嵌入开启时可用。统计只在抽屉可见时节流刷新（`BatchEmbeddingsPanel.vue:88`），订阅 `EmbeddingQueue` 的 `progress` / `batch-complete` / `idle` 和 `EmbeddingService` 的状态事件。
- **设置页**：`EmbeddingSettingsTab` 已显示模型下载与加载状态（就绪 / 加载中 / 失败）。

## Goals / Non-Goals

**Goals:**

- 桌面助手关闭时右侧零宽度；入口只在 header。
- 向量化的查看与常用操作在任务中心内完成，三端一致。
- 统计计算成本不高于现在：只在用户看得到时刷新。

**Non-Goals:**

- 改变助手面板本身的内容、宽度拖动或导入页行为。
- 改变平板左侧导航栏、手机底部 Tab 栏的助手入口。
- 改变嵌入队列的调度、分批或版本规则。

## Decisions

### D1 去掉折叠态，而不是把折叠态改成 0 宽

- `MainLayoutDesktop` 右侧容器在 `rightPanelOpen || isImportRoute` 为假时不渲染（而非宽度 0 的空容器），中央画布占满。
- `AppRightPanelDesktop` 删除 `collapsed` 分支与 `RightPanelRail`。
- `assistantInputMessage` 的 watcher 从 `AppRightPanelDesktop` 移到始终挂载的位置（`useMainLayoutShell` 或 `MainLayout` dispatcher），否则面板关闭时组件不在，「复制到助手」会失效。这是本设计最容易漏的一点。

替代方案：保留容器但宽度为 0——会留下一个无内容的 flex 子项和拖动手柄的边界情况，否决。

### D2 header 助手按钮

- `AppHeader` 在任务中心 chip 与同步 chip 之间加「月詠」按钮：图标 + 文字（窄窗口只留图标），面板打开时为激活态。点击直接调用 `useMainNavDispatch().dispatch('chat')`，与平板导航栏、手机 Tab 栏共用同一套开 / 关逻辑，不另写一份。
- 导入路由下面板强制打开，按钮显示激活态且点击不关闭（与现在导入页不可折叠一致）。

### D3 任务中心后台区的数据来源

- 新 composable `useEmbeddingBackground`（放在 `src/composables/task-center/`），由 `useTaskCenter` 组合使用。它吸收 `BatchEmbeddingsPanel` 的脚本逻辑：本书章节 / 记忆统计、旧向量计数、队列进度与 ETA、当前处理任务、补齐 / 重建 / 暂停 / 继续 / 打开测试查询。
- 刷新时机沿用现有节流策略，触发条件从「抽屉可见」改为「任务中心可见（popup 打开或固定面板展开）且后台区展开」；队列进度事件始终订阅（只更新轻量计数，供 chip 判断活动状态）。
- 当前书来自路由参数（与现在一致）；非书籍路由时不计算本书统计。
- 测试查询对话框 `BatchEmbeddingsTestQueryDialog` 改为挂在 `MainLayout` dispatcher（跨变体共享弹窗规则），由后台区「⋯」菜单打开。

### D4 后台区的显示规则

- 本地嵌入未开启（`isLocalEmbeddingEffectivelyEnabled` 为假）时整个区不渲染；不再显示「未开启，去设置」提示。
- 区头：标题、待处理总数、暂停 / 继续。展开内容：
  - 队列行：正在处理的书名与类型、ETA、进度；处理的是别的书时标明。
  - 旧向量提示（版本不匹配时），带「重建」按钮——复用 `BatchEmbeddingsStaleBanner` 的判断。
  - 书籍页：本书章节、记忆两条进度与「补齐缺失」；「⋯」菜单含「重建本书章节向量」「测试查询」「嵌入设置」。
  - 非书籍页：提示「打开一本书后可补齐或重建该书的向量」。
- 区的展开 / 折叠状态与「其他 AI 活动」区一样存进 `ui` store。

### D5 chip 活动指示

- 嵌入队列有待处理或正在处理的项时，视为「后台活动」，与「其他 AI 活动」同等：没有章节任务时 chip 显示活动圆点；不计入章节任务数量和进度条。队列暂停时不算活动。

### D6 设备形态

- 后台区是任务中心内容的一部分，桌面 / 平板 popup 与固定面板、手机底部抽屉都渲染同一个 fragment 组件（`TaskCenterEmbeddingSection.vue`），遵循任务中心已有的 dispatcher + 三变体结构，不新建变体。
- 删除 `BatchEmbeddingsButton` 的三个挂载点：`RightPanelRail`（整体删除）、`BookDetailsTablet` 页内图标栏、`MobileSysBar`。

### D7 模型后端状态移到设置

- `BatchEmbeddingsBackendStatus` 显示的后端（WebGPU / WASM）与模型 / 章节模型版本并入 `EmbeddingSettingsTab` 的模型分组；暂停 / 继续不进设置（已在后台区）。

## Risks / Trade-offs

- [「复制到助手 / 解释选中」在面板关闭时失效] → D1 把 watcher 移到始终挂载处，并加回归测试。
- [没开本地嵌入的用户看不到任何向量入口，可能不知道这个功能] → 设置 → 嵌入是唯一入口，与现在面板里「去设置」提示的终点相同；帮助文档说明。
- [任务中心内容变长] → 后台区默认折叠时只占一行；只有本地嵌入开启的用户才会出现。
- [两个 change 修改同一条 `desktop-shell-chrome` 要求] → 本变更的 MODIFIED 内容已包含 `translation-task-queue` 加入的「任务进度从顶部系统条一跳可达」场景；必须按 translation-task-queue → 本变更的顺序归档。

## Migration Plan

1. 在 `translation-task-queue` 实现完成后的同一功能分支上继续。
2. 先做 D1 / D2（右侧栏与助手按钮），浏览器验证助手开关、拖宽、导入页、「复制到助手」。
3. 再做后台区并删除旧面板与按钮。
4. 归档顺序：`translation-task-queue` 先归档，本变更后归档。
