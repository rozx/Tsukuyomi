> 运行时逻辑（`composables/` / `stores/` / `models/`）一律先写失败测试再实现（CLAUDE.md「TDD 是默认工作流」）。每组完成后跑 `bun run lint && bun run type-check`。

## 1. 设置与 UI 状态

- [x] 1.1 先写测试：`AppSettings.showDeskPet` 缺省视为开启，设为 false 后经设置导出 / 导入（`parseAppSettings`）保留；实现字段与 `copyOptionalAppSettingsFields` 透传，测试通过
- [x] 1.2 先写测试：`ui` store 的 `deskPetBubbleExpanded` 默认收起，切换后刷新（重新 `loadState`）仍保持；实现并通过
- [x] 1.3 设置 → 通用设置新增「显示月詠桌宠」开关（三语文案）；组件测试切换后写入设置，`bunx vitest run settings` 相关测试通过

## 2. 跟随、让位与状态（纯函数）

- [x] 2.1 先写测试 `desk-pet-state.test.ts`：`pickCandidates` 的优先级（助手 > 正在阅读的章节 > 其他章节），任务中心可见时剔除章节任务、助手面板打开时剔除助手；实现 `desk-pet-state.ts` 并通过
- [x] 2.2 先写测试：`nextFollowed` 当前任务仍在候选里则保持、手动选择优先且持续到该任务结束、当前任务结束后取候选第一个；实现并通过
- [x] 2.3 先写测试：`petMood` 在有候选时为 running，有未确认的章节小结或助手小结时为 review，否则 idle；实现并通过

## 3. 气泡条目

- [x] 3.1 确认工具结果摘要的来源：解析出的 `tool-result` 片段已带截断后的摘要，执行状态也已回填到对应的 `tool-call` 片段，无需导出 `formatToolResultPreview`；气泡小字显示工具名与执行状态
- [x] 3.2 先写测试 `desk-pet-entries.test.ts`：把解析片段转成「思考 / 工具 / 输出」条目——工具调用查台词、缺省走通用台词并带 `{tool}`、附结果摘要；思考与输出取末尾一行、超长保留结尾；`outputContent` 作为输出；`state-transition` 不成条；收起取最后一条、展开取最近 8 条；实现并通过
- [x] 3.3 i18n 三语新增 `deskPetUi.*`（工具台词、通用台词、气泡标签、小结、空闲、设置开关）；zh-CN / zh-TW 用月詠口吻，en-US 中性；`bun run check:i18n` 通过

## 4. `useDeskPet` 组合

- [x] 4.1 先写测试 `use-desk-pet.test.ts`（挂载 provideTaskCenter + router + pinia）：运行中章节任务被跟随并输出条目；打开任务中心后不再跟随章节任务；助手面板收起时助手回复被跟随、打开后不再跟随；关闭开关时 `visible` 为 false；实现 `useDeskPet` 并通过
- [x] 4.2 先写测试：章节任务结束后小结显示完成 / 失败数，调用关闭小结或打开任务中心后清除且任务中心 chip 的完成提示同时清除；助手回复完成时出现「答好了」小结，打开助手面板后清除；实现并通过

## 5. 桌宠组件与挂载

- [x] 5.1 实现 `DeskPet.vue`：现有月詠头像、外圈 / 弧线 / 角标状态、空闲缩小变暗与「zzz」、气泡（标题行 + 条目、收起 / 展开、切换任务、打开任务中心、小结点击行为）、`prefers-reduced-motion` 关闭动画；空闲点头打盹与「z」飘起动画、悬停醒来；点头像打开助手面板；组件测试覆盖收起 / 展开切换与点头像打开助手面板
- [x] 5.2 `MainLayoutDesktop` 挂载桌宠：在 `.desktop-shell-body` 内按右侧助手容器宽度定位并随开合过渡，不压住 footer；平板 / 手机布局不挂载；组件测试确认平板 / 手机布局里没有桌宠
- [x] 5.3 浏览器验证（桌面 1440×900，127.0.0.1:9000 测试档案）：章节翻译运行时气泡转述思考 / 工具 / 输出；打开任务中心后停止转述；助手面板收起时转述助手、打开助手面板或进入导入页时桌宠隐藏；任务结束显示小结、打开任务中心后清除；空闲打盹动画、点头像打开助手面板；关闭设置开关后消失；窗口缩到平板宽度时不显示

## 6. 文档与整体验证

- [x] 6.1 帮助文档（`toolbar-guide` 桌面端一节、`chat-assistant-guide`、`settings-guide` 通用设置）以 zh-CN 为源补充桌宠说明并同步 zh-TW / en-US，`{#id}` 锚点一致
- [x] 6.2 运行 `bun run test:coverage` 后执行 `bun run lint && bun run type-check && bun run quality-check`，全部通过
