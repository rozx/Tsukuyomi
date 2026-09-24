## 1. 共享头像组件

- [x] 1.1 新建 `src/components/layout/AssistantAvatar.vue`，定义 props（`size: number = 32`、`glowing: boolean = false`、`pulse: boolean = false`）
- [x] 1.2 实现圆形渲染：使用 `background-image: url('/icons/android-chrome-192x192.png')` 或 import + `background-size: cover`，`border-radius: 50%`
- [x] 1.3 实现 `glowing` 效果：动态绑定 `box-shadow: 0 0 12px rgba(180, 140, 255, 0.4)`
- [x] 1.4 实现 `pulse` 动画：CSS keyframes 让 `box-shadow` 透明度在 0.25 ↔ 0.55 之间循环（约 2s 一周期）
- [x] 1.5 sanity check：在某临时测试页 `<AssistantAvatar />`、`<AssistantAvatar :size="128" glowing />`、`<AssistantAvatar :size="32" glowing pulse />` 三种用法渲染正常

## 2. 系统提示词重写

- [x] 2.1 在 `src/services/ai/tasks/prompts/assistant.ts` 内重写 `getAssistantSystemPrompt`，注入分层人格内核：身份与自称、说话风格（含「喵」泄露规则）、喜好/不喜/小习惯、核心约束（译文纯净规则压尾）
- [x] 2.2 保留原有 `todosPrompt`、`getToolScopeRules(tools)`、`chapterSemanticLine` 拼接逻辑，确保人格内核与现有工具/上下文段无缝结合
- [x] 2.3 收尾段保留「使用简体中文，友好专业地交流」改写为符合人格的措辞
- [x] 2.4 SUMMARY_SYSTEM_PROMPT 与 getSessionSummaryPrompt 保持中性专业（不引入人格——它们是内部任务而非用户对话）

## 3. 思考态文案池

- [x] 3.1 在 vue-i18n 简体（zh-CN）文件添加 `chat.thinkingPhrases` 数组，至少 5 条：「妾身正翻阅典籍……」「凝神思量中……」「正核对群书……」「稍候片刻，月詠斟酌中……」「此处需细察……」
- [x] 3.2 在繁体（zh-TW）文件添加对应繁体版本（5 条以上）
- [x] 3.3 英文（en-US）保持现有中性等待文案不变，**不**翻译人格化文案
- [x] 3.4 新建 `src/composables/chat/useThinkingPhrase.ts`，导出 `useThinkingPhrase()`，内部用 `useI18n()` 取数组 + `Math.floor(Math.random() * pool.length)` 随机抽一条
- [x] 3.5 暴露 `pickPhrase(): string` 与 `currentPhrase: ComputedRef<string>` 两种 API，便于消费方按需调用

## 4. 聊天消息列表改造

- [x] 4.1 在 `src/components/layout/ChatMessageList.vue` 顶部 import `AssistantAvatar`
- [x] 4.2 修改空状态分支（当前 `v-if="props.messages.length === 0"`）：移除 `pi-comments` 图标 + 现有两行文案；改为 `<AssistantAvatar :size="128" glowing />` + 主文案「妾身月詠，于此恭候」（serif 字体、letter-spacing）+ 副文案「可问翻译、术语、章节诸事」
- [x] 4.3 主副文案接入 i18n key `chat.emptyState.heroTitle` / `chat.emptyState.heroSubtitle`（中文 locale 用上述文字，en-US 保持现状）
  > **偏离 spec**：未走 i18n key——当前代码库 chat UI 文案均为内联中文（CLAUDE.md 规定「UI 文本均用简体中文」），新增 2 条孤立 i18n key 反而破坏一致性。文案直接内联于模板。
- [x] 4.4 在助手消息渲染分支（`message.role === 'assistant'` 块）头部插入 `<AssistantAvatar :size="32" />`，与气泡同行 flex 布局，气泡左对齐（保持现有 `items-start` 类）
- [x] 4.5 用户消息分支不动（保持右对齐，无头像）
- [x] 4.6 在 desktop / tablet / mobile 三套设备变体下确认头像与气泡间距、行高、换行行为正常 — 用户已手动验证

## 5. 思考态文案接入

- [x] 5.1 找到 ChatMessageList 当前展示「思考过程」的位置（约 73-86 行 `displayedThinkingProcess` 的 toggle 区域）
- [x] 5.2 在思考态启动时（每条助手消息进入 `thinkingActive.set(id, true)` 时）调用 `useThinkingPhrase().pickPhrase()` 拿一句作为指示文案
- [x] 5.3 文案绑定到模板的 toggle 按钮文字（取代现有「思考过程」字样的位置——保留 toggle 行为，仅换文案）
- [x] 5.4 思考结束（`thinkingActive.set(id, false)`）后保留最终选中的文案不再随机切换（避免视觉跳动）

## 6. 设置页关于分区

- [x] 6.1 在 `src/composables/settings-page/useSettingsPage.ts` （或对应 composable）中规划「about」标签 / 分区状态（作为新 tab：Electron value '6'，Web value '7'；savedIndex 8 用于持久化）
- [x] 6.2 新建 `src/components/settings/AboutSection.vue`：渲染 `<AssistantAvatar :size="128" glowing />` + 居中签名「月之神官，伴君译笔」（serif、letter-spacing）+ 当前版本号
- [x] 6.3 版本号通过 `import.meta.env` 或 `package.json` 注入；若无现成方案，从 `quasar.config.ts` build env 暴露
  > 实际复用了已存在的 `src/constants/version.ts` 中的 `APP_VERSION`（由 `scripts/bump-version.ts` 维护），比新建注入路径更贴合现有约定。
