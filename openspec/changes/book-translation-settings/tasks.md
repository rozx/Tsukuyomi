## 1. 数据模型与模型解析（TDD）

- [x] 1.1 先写失败测试：`getModelForTask` 解析规则（新测试文件 `src/__tests__/ai-models-task-override.test.ts`）——覆盖命中已启用模型 / 覆盖模型被禁用 / 覆盖模型不存在 / 覆盖为 null / 未传 book / 全局默认也缺失 → undefined
- [x] 1.2 `src/models/novel.ts`：`Novel` 新增可选字段 `taskModelOverrides?: { translation?: string | null; proofreading?: string | null }`（含中文 JSDoc）
- [x] 1.3 `src/stores/ai-models.ts`：实现 getter `getModelForTask(task, book?)`，按 设计 D2 解析（覆盖须已启用，失效静默回退 `getDefaultModelForTask`），跑 1.1 测试转绿
- [x] 1.4 提交（模型层）

## 2. 模型消费点接入

- [x] 2.1 `src/composables/book-details/useChapterTranslation.ts` 三处换用 `getModelForTask(task, book.value)`：段落润色/校对前置校验（~L724，`modelTaskKey`）、整章翻译 `prepareTranslationRun`（~L752）、整章校对 `prepareBulkChapterTask`（~L1421）
- [x] 2.2 `src/composables/book-details/useBookDetailsPage.ts` ~L1018：`mobileReaderModelName` 换用 `getModelForTask('translation', book.value)`
- [x] 2.3 `src/services/ai/tools/paragraph-tools.ts` ~L758：`resolveModelIdForAddTranslation` 兜底解析接入本书覆盖（book 从工具上下文取）
- [x] 2.4 确认 termsTranslation / assistant 调用点未受影响（不改动），提交（消费点）

## 3. 保存链路防误清（TDD）

- [x] 3.1 先写失败回归测试：payload 仅含章节指令（无书籍级字段）时 `handleSaveChapterSettings` MUST NOT 改写 `preserveIndents` / `taskModelOverrides` 等书籍级字段；payload 含 `taskModelOverrides` 时正确落库
- [x] 3.2 改造 `useBookDetailsPage.ts` 保存链路：`buildNovelSettingsUpdate` 按字段存在性构造 partial update（设计 D5），payload 类型增加 `taskModelOverrides`，跑 3.1 转绿
- [x] 3.3 提交（保存链路）

## 4. 共享表单与面板 UI

- [ ] 4.1 新建 `src/components/novel/BookTranslationSettingsForm.vue`：5 开关 + 分块大小 + 「模型覆盖」分组（两个下拉：跟随全局默认（当前：<模型名>）+ 已启用模型；失效覆盖显示失效占位不改数据）；props 接 `book`，emit `save` payload / `close`
- [ ] 4.2 新建 `src/components/novel/BookTranslationSettingsPanel.vue`：路由面板壳（滚动容器 + 共享表单），保存走 `booksStore.updateBook` + 成功 toast
- [ ] 4.3 `ChapterSettingsBody.vue`：加 `showGlobalTab` prop；`false` 时只渲染章节指令（无主 tab，标题「章节设置」）；`true` 时全局 tab 内容替换为共享表单
- [ ] 4.4 `ChapterSettingsPopover.vue`：桌面 Popover 传 `showGlobalTab=false`，手机 MobileBottomSheet 传 `true`；桌面弹窗标题/eyebrow 改「章节设置」
- [ ] 4.5 提交（表单与弹窗）

## 5. 路由与侧栏导航

- [ ] 5.1 `src/router/routes.ts`：setting 参数 regex 改为 `(terms|characters|memory|translation)`
- [ ] 5.2 `useBookDetailsPage.ts`：`SettingMenu` 加 `'translation'`；`settingMenuFromRoute` 识别 translation；新增 `navigateToTranslationSetting`（仿 navigateToTermsSetting）；手机 `mobileActiveTab` 对 translation 落回 `'chapters'` 默认
- [ ] 5.3 `BookSidebarSettingsMenu.vue`：展开/折叠两态各加「翻译设置」项（icon `pi pi-sliders-h`，置于术语设置之上）
- [ ] 5.4 `BookDetailsDesktop.vue`：`settingContextMeta` 加 `{ eyebrow: 'Translation', label: '翻译设置', icon: 'pi pi-sliders-h' }`；`settingsPanelComponent` 加 case 渲染 `BookTranslationSettingsPanel`
- [ ] 5.5 提交（路由与导航）

## 6. 验证与收尾

- [ ] 6.1 `bun run lint && bun run type-check && bun run quality-check` 全绿
- [ ] 6.2 `bunx vitest run` 全量测试通过
- [ ] 6.3 浏览器端验证（preview）：桌面侧栏入口进面板改模型覆盖并保存；齿轮弹窗只剩章节设置；仅存章节指令不动书籍字段；手机断点抽屉双 tab 含模型覆盖；手机深链 `/settings/translation` 落 Overview
- [ ] 6.4 提交（收尾），openspec 验证 `openspec status --change book-translation-settings`
