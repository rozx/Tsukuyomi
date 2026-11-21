## Context

动机见 proposal.md「Why」，行为契约见 `specs/desktop-corner-pet/spec.md`。与实现相关的现状：

- **数据都已在前端**：章节任务（翻译 / 润色 / 校对，经任务队列执行）、助手、术语翻译、单段任务都把流式内容写进 `ai-processing` store 的任务记录：`thinkingMessage`（思考，内含 `[调用工具: …]`、工具结果、状态切换、输出模式等标记）与 `outputContent`。任务中心的详情视图已用 `useThinkingFormatter`（`src/composables/useThinkingFormatter.ts`）把 `thinkingMessage` 增量解析成 `tool-call / tool-result / content / state-transition` 片段，并带节流。
- **任务中心**（`useTaskCenter`）已有：分组后的队列行（运行中行通过 `aiTaskIds` 最后一个关联到 `ai-processing` 任务）、chip 的 `finished` 状态与 `acknowledge()`（打开任务中心即确认）、`isOpen` 与固定面板是否在屏幕上（`setPinnedPanelShown`，由桌面 / 平板任务中心上报）。
- **助手面板**：桌面端是否打开看 `ui.rightPanelOpen`（且 `activeRightTab === 'chat'`）；导入路由下右侧固定显示的是导入对话，不是普通助手。
- **头像**：`AssistantAvatar`（`/icons/android-chrome-192x192.png`）。
- **正在阅读的章节**：书籍详情路由 `/books/:id` + `bookDetails.getSelectedChapter(bookId)`。
- **桌面外壳**：`MainLayoutDesktop` 的 `.desktop-shell-body` 是 `position: relative` 的横向 flex，右侧助手容器宽度为 `rightPanelWidth`（打开时）或 0；底部是 `AppFooter`。

## Goals / Non-Goals

**Goals:**

- 只读现有任务数据推导桌宠状态，不改任务执行流程、不加 AI 调用。
- 流式更新时界面不卡、不闪：解析增量、渲染节流。
- 跟随、让位、小结规则写成纯函数，便于单测。

**Non-Goals:**

- AI 导入任务（导入有独立的对话与预览，见 `ai-import-workspace`）。
- 术语翻译、单段润色 / 校对等「其他 AI 活动」：生命周期短，不参与跟随（仍在任务中心「其他 AI 活动」里）。
- 操作系统级悬浮窗、拖动改位置、新角色素材与逐帧动画。
- 助手 `ask_user` 等待回答：已有全局对话框弹出，桌宠不重复提示。

## Decisions

### D1 只挂在桌面布局，不做三变体

桌宠是桌面专属的外壳元素，直接由 `MainLayoutDesktop` 挂载；平板 / 手机布局不引用它，因此不需要 dispatcher + Desktop/Tablet/Mobile 结构（CLAUDE.md 的变体规则针对三端呈现不同的页面与组件，这里只有一端）。Electron 永远是桌面变体，自然覆盖。

定位：在 `.desktop-shell-body` 内绝对定位，固定 `right: 16px; bottom: 16px`（body 已在 footer 之上，不会压住 footer）。层级低于任务中心弹出层、固定面板与对话框，高于页面内容。

显示：右侧已经有月詠时桌宠整体隐藏——助手面板打开（`ui.rightPanelOpen && activeRightTab === 'chat'`），或处于导入路由（右侧常驻导入对话，导入页底部还有贴底的步骤主按钮）。这样不必跟着面板宽度移动，也不会和导入页的主按钮重叠。最初的方案是让桌宠贴在助手面板左侧随面板开合移动，但面板打开时月詠会同时出现两处，且导入页需要额外抬高，改为隐藏。

替代方案：`position: fixed` 挂在 `MainLayout` dispatcher——需要自己判断设备变体与助手宽度，且会盖住 footer，否决。

### D2 状态推导：`useDeskPet` + 纯函数

新 composable `src/composables/desk-pet/useDeskPet.ts`，由桌宠组件调用（只在桌面布局存在，无需 provide/inject）。组件拆成 `DeskPet`（编排）+ `DeskPetAvatar` / `DeskPetSummary` / `DeskPetTaskBubble`，控制模板复杂度。它组合：

- `injectTaskCenter()`：运行中队列行、`isOpen` / 固定面板可见、`chip`（finished）、`acknowledge()`、`openDetail()`。
- `useAIProcessingStore()`：助手任务（`type === 'assistant'`）及章节行关联的任务记录。
- `ui` store：助手面板是否打开、气泡收起 / 展开。
- 路由 + `bookDetails`：正在阅读的章节。

规则拆成 `desk-pet-state.ts` 中的纯函数：

- `pickCandidates({ queueRows, assistantTask, taskCenterVisible, assistantPanelOpen })` → 可跟随任务列表（已按优先级排序：助手 > 正在阅读的章节 > 其他章节）。任务中心可见时剔除章节任务，助手面板打开时剔除助手。
- `nextFollowed(current, candidates, manualId)` → 当前跟随的任务：当前任务仍在候选里就保持（跟随直到结束）；手动选择优先；否则取候选第一个。
- `petMood({ candidates, summary })` → `running | review | idle`。

### D3 气泡内容：复用 `useThinkingFormatter`

对当前跟随的任务调用 `useThinkingFormatter(ref([task]))` 取增量解析的片段（与任务中心详情同一套解析与节流）。从片段推出气泡条目：

