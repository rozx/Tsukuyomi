# 书籍翻译设置面板 + 本书模型覆盖 · 设计文档

日期：2026-07-09
状态：已确认（用户批准）

## 背景与目标

书籍级「全局设置」目前藏在章节工具栏的齿轮弹窗里（`ChapterSettingsBody` 的「全局设置」tab），与章节级指令混在同一个弹窗中。目标：

1. 把书籍级设置提升为侧栏 SETTINGS 菜单的一等入口「翻译设置」，与 术语设置 / 角色设置 / 记忆管理 同级（路由面板）。
2. 新增**本书模型覆盖**：允许每本书单独指定 翻译模型 与 校对·润色模型，覆盖全局默认。
3. 齿轮弹窗瘦身为纯章节级设置（桌面/平板）；手机端底部抽屉保留两 tab 不失能。

### 已确认的决策

| 决策点 | 结论 |
|---|---|
| 齿轮弹窗去留 | 桌面/平板只留章节设置；书籍级设置全部移到侧栏新面板 |
| 模型覆盖粒度 | 跟随现有 2 键：`translation` + `proofreading`（校对与润色共用，与全局一致） |
| 术语翻译模型覆盖 | 不做 |
| 手机端入口 | 底部抽屉保留「全局设置+章节设置」两 tab，全局 tab 复用共享表单 |

## 1. 数据模型（`src/models/novel.ts`）

`Novel` 新增可选字段：

```ts
/** 本书任务模型覆盖：值为模型 ID；undefined/null = 跟随全局默认 */
taskModelOverrides?: {
  translation?: string | null;
  proofreading?: string | null;
};
```

- 向后兼容：可选字段，旧数据无此字段时行为与现状完全一致。
- 同步免改：novel 条目整书序列化进 Gist，manifest SHA-256 哈希自然感知变化。

## 2. 模型解析（`src/stores/ai-models.ts`）

新增 getter：

```ts
getModelForTask(task: keyof AIModel['isDefault'], book?: Novel | null): AIModel | undefined
```

解析顺序：

1. `book?.taskModelOverrides?.[task]` 存在且指向**已启用**的模型 → 返回该模型。
2. 覆盖指向已删除/已禁用的模型 → **静默回退**全局默认（不报错、不自动清理字段；UI 下拉中会显示为无效并可重选）。
3. 无覆盖或无 book → 走现有 `getDefaultModelForTask(task)`（settings.taskDefaultModels → 模型 isDefault 兜底）。

### 受影响调用点（5 处，均有 book 上下文且任务为 translation/proofreading）

| 位置 | 用途 |
|---|---|
| `src/composables/book-details/useChapterTranslation.ts:724` | 段落润色/校对前置校验（`modelTaskKey`） |
| `src/composables/book-details/useChapterTranslation.ts:752` | 整章翻译 `prepareTranslationRun` |
| `src/composables/book-details/useChapterTranslation.ts:1421` | 整章校对 |
| `src/composables/book-details/useBookDetailsPage.ts:1018` | 手机阅读器顶栏模型名显示（改为反映本书覆盖） |
| `src/services/ai/tools/paragraph-tools.ts:758` | `add_translation` 工具兜底模型解析 |

**不动**：`termsTranslation`（useTermTranslation）、`assistant`（useRightPanel）、explain 任务。

## 3. UI 结构

### 3.1 共享表单 `src/components/novel/BookTranslationSettingsForm.vue`

内容 = 现有全局 tab 的 5 个开关（过滤行首空格 / 显示时规范化符号 / 显示时规范化标题 / 跳过 AI 追问 / 原文校验）+ 分块大小，**再加**「模型覆盖」分组：

- 两个下拉：翻译模型、校对·润色模型。
- 选项 = 「跟随全局默认（当前：<模型名>）」+ 所有已启用模型。
- 覆盖指向的模型已失效时，下拉显示无效态并可重选。

表单不直接写库：props 接 `book`，emit `save` payload（现有 payload 增加 `taskModelOverrides`），保存语义维持显式 保存/取消。

### 3.2 桌面/平板：侧栏入口 + 路由面板

- `SettingMenu` 类型加 `'translation'`；路由 regex 变为 `books/:id/settings/:setting(terms|characters|memory|translation)`。
- `useBookDetailsPage`：新增 `navigateToTranslationSetting`，`settingMenuFromRoute` 等映射同步扩展。
- `BookSidebarSettingsMenu.vue`：展开、折叠两态各加「翻译设置」项（icon `pi pi-sliders-h`），置于术语设置之上。
- `BookDetailsDesktop.vue`：`settingContextMeta` 与 `settingsPanelComponent` 加 `'translation'` case，渲染新面板 `BookTranslationSettingsPanel.vue`（滚动容器 + 共享表单；保存走现有 `booksStore.updateBook`，成功 toast 与现有面板一致）。

### 3.3 齿轮弹窗瘦身

- `ChapterSettingsBody` 加 `showGlobalTab: boolean` prop：
  - 桌面 Popover（`ChapterSettingsPopover`）传 `false` → 只渲染章节指令区（无主 tab），标题改「章节设置」。
  - 手机 MobileBottomSheet 传 `true` → 保留两 tab，全局 tab 内容替换为共享表单（自动获得模型覆盖）。
- 保存链路 `handleSaveChapterSettings` / `buildNovelSettingsUpdate` 扩展 `taskModelOverrides`；桌面弹窗只保存章节指令时不得误改书籍级字段（payload 缺省字段不写入）。

## 4. 错误处理

- 覆盖模型失效：运行时静默回退全局，UI 显示无效态；不弹错误。
- 无任何可用模型：维持现有 toast 报错路径不变。
- 手机端路由直达 `/settings/translation`（边缘情况）：手机分段标签无对应项，视同未选中设置菜单，落到 Overview 默认标签；不新增手机导航态。

## 5. 测试计划（TDD 先行）

1. `getModelForTask`（新测试文件，services 级）：
   - 覆盖命中已启用模型 → 返回覆盖模型
   - 覆盖模型被禁用 / 不存在 / 为 null / 无 book → 回退全局默认
   - 全局默认也缺失 → undefined（沿用现状）
2. 保存链路：`buildNovelSettingsUpdate` 携带 `taskModelOverrides` 且缺省时不误清其他字段；桌面「仅章节指令」保存不改书籍级字段。
3. 回归：`handleSaveChapterSettings` 现有行为（全局+章节合并保存、toast 文案）。

纯模板变动（侧栏菜单项、面板壳）按项目约定不强制测试。

## 6. 明确不做（YAGNI）

- 不拆分 polish 独立模型键。
- 不做 termsTranslation / assistant 覆盖。
- 不做章节级模型覆盖。
- 不自动清理失效的覆盖 ID。
