# Tasks

## 1. 模型

- [x] 1.1 在 `ImportDraft` 增加 `updateRecipe`，在 `ImportPlan` 增加 `recipeChange`，在 `ImportTask` 增加 `purpose`（均为可选）；验证：`bun run type-check` 通过，并用一条测试确认旧任务和旧草稿能正常读取

## 2. 离线自测

- [x] 2.1 先写测试再实现目录页收集（catalog 来源，加上经 next 关系发现且有快照的分页）和 `entries` 去重；验证：多页目录的 fixture 测试
- [x] 2.2 先写测试再实现一一对应检查（`UNSUPPORTED_GRANULARITY`：拆章、多章共用一个网址、章节网址不在目录中）；验证：三种不对应情况各有一条测试
- [x] 2.3 先写测试再实现正文逐段比对：草稿正文用 `loadImportPlanContext` 加 `assembleImportParagraphs` 拼装；回放按导入器口径提取（全部块以 `\n` 连接），再经 `normalizeChapterText` 处理；用 `sameChapterText` 比较；差异示例最多 5 条；另加一条「用引用范围裁掉标题但没有声明 `strip_heading` 时失败」的测试；验证：「缺少次の話へ 清理规则」测试返回 `CONTENT_MISMATCH` 和对应示例
- [x] 2.4 先写测试再实现固定正文章节规则（必须确实与回放不同、最多占 20%）和 `SNAPSHOT_MISSING`；验证：边界测试覆盖恰好 20% 和超过 20%
- [x] 2.5 先写测试再实现内置站点判定：内置站点采用 builtin 引擎，目录用 `parseNovelSnapshot` 离线解析，正文保留导入时实际使用的提取规则写入 `engine.content`；Agent 没给规则时从提取资源推导，各章规则不一致时拒绝；验证：用 ncode fixture 快照的测试，断言回放正文与导入时（`BODY_PRESETS` 口径）逐字相同
- [x] 2.6 写一条对照测试：自测通过的草稿应用后，书籍 `originalContent` 与配方回放逐段相同；验证：该测试全绿

## 3. 工具

- [x] 3.1 在 `import-tool-definitions.ts` 中定义 `record_update_recipe`（参数包括 `catalog_selector`），在 `import-tool-executor.ts` 中实现：校验来源、执行自测、以草稿编辑方式写入并递增修订号、处理 `DRAFT_CHANGED`；验证：工具执行器测试覆盖成功和每种错误码
- [x] 3.2 为该工具的操作气泡和详情弹出层补充描述（阶段、引擎、可复现章节数、差异示例）；验证：`import-action-description` 和 `import-action-popover` 测试新增用例

## 4. 方案与应用

- [x] 4.1 先写测试再实现方案生成时重跑自测，产出 `recipeChange`（add、replace、keep、stale 四种）；验证：「声明后又批量删行得到 stale，旧配方保留」测试
- [x] 4.2 先写测试再实现 `plan.book` 写入配方、`webUrl` 放首位去重、按 D4 计算跳过列表；验证：「取消勾选的人物介绍进入跳过列表、从未进入草稿的章节不进入」测试
- [x] 4.3 先写测试再放宽 `EMPTY_SELECTION`（已有书籍且配方为 add 或 replace 时），并调整 `import-plan-service.ts:419` 附近的顺序，让配方自测先于空选择判断执行；验证：「只修配方的方案可应用」测试，以及「无章节且无配方变化仍报冲突」测试
- [x] 4.4 写一条撤销测试：替换配方的导入被撤销后，配方和 `webUrl` 恢复原样；验证：该测试全绿
- [x] 4.5 在导入预览中新增「更新配方」区块（变化类型、可复现章节数、失效原因）；验证：组件测试覆盖四种变化类型

## 5. 修复任务

- [x] 5.1 先写测试再实现 `ImportRecipeRepair.open`：已有未结束的修复任务就复用；新建时预设目标和来源；没有目录网址时不登记来源；验证：「重复点击只有一个任务」测试
- [x] 5.2 在提示词状态中增加 `repair`（原配方和失效原因），在提示词中增加 D8 的工作方式（包括用引用范围裁掉的内容要改写成规则，以及 `catalog_selector` 的用法）；验证：提示词快照测试包含 repair 状态和新增的工作方式
- [x] 5.3 同步工作区的 `HandoffNotice` 改为调用 `ImportRecipeRepair.open` 并跳转；工作台打开修复任务时，在输入框预填失效说明，但不自动运行；另一个 Agent 正在运行时显示需要先暂停的提示；验证：组件测试，以及在浏览器中确认没有自动启动 Agent

## 6. 收尾

- [x] 6.1 更新帮助文档（导入器如何生成更新配方、如何修复）；运行 `bun run lint && bun run type-check && bun run test && bun run quality-check`，确认全部通过