- `tool-call` → 「工具」：工具名先映射到用途分组（记忆、章节、术语、人物、原文、译文写回、待办等），台词查 i18n `deskPetUi.tools.<分组>`，未收录的工具用 `deskPetUi.tools.fallback`（含 `{tool}`）；小字为工具名 + 执行状态（解析器已把 `tool-result` 的结果状态回填到对应的 `tool-call` 片段）。
- `content`（思考模式）→ 「思考」：取末尾一行，超长保留结尾。
- `content`（`mode: 'output'`）或 `outputContent` → 「输出」：同样取末尾。
- `state-transition`、`chunk-separator` 不单独成条。

收起时显示最后一条；展开时显示最近 8 条。标题行：章节任务为章节标题 + `itemProgress`（x / y 段），助手为「助手」。节流沿用 `useThinkingFormatter` 自带的 200ms 增量解析节流，不另加一层。

替代方案：自己从 `thinkingMessage` 正则抽取——与任务中心的解析会漂移，否决。

### D4 工具台词放 i18n，按语言区分口吻

`deskPetUi.tools.*` 在 zh-CN / zh-TW 用月詠口吻（「月詠翻一翻记忆……」「月詠去前面的章节找找……」），en-US 用中性表达（"Searching memories…"），与 `ai-assistant-persona` 的「英文不角色化」一致。先覆盖翻译与助手最常用的工具（记忆、章节查询、术语、角色、段落读取、翻译写回、待办），其余走通用台词。`bun run check:i18n` 保证三语 key 一致。

### D5 小结与确认复用任务中心

- 章节任务的小结直接用任务中心 chip 的 `finished` 状态（确认时间之后结束的项及完成 / 失败数）：打开任务中心本来就会 `acknowledge()`，桌宠「关闭小结」也调用同一个 `acknowledge()`，两处提示一起清除，不另存一份「已看」状态。
- 助手小结：记录「最近一次结束、且结束时助手面板收起」的助手任务 id；打开助手面板或关闭小结时清除（只存在内存里，刷新后不再提示）。

### D6 设置与持久化

- `AppSettings.showDeskPet?: boolean`（缺省视为 true），设置 → 通用设置新增开关；`copyOptionalAppSettingsFields` 透传，保证导入导出与同步不丢。
- `ui` store 新增 `deskPetBubbleExpanded`（默认收起），与任务中心的 UI 状态一样存 localStorage。
- 手动选择的任务 id 只存内存。

### D7 点击行为

- 点头像（任何状态）：打开右侧助手面板并切到月詠对话，桌宠随之隐藏。桌宠就是月詠本人，点它就是叫月詠。
- 气泡的收起 / 展开只由气泡右上角的箭头按钮切换。
- 小结状态点气泡：章节任务打开任务中心并打开该任务详情，助手打开助手面板。
- 展开气泡里的「打开任务中心」：调用任务中心已注册的 opener，以顶部栏任务 chip 为锚点（桌宠按钮可能随即卸载），并把这次点击事件传给弹出层，避免被当成「点外侧关闭」。

### D8 动效与减少动态效果

全部用 CSS 动画，分两层避免 `transform` 互相覆盖：外圈 `.dpa-ring` 负责整体动作与光效（运行中呼吸 + 薄蓝光晕；完成后蓄力—跳起—落地回弹的蹦跳 + 绿色涟漪；失败摇头 + 红色涟漪，涟漪颜色用 `--dpa-ripple` 变量；空闲打瞌睡点头），头像 `.dpa-face` 负责运行中的左右轻摇；头像以 `:key="mood"` 在状态切换时重新挂载播放弹入，角标以结果为 key 在数字变化时弹一下，气泡用 `<Transition>` 从右下角缩放淡入淡出。鼠标悬停时按钮整体上移 2px。空闲时头像缓慢点头打盹，三个「z」用错开的负延迟依次飘起、放大、淡出；鼠标悬停 / 键盘聚焦时醒来（变亮、暂停点头、隐去 zzz），提示可以点击。`@media (prefers-reduced-motion: reduce)` 下关闭全部动画，zzz 静止显示，只保留颜色与角标。头像尺寸：运行中 / 待查看 56px，空闲 40px 且降低不透明度。

## Risks / Trade-offs

- [流式更新频繁导致重排卡顿] → 解析走 `useThinkingFormatter` 的增量路径；气泡渲染 200ms 节流；只解析当前跟随的一个任务。
- [桌宠挡住正文右下角内容（如阅读区最后一段、浮动按钮）] → 空闲时缩小变暗；有设置开关；收起态气泡只有一行。实现时在浏览器检查书籍详情页的阅读区与章节工具栏。
- [思考内容可能是英文或很长的推理] → 只显示末尾一行，并用弱化颜色；展开时也只保留最近 8 条。
- [任务中心 chip 与桌宠小结共用确认] → 关闭桌宠小结会同时清除 chip 的完成提示，这是有意的「一处查看，两处清除」；在帮助文档里说明。
- [导入路由右侧固定显示导入对话] → 导入页桌宠整体隐藏：右侧已有月詠导入对话，底部还有步骤主按钮，桌宠会重复且会挡住按钮。
- [助手面板打开时看不到章节任务转述] → 章节任务的进度仍在顶部栏任务 chip 与任务中心里；收起面板后桌宠立即恢复。
