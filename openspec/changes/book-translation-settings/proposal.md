## Why

书籍级「全局设置」目前藏在章节工具栏齿轮弹窗里，与章节级指令混在同一个弹窗中，入口隐蔽且职责不清；同时用户无法为单本书指定专用的翻译/校对模型（只能全局一套默认），多书并行、风格差异大的场景下频繁手动切换全局默认模型。

## What Changes

- 侧栏 SETTINGS 菜单新增「翻译设置」一等入口（与 术语设置 / 角色设置 / 记忆管理 同级），走路由面板 `/books/:id/settings/translation`，承载全部书籍级设置。
- 新增**本书模型覆盖**：每本书可单独指定 翻译模型 与 校对·润色模型（跟随现有 2 键粒度：`translation` / `proofreading`），未设置时回退全局默认；覆盖指向已删除/禁用模型时静默回退。
- 齿轮弹窗瘦身（桌面/平板）：只保留章节级指令设置，标题改「章节设置」；手机端底部抽屉保留「全局设置+章节设置」两 tab 不失能，全局 tab 复用共享表单（自动获得模型覆盖）。
- `Novel` 模型新增可选字段 `taskModelOverrides`，随 novel 条目整书同步，向后兼容。
- 不做：术语翻译/助手模型覆盖、polish 独立模型键、章节级模型覆盖、失效覆盖 ID 自动清理。

## Capabilities

### New Capabilities

- `book-translation-settings-panel`: 书籍级翻译设置的入口与呈现 —— 侧栏「翻译设置」菜单项、路由面板（桌面/平板）、齿轮弹窗瘦身为纯章节设置、手机端底部抽屉保留双 tab、共享表单组件与显式保存语义。
- `book-task-model-override`: 本书任务模型覆盖 —— `Novel.taskModelOverrides` 数据结构、`getModelForTask(task, book)` 解析与回退规则、5 个模型消费点接入、覆盖下拉 UI（含「跟随全局默认」与失效态）。

### Modified Capabilities

- `original-text-validation-toggle`: 场景中「原文校验」开关的 UI 位置由「翻译设置弹窗的全局设置标签页」改为「书籍翻译设置面板（桌面/平板侧栏入口；手机端底部抽屉全局 tab）」，开关行为本身不变。
- `ai-ask-user-tool`: 「跳过 AI 追问」开关的 UI 设置入口位置同上迁移，开关行为本身不变。

## Impact

- **数据模型**: `src/models/novel.ts`（`Novel.taskModelOverrides` 可选字段，同步免改）
- **状态/解析**: `src/stores/ai-models.ts`（新增 `getModelForTask` getter）
- **模型消费点**（5 处）: `useChapterTranslation.ts`（3 处）、`useBookDetailsPage.ts`（手机阅读器模型名显示）、`services/ai/tools/paragraph-tools.ts`（`add_translation` 兜底）
- **UI**: 新组件 `BookTranslationSettingsForm.vue` / `BookTranslationSettingsPanel.vue`；改 `BookSidebarSettingsMenu.vue`、`BookDetailsDesktop.vue`、`ChapterSettingsBody.vue`、`ChapterSettingsPopover.vue`
- **路由/导航**: `router/routes.ts` setting 参数 regex 增加 `translation`；`useBookDetailsPage.ts`（`SettingMenu` 类型、`navigateToTranslationSetting`、路由映射、保存链路 `buildNovelSettingsUpdate`）
