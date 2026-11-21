## Why

`translation-task-queue` 把翻译进度搬进了 header 的任务中心之后，桌面右侧那条常驻图标栏只剩「助手」和「向量」两个按钮，却仍占着 3rem 宽度；向量化面板也还是一个独立的右侧抽屉，入口散落在桌面右侧栏、平板书籍详情页图标栏和手机顶部信息条三处。把这两个入口也收进 header，让所有「打开一个面板 / 查看后台在跑什么」的入口集中在顶部系统条。

平板也有同样的右侧竖栏：书库页与书籍详情页各有一条（`TabletSideRail`），上面是左侧列表 / 目录开关、助手和（书籍详情页的）向量按钮。助手在 2026-04 从平板左侧导航栏移到了这两条竖栏（commit `a96bcd68`），因此平板上只有这两个页面能打开助手，首页、设置等页面没有入口；而列表开关控制的是左侧面板，却放在屏幕最右边。

## What Changes

- **BREAKING（界面）**：删除桌面右侧图标栏（`RightPanelRail`）。助手面板关闭时右侧不再占任何宽度。
- 桌面 header 新增「月詠」助手按钮，点击打开 / 关闭助手面板；面板打开后仍停靠在右侧、挤窄阅读区、可拖动调宽，与现在展开时的行为一致。导入页的助手面板仍固定显示。
- 向量化并入任务中心：任务中心 popup 在「其他 AI 活动」上方新增「后台 · 向量化」区，显示全局嵌入队列进度、正在处理的书与类型、暂停 / 继续、模型升级后的旧向量重建提示；在书籍页额外显示本书章节与记忆的嵌入进度和「补齐缺失」，低频操作（重建本书章节向量、测试查询、嵌入设置）收进「⋯」菜单。本地嵌入关闭时整个区不出现。
- 只有向量化在运行时，任务中心 chip 显示活动指示，不计入章节任务数量与进度条。
- **BREAKING（界面）**：删除向量化抽屉面板及其三个入口按钮（桌面右侧栏、平板书籍详情页图标栏、手机顶部信息条）；模型后端（WebGPU / WASM）与模型版本状态只在设置 → 嵌入中显示。
- **BREAKING（界面）**：删除平板书库页与书籍详情页的右侧竖栏（`TabletSideRail`、`BooksTabletSideRail`）。内容区延伸到窗口右边缘。
- 平板顶部信息条新增「月詠」助手按钮（与桌面同位置、同一套开关逻辑），平板所有页面都能打开助手。
- 平板书库页的书籍列表开关、书籍详情页的目录开关移到平板顶部信息条最左侧：顶部栏只提供一个空的挂载点，按钮由页面自己 Teleport 进去，开关状态仍归页面 composable，只在这两个页面出现。
- 手机底部 Tab 栏的助手入口保持不变；平板左侧导航栏不加助手入口。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `desktop-shell-chrome`: 桌面工作台骨架不再常驻右侧面板容器——只在助手打开（或导入页）时出现；助手入口改为顶部系统条一跳可达。
- `chapter-embedding-search`: 「Batch embeddings popup UI」改为任务中心的后台向量化区，保留两类进度、补齐缺失、重建章节的行为，补充非书籍页、关闭本地嵌入、旧向量提示与暂停 / 继续。
- `header-task-center`（由 `translation-task-queue` 引入）：新增后台向量化区与向量化活动在 chip 上的表现。
- `tablet-shell-chrome`: 顶部实用信息条新增「月詠」助手按钮与页面开关挂载点；修正左侧导航栏与顶部信息条中已与代码不符的描述（导航栏不含助手、信息条不含帮助按钮）。
- `tablet-page-layouts`: 书库页与书籍详情页的左侧面板开关改在顶部信息条，页面不再渲染右侧竖栏。

## Impact

- **依赖**：必须在 `translation-task-queue` 之后实现与归档（复用其任务中心、chip 与 `header-task-center` 能力）。
- **界面**：`AppHeader`（新增助手按钮）、`MainLayoutDesktop`、`AppRightPanel` / `AppRightPanelDesktop`（去掉折叠态分支）、删除 `RightPanelRail`；`TabletSysBar`（新增助手按钮与页面开关挂载点）、`BooksPageTablet` / `BookDetailsTablet`（开关改为 Teleport 到顶部栏），删除 `TabletSideRail`、`BooksTabletSideRail`、`useTabletRightRail` 与不再使用的 `rail-base.css`；`MobileSysBar` 去掉向量按钮；任务中心各变体新增后台区；删除 `BatchEmbeddingsPanel`、`BatchEmbeddingsButton`，`BatchEmbeddingsStaleBanner` / `BatchEmbeddingsActiveTask` 等子组件视情况复用或改造；`BatchEmbeddingsBackendStatus` 的内容并入 `EmbeddingSettingsTab`。
- **状态**：删除 `ui.batchEmbeddingsPanelOpen` 与 `useBatchEmbeddingsPanel`；向量统计与操作逻辑抽到任务中心使用的 composable。
- **测试**：`batch-embedding-stats.test.ts`（直接挂载 `BatchEmbeddingsPanel`）、`main-layout-route-outlet.test.ts`（引用 `BatchEmbeddingsButton`）需改写。
- **文案与文档**：三套 i18n；帮助文档中提到右侧栏、平板右侧工具轨道、向量面板的段落同步更新。
