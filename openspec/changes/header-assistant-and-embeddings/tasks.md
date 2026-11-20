> 前置条件：`translation-task-queue` 已在同一功能分支上实现完成。运行时逻辑（`composables/` / `stores/`）一律先写失败测试再实现（见 CLAUDE.md「TDD 是默认工作流」）。每组完成后跑 `bun run lint && bun run type-check`。

## 1. 去掉桌面右侧图标栏

- [ ] 1.1 先写测试：助手面板关闭时，`ui.assistantInputMessage` 被写入后会打开面板并保留消息（覆盖面板关闭状态，当前 watcher 挂在 `AppRightPanelDesktop` 上，面板关闭后将不再挂载）；把该 watcher 移到 `MainLayoutDesktop`（不放进共享壳层，平板 / 手机已由常驻的助手面板处理），测试通过
- [ ] 1.2 `MainLayoutDesktop` 右侧容器保留，关闭时宽度为 0 并沿用现有宽度过渡，宽度为 0 时不渲染面板内容与拖动手柄；`AppRightPanel` / `AppRightPanelDesktop` 删除 `collapsed` 分支；删除 `RightPanelRail.vue`；`bun run type-check` 通过
- [ ] 1.3 改写 `main-layout-route-outlet.test.ts` 中对 `BatchEmbeddingsButton` 与折叠栏的依赖，`bunx vitest run main-layout-route-outlet` 通过

## 2. header 助手按钮

- [ ] 2.1 `AppHeader` 在任务中心 chip 与同步 chip 之间加「月詠」按钮，点击调用 `useMainNavDispatch().dispatch('chat')`，面板打开时为激活态，导入页显示激活态并拦掉点击（`dispatch('chat')` 不认导入路由，直接调用会把 `rightPanelOpen` 切成 false）；补组件测试覆盖开 / 关与导入页
- [ ] 2.2 给 `.dsk-sysbar` 加容器查询，宽度不足时依次隐藏品牌副标题、同步倒计时、各 chip 文字（任务中心保留数字）；浏览器把窗口缩到约 800px，确认 header 不溢出、所有按钮可点
- [ ] 2.3 浏览器验证（桌面）：关闭时阅读区延伸到右边缘、打开时停靠并挤窄阅读区、拖宽仍有效、导入页常驻、段落「复制到助手」与「解释选中」在面板关闭时能打开面板并填入内容

## 3. 任务中心后台向量化区

- [ ] 3.1 先写测试：`useEmbeddingBackground` 吸收 `BatchEmbeddingsPanel` 的统计逻辑——本书章节 / 记忆的已嵌入与总数、旧向量计数、队列待处理数与 ETA、当前处理任务及是否为其他书（含运行期间保留最后任务的防闪烁逻辑）、同步闸门状态；初始状态由 `EmbeddingQueue.getProgress()` 同步读取；把 `batch-embedding-stats.test.ts` 的断言迁到该 composable 上；实现并通过
- [ ] 3.2 先写测试：统计只在任务中心可见且后台区展开时按原节流策略刷新，折叠或关闭时不刷新；队列进度事件始终更新轻量计数；实现并通过
- [ ] 3.3 先写测试：补齐缺失（章节 + 记忆）、重建本书章节向量、重建旧向量、暂停 / 继续只作用于嵌入队列；非书籍路由时不计算本书统计；本地嵌入关闭时区不可用；实现并通过
- [ ] 3.4 先写测试：`useTaskCenter` 的 chip 状态把「嵌入队列有活动且既未暂停也未被同步挂起」视为后台活动——无章节任务时显示活动指示，不计入运行数 / 排队数 / 进度条，暂停或同步挂起时视为空闲，任务中心从未打开过也能正确显示；实现并通过
- [ ] 3.5 实现 `TaskCenterEmbeddingSection.vue` fragment（区头、队列行、旧向量提示、本书两条进度与「补齐缺失」、「⋯」菜单、非书籍页提示），挂进任务中心 Desktop / Mobile 变体与固定面板；折叠状态存 `ui` store；浏览器分别在书籍页与非书籍页验证
- [ ] 3.6 `BatchEmbeddingsTestQueryDialog` 改挂到 `MainLayout` dispatcher，由「⋯」菜单打开；浏览器验证测试查询可用

## 4. 删除旧向量面板与入口

- [ ] 4.1 删除 `BatchEmbeddingsPanel.vue`、`BatchEmbeddingsButton.vue`、`useBatchEmbeddingsPanel.ts`、`ui.batchEmbeddingsPanelOpen` 及 `MainLayout` 中的挂载；`BatchEmbeddingsDisabledNotice` 不再使用则删除，`BatchEmbeddingsStaleBanner` / `BatchEmbeddingsActiveTask` 被 fragment 复用或删除
- [ ] 4.2 去掉 `BookDetailsTablet.vue` 页内图标栏与 `MobileSysBar.vue` 中的向量按钮；平板、手机浏览器验证向量化从任务中心进入
- [ ] 4.3 把 `BatchEmbeddingsBackendStatus` 显示的后端（WebGPU / WASM）与模型 / 章节模型版本并入 `EmbeddingSettingsTab` 的模型分组，然后删除该组件；`bunx vitest run embedding-download-ui` 仍通过（该测试按状态断言设置页里有无进度条，新增内容不能带进度条）；浏览器验证设置页显示正确
- [ ] 4.4 `bun run lint && bun run type-check && bun run quality-check` 通过，且没有新增未使用的导出或组件

## 5. 文案与文档

- [ ] 5.1 新增与删除的界面文案同步 zh-CN / zh-TW / en-US（助手按钮、后台区、「⋯」菜单项、非书籍页提示），删除不再使用的向量面板文案；`bun run type-check` 通过
- [ ] 5.2 更新 `public/help/<locale>/` 中提到右侧栏或向量面板的帮助文档（先 `grep -rl "向量\|右侧" public/help/zh-CN` 确认范围），以 zh-CN 为源同步 zh-TW / en-US，`{#id}` 锚点一致

## 6. 整体验证

- [ ] 6.1 运行 `bun run test`，全部通过
- [ ] 6.2 运行 `bun run test:coverage` 后执行 `bun run lint && bun run type-check && bun run quality-check`，全部通过
- [ ] 6.3 浏览器三种断点走一遍：桌面无右侧栏、header 助手开关；任务中心后台区在书籍页 / 非书籍页的内容；关闭本地嵌入后后台区消失；只有向量化运行时 chip 显示活动指示
