## Context

书籍级设置（5 个开关 + 分块大小）目前位于 `ChapterSettingsBody.vue` 的「全局设置」tab，通过章节工具栏齿轮弹窗（桌面 Popover / 手机 MobileBottomSheet，壳组件 `ChapterSettingsPopover.vue`）访问。侧栏 SETTINGS 菜单（`BookSidebarSettingsMenu.vue`）已有 术语/角色/记忆 三个路由面板入口，路由为 `/books/:id/settings/:setting(terms|characters|memory)`，由 `useBookDetailsPage` 的 `SettingMenu` 类型和 `settingsPanelComponent` 分派渲染。

模型系统只有 4 个任务键（`translation` / `proofreading`（校对润色合并）/ `termsTranslation` / `assistant`），全局默认存 `settings.taskDefaultModels`，经 `aiModelsStore.getDefaultModelForTask(task)` 消费。

用户已确认的决策：弹窗只留章节设置；模型覆盖跟随现有 2 键；不做术语翻译覆盖；手机底部抽屉保留全局 tab。

## Goals / Non-Goals

**Goals:**

- 书籍级设置提升为侧栏一等入口「翻译设置」（桌面/平板路由面板）。
- 本书可覆盖 翻译 / 校对·润色 模型，未设置或失效时回退全局默认。
- 齿轮弹窗（桌面/平板）瘦身为纯章节指令；手机端不失能。
- 数据向后兼容，同步链路零改动。

**Non-Goals:**

- 不拆分 polish 独立模型键；不做 termsTranslation / assistant / explain 覆盖。
- 不做章节级模型覆盖。
- 不自动清理失效的覆盖 ID。
- 不重新设计表单的保存语义（维持显式 保存/取消）。

## Decisions

### D1: 覆盖数据存在 `Novel.taskModelOverrides`，而非全局 settings 的 per-book 映射

`taskModelOverrides?: { translation?: string | null; proofreading?: string | null }` 直接挂在 Novel 上。novel 条目整书序列化进 Gist manifest 同步，新字段自动随书同步、随书删除，无需动 `sync-data-service`。备选方案（settings 里存 `bookModelOverrides: Record<bookId, …>`）会引入孤儿数据清理和 settings/novel 两条同步链路的耦合，弃用。

### D2: 解析逻辑做成 `aiModelsStore.getModelForTask(task, book?)` 新 getter，不改 `getDefaultModelForTask`

新 getter 内部先查 book 覆盖（须指向**已启用**模型），未命中再委托现有 `getDefaultModelForTask`。保持旧 getter 签名不变，未传 book 的调用点（termsTranslation、assistant 等）行为零变化；5 个有 book 上下文的消费点显式换用新 getter。失效覆盖（模型被删/禁用）**静默回退**而非报错——运行时不打断任务，UI 下拉负责暴露失效态让用户重选。

### D3: 共享表单组件 + 两个壳，保存语义统一为「emit payload、壳负责落库」

新建 `BookTranslationSettingsForm.vue`（5 开关 + 分块 + 模型覆盖两下拉），props 接 `book`、emit `save` payload，不直接写库。桌面路由面板 `BookTranslationSettingsPanel.vue` 与手机底部抽屉全局 tab 共用该表单，避免两处实现漂移。备选方案（面板改即时保存、抽屉保留显式保存）会让同一表单出现两种保存心智，弃用。

### D4: 弹窗瘦身用 `showGlobalTab` prop 控制，而非拆组件

`ChapterSettingsBody` 加 `showGlobalTab: boolean` prop：桌面 Popover 传 `false`（只渲染章节指令，无主 tab），手机抽屉传 `true`（保留双 tab，全局 tab 内容替换为共享表单）。备选方案（为桌面单独建纯章节组件）会复制章节指令三 tab 模板，违反 DRY，弃用。

### D5: 桌面弹窗保存链路不得触碰书籍级字段

现有 `buildNovelSettingsUpdate` 对缺省字段写默认值（`?? true` / `?? false`），若桌面弹窗只提交章节指令而保存链路仍全量写书籍字段，会把用户的书籍级设置静默重置。改为：payload 未携带书籍级字段时跳过 `buildNovelSettingsUpdate`（或按字段存在性构造 partial update），并以回归测试锁定。

### D6: 模型覆盖下拉的选项语义

选项 = 「跟随全局默认（当前：<模型名>）」+ 全部已启用模型。覆盖指向失效模型时下拉显示失效占位（不自动改数据），用户重选后才写入。value 语义：`null`/缺省 = 跟随全局，字符串 = 模型 ID。

## Risks / Trade-offs

- [手机 `/settings/translation` 深链无对应分段标签] → 视同未选设置菜单，落 Overview 默认标签，不新增手机导航态。
- [桌面弹窗瘦身后误清书籍级字段（D5 风险）] → TDD：先写「仅章节指令保存不改书籍字段」的失败回归测试再改实现。
- [静默回退可能让用户没意识到覆盖已失效] → 面板下拉显示失效态；运行时不弹错，维持任务不中断优先。
- [`ChapterSettingsBody` 同时被桌面/手机消费，改动回归面大] → 共享表单抽离后 body 只剩章节指令 + tab 壳，变更面收敛；lint/type-check/quality-check 全跑。

## Migration Plan

纯前端增量变更，无部署/回滚特殊步骤。旧数据（无 `taskModelOverrides`）行为与现状一致；同步端旧客户端读到新字段会原样保留（整书 JSON 透传）。

## Open Questions

无 —— 关键决策已在 brainstorm 阶段由用户确认。
