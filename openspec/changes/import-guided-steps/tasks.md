## 1. 步骤规则（纯函数，先写测试）

- [x] 1.1 `import-steps.test.ts`：`importStepStates` 覆盖无来源、有来源未出方案（draft / running / paused / waiting_user / failed）、ready / applying / applied 的完成标记与当前一步；`importStepAction` 覆盖运行中为暂停、整理有章节为生成方案、中途暂停或有待执行调用时为继续、无来源禁用、`canContinue` 为假时禁用、`plan` 返回 null
- [x] 1.2 实现 `src/composables/import-page/import-steps.ts`（`STEP_SECTION`、`importStepStates`、`importStepAction`）
- [x] 1.3 `useImportPage` 增加 `landingSection`，`closeTask()` 回到任务列表，`leave()` 有历史时返回、否则回首页；`import-entry-points.test.ts` 覆盖落点、关闭任务与离开

## 2. 共用的三步界面

- [x] 2.1 `use-import-flow.test.ts`：旧分区映射到落点与步骤状态、主按钮文字（开始 / 继续整理 / 继续执行）、开始整理与生成方案的 `runAction` 调用 store 并切换分区
- [x] 2.2 实现 `useImportFlow`、`ImportStepBar`、`ImportStepFooter`（容器查询区分窄 / 宽布局）
- [x] 2.3 抽出 `ImportRunNotices`；`ImportRunBar` 去掉继续、暂停和来源数，只保留任务名、状态与章节进度
- [x] 2.4 `ImportSourcePanel` 增加 `list-first`，`ImportDraftPanel` 增加 `structure-first`（基本信息可折叠并显示书名与作者摘要）

## 3. 三端摆放

- [x] 3.1 `ImportTaskWorkspace`（桌面与平板）删除 PrimeVue Tabs，改为运行条 + 三步 + 正在查看的一步 + 底部主按钮；`chatPreview` 时在顶部显示月詠预览
- [x] 3.2 `ImportMobileTask`（手机）：返回 + 可改名的任务名、月詠预览、三步、正文、sticky 底部主按钮
- [x] 3.3 平板和手机导入页分为任务列表与任务两层（`ImportTaskList navigable`、页头返回）；手机首页「快速操作」与书库「+」菜单加入 AI 导入入口

## 4. 对话位置与月詠预览

- [x] 4.1 `import-assistant-preview.test.ts`：问题 / 错误 / 压缩 / 运行的优先级，运行中输出末行与空闲回复开头的截断，无回复与运行中无输出时的提示
- [x] 4.2 实现 `buildImportAssistantPreview` 与 `ImportAssistantPreview`（点击调用 `dispatch('chat')`）
- [x] 4.3 `MainLayoutTablet`：横屏停靠导入对话；竖屏在右侧滑入面板中渲染 `ImportChatPanel`（与停靠面板同底色）；切换导入路由时关闭面板
- [x] 4.4 `MainLayoutMobile`：导入路由下用 `ImportChatSheet` 底部抽屉；离开路由时关闭
- [x] 4.5 `import-chat-draft.test.ts`：面板卸载重挂后未发送输入仍在，切换任务不串；实现 `useImportChatPanel` 的按任务草稿

## 5. 文案、文档与验证

- [x] 5.1 i18n 三语新增 `importUi.flow.*`、`importUi.chat.preview*` 等，删除旧标签与运行条按钮文案；`import-page-ui-languages.test.ts` 覆盖三端变体
- [x] 5.2 帮助文档 `import-guide` 三语改为三步引导与按设备放置的对话
- [x] 5.3 同步 `header-assistant-and-embeddings`：平板顶部栏「月詠」按钮在导入路由竖屏下开关滑入对话，横屏仍拦截
- [x] 5.4 `bun run lint`、`bun run type-check`、`bun run test:coverage`、`bun run quality-check` 通过
- [x] 5.5 浏览器验证：桌面 1600×950、平板横屏 1200×840（停靠 + 三步）、平板竖屏 820×1100（预览打开滑入对话、遮罩关闭）、平板 1024×768 横屏、横竖屏旋转与离开导入路由时滑入面板关闭、手机 375×812（三步、底部主按钮在底部栏上方、抽屉）