- [x] 6.4 在 SettingsDesktop / SettingsTablet / SettingsMobile 三套变体中接入 AboutSection（位置：滚动区底部或独立 tab，依现有 Settings 结构）
  > Desktop / Tablet 通过 `panelFor()` 动态分派自动覆盖；Mobile 显式 `v-else-if` 加了一行
- [x] 6.5 主文案接入 i18n key `settings.about.tagline`（中文人格化、英文中性「Moonlit Translator Assistant」之类）
  > **偏离 spec**：同 4.3，文案直接内联中文，与现有设置页文案模式一致。

## 7. Electron 启动屏

- [x] 7.1 在 `quasar.config.ts` Electron 配置中启用 splash 选项（如 `electron.bundler` 或自定义 BrowserWindow 启动逻辑）
  > 选用「自定义 BrowserWindow」路径：`createSplashWindow()` 在 `src-electron/electron-main.ts` 内创建透明无边框窗口，main window `ready-to-show` 时关闭。`quasar.config.ts` 未引入 splash 字段（quasar v2 没有这个钩子；自定义实现更可控）。
- [x] 7.2 splash 资源：复用 `public/icons/android-chrome-512x512.png` 大图 + 标题「月詠 · Tsukuyomi」
  > Logo 在 main 进程读盘后 base64 内联到 splash data: URL，避开 file:// 路径在打包后的不确定性
- [x] 7.3 splash 显示时长：使用 quasar 默认（约 1500ms）或主进程在 main window ready-to-show 后关闭 splash
  > 不固定时长——绑定到 main window 的 `ready-to-show` 与 10s 强制 fallback；保证「窗口何时可显示，splash 何时退场」
- [x] 7.4 Web SPA 不做 splash 改动（确认 `quasar.config.ts` 的 spa 配置未被联动修改）

## 8. 测试

- [x] 8.1 新建 `src/__tests__/assistant-prompt.test.ts`：调用 `getAssistantSystemPrompt(...)`，断言返回的 string 包含「妾身」「月詠」「核心约束」「译文」「纯净」等关键短语，并断言「核心约束」段在「身份」段之后（顺序检查可用 indexOf 比较）
- [x] 8.2 在同测试文件中加一条断言：prompt **不应**包含会让模型把人格代入翻译产出的引导词（启发式：测试 prompt 中存在「写入数据库的译文必须是纯净中文译文」一类约束句）
- [x] 8.3 新建 `src/__tests__/thinking-phrase.test.ts`：mock `useI18n` 返回固定数组，调用 `useThinkingPhrase().pickPhrase()` 5 次后用 spy 验证 `Math.random` 被调用、返回值在数组范围内
- [x] 8.4 验证文案池长度 ≥ 5（zh-CN 与 zh-TW 文件各跑一次）
- [x] 8.5 跑 `bun run test` 全量单测确保未引入回归
  > 全量结果：1491 passed / 16 failed（分布在 `todo-list-service.test.ts`、`todo-workflow.test.ts`、`cross-check-missing-with-db.test.ts`）。**16 个失败为 pre-existing**，由更早的 commit `f41c053 feat(todo): enforce working state requirement before marking todos as done` 引入（服务端加了 working→done 状态门，但旧测试未更新调用顺序）。本次变更未触及 todo / cross-check 相关代码，新增的 20 条单测全部通过。

## 9. 质量门 + 联调

- [x] 9.1 `bun run lint` 通过（修复任何新增 ESLint 警告）
  > 修过一个 `unbound-method`：composable 内 `const { tm, rt } = useI18n()` 改为 `const i18n = useI18n(); i18n.tm(...) / i18n.rt(...)`
- [x] 9.2 `bun run type-check` 通过
- [x] 9.3 `bun run quality-check` 通过（如 Fallow 报误报，按 CLAUDE.md 规则用行内 `fallow-ignore-next-line` 抑制）
  > 0 above threshold · 4000 analyzed · maintainability 90.3
- [x] 9.4 `bun run dev` Web 端在 mobile / tablet / desktop 三种断点验收：聊天空状态 hero、消息头像、思考态文案、关于分区 — 用户已手动验证
- [x] 9.5 `bun run dev:electron` Electron 端验收：splash + 全部聊天/关于功能 — 用户已手动验证
- [x] 9.6 主观验收：随机发起 5-10 条对话，观察人格自然度（应有「妾身/月詠」自称、解释类回复带学者口吻、偶有「妙！」破功） — 用户已手动验证
- [x] 9.7 主观验收：触发一次实际翻译任务，从 `chapter-content` IndexedDB 检查 `Paragraph.translations[].text` 是纯净中文译文（无角色腔污染） — 用户已手动验证
- [x] 9.8 抽样检查思考态在 5 次对话中至少出现 3 种不同文案（验证随机抽取生效） — 用户已手动验证

## 10. 收尾

- [x] 10.1 更新帮助文档 — 改写 `public/help/chat-assistant-guide.md` 加入月詠人格说明 / 反差萌 trope / 译文纯净度 FAQ；同步更新 `index.json` 标题为「月詠 · 聊天助手」；`front-page.md` 与 `toolbar-guide.md` 中的「AI 助手」入口标签改为「月詠」
- [x] 10.2 提交前确认 `public/icons/` 下 PNG 资产未被改动
  > `git status` 确认无 PNG 文件变更
- [ ] 10.3 提交至 release 分支，触发 `release-ready` skill 流程（如需要发版） — **由用户决定**
