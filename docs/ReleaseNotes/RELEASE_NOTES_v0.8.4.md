# 发布说明 - v0.8.4

## 版本信息

- **版本号**: 0.8.4
- **发布日期**: 2026年1月19日
- **基于版本**: v0.8.3

---

## 🎉 新功能

### 1. 批量章节摘要 (Batch Chapter Summary)

- **批量处理面板**: 新增 `BatchSummaryPanel` 组件，支持一键为全书或选定章节生成缺失的摘要。
- **实时进度反馈**: 支持显示当前正在处理的章节标题及整体进度。
- **任务控制**: 集成 AbortController，支持用户随时安全终止批量生成任务。
- **智能过滤**: 自动识别并仅处理缺失摘要的章节，避免重复消耗 AI 额度。
- **章节摘要服务**: 新增 `chapter-summary-service.ts`，提供专门的章节摘要生成功能。

### 2. AI 用户交互工具 (Ask User Tools)

- **用户提问对话框**: 新增 `AskUserDialog` 组件，支持 AI 向用户提出结构化问题。
- **批量提问工具**: 实现批量用户提问功能，支持一次性向用户询问多个相关问题。
- **跳过设置**: 新增"跳过 AI 询问用户"设置选项，允许用户在不需要时禁用此功能。
- **异步处理**: 完整的异步处理机制，支持 Promise 风格的交互流程。

### 3. 记忆管理增强

- **记忆列表工具**: 新增 `list_memories` 工具，支持分页和排序查看 Memory 记录。
- **记忆同步增强**: 改进记忆数据的同步逻辑和 UI 刷新机制。
- **记忆导入**: 在 Electron 设置中实现记忆数据导入功能。
- **记忆服务**: 新增 `memory-service.ts`，提供统一的记忆管理服务。

### 4. 全局配置缓存

- **配置缓存服务**: 新增 `global-config-cache.ts`，提供全局配置的缓存机制。
- **性能优化**: 减少重复的配置读取操作，提升应用性能。

### 5. AI 任务上下文管理增强

- **关联信息注入**: 在翻译、润色、校对和摘要任务中，自动注入相关的术语表和角色设定信息，显著提升 AI 生成内容的准确性和一致性。
- **通用助手工具**: 引入 `ai-task-helper` 模块，统一管理 AI 任务的上下文构建、模型选择和错误处理逻辑。
- **提示词优化**: 针对章节摘要任务优化了 Prompt，使其更能捕捉章节的核心剧情。

### 6. 润色和校对服务增强

- **润色服务**: 新增专门的润色服务，提供文本润色功能。
- **校对服务**: 重构校对服务，增强校对背景信息和上下文支持。
- **术语翻译服务**: 新增术语翻译服务，支持术语的自动翻译。

### 7. 段落位置工具

- **段落位置获取**: 新增 `get_paragraph_position` 工具，支持获取段落在文档中的位置。
- **CJK 工具重构**: 优化中日韩字符处理工具。

### 8. OpenSpec 工作流

- **提案工作流**: 新增 OpenSpec 提案创建工作流。
- **应用工作流**: 新增 OpenSpec 应用工作流。
- **归档工作流**: 新增 OpenSpec 归档工作流。
- **项目文档**: 新增 `openspec/project.md`，详细说明项目结构和规范。

### 9. 代码审查工作流

- **代码审查流程**: 新增代码审查工作流，支持全面的代码审查。
- **版本发布准备**: 新增版本发布准备工作流。

### 10. 上下文菜单管理

- **上下文菜单**: 新增 `useContextMenuManager` composable，提供统一的上下文菜单管理。
- **右键菜单**: 在 `ParagraphCard` 组件中集成上下文菜单功能。

---

## 🔧 改进与优化

### UI/UX 体验

- **思考过程面板**: 优化 `ThinkingProcessPanel` 组件的消息处理和滚动性能。
- **同步状态防抖**: 为顶部状态栏的同步倒计时添加了防抖逻辑，避免高频更新导致的界面微颤和性能开销。
- **摘要生成交互**: 优化了单个章节摘要生成后的 UI 自动刷新机制，无需手动刷新即可看到新生成的摘要。
- **书籍详情页**: 在批量摘要入口处直观显示当前书籍标题及待处理章节数。
- **右侧面板**: 扩展 `AppRightPanel` 组件，支持更多面板类型。
- **翻译进度**: 改进 `TranslationProgress` 组件的进度显示和交互。
- **章节设置**: 重构 `ChapterSettingsPopover` 组件，改进用户界面。
- **章节内容面板**: 增强 `ChapterContentPanel` 组件的功能。

### AI 服务优化

- **提示词增强**: 为翻译、润色、校对任务添加严格的输出规则。
- **消息总结**: 增强消息总结功能。
- **搜索替换**: 改进搜索替换功能。
- **思考过程优化**: 优化思考过程的处理和缓存机制。
- **OpenAI 服务**: 更新 OpenAI max tokens 限制和验证逻辑。

### 数据同步优化

- **同步数据服务**: 扩展 `sync-data-service.ts`，支持更多数据类型的同步。
- **Gist 同步**: 改进 GitHub Gist 同步服务。
- **自动同步**: 增强自动同步触发机制。

### 代码质量与性能

- **异步控制优化**: 核心 AI 服务全面采用异步流式处理及可中断机制，提升应用响应速度。
- **Vue 模板优化**: 清理了部分组件中的冗余事件监听和计算属性。
- **滚动节流**: 为滚动更新实现节流机制，提升 UI 性能。
- **工具结果截断**: 移除 `TOOL_RESULT_MAX_LENGTHS` 和 `truncateToolResult` 函数，简化代码。

### 任务流程优化

- **状态机更新**: 将任务状态从 'completed' 更新为 'review'。
- **润色校对跳过**: 更新润色和校对服务，跳过已完成阶段。

### 开发体验

- **开发指南**: 新增 CLAUDE.md 文档，提供开发指南。
- **代理规则**: 添加规则强制使用中文进行思考和输出。
- **Git 忽略**: 更新 .gitignore 文件，清理调试日志。
- **VSCode 任务**: 新增 VSCode 任务配置。

---

## 🐛 问题修复

### 核心功能修复

- **章节排序修复**: 修复了章节列表中拖拽排序可能导致的位置偏移问题。
- **摘要显示修复**: 修复了某些情况下生成摘要后面板标题显示空白的 Bug。
- **内存泄漏预防**: 增强了 AI 任务销毁时的资源清理。
- **ESLint 问题**: 修复 AI processing store 中的 `no-this-alias` 问题。
- **测试修复**: 更新 ask_user 工具测试以正确处理 Promise 解析。

---

## 📝 技术细节

### 主要新增文件

- `src/components/novel/BatchSummaryPanel.vue`: 批量摘要管理面板 (326 行)
- `src/components/dialogs/AskUserDialog.vue`: 用户提问对话框 (354 行)
- `src/services/ai/tasks/chapter-summary-service.ts`: 章节摘要服务 (262 行)
- `src/services/ai/tools/ask-user-tools.ts`: 用户提问工具 (312 行)
- `src/services/global-config-cache.ts`: 全局配置缓存 (174 行)
- `src/services/memory-service.ts`: 记忆服务 (177 行)
- `src/stores/ask-user.ts`: 用户提问状态管理 (340 行)
- `src/composables/useContextMenuManager.ts`: 上下文菜单管理 (171 行)
- `openspec/`: OpenSpec 工作流文档和规范
- `docs/ReleaseNotes/RELEASE_NOTES_v0.8.4.md`: 发布说明

### 主要修改文件

- `src/services/ai/tasks/utils/ai-task-helper.ts`: AI 任务辅助工具重构 (740 行优化)
- `src/services/ai/tasks/term-translation-service.ts`: 术语翻译服务重构 (394 行删除)
- `src/components/layout/AppRightPanel.vue`: 右侧面板扩展 (369 行改进)
- `src/components/novel/ChapterSettingsPopover.vue`: 章节设置重构 (282 行改进)
- `src/components/novel/TranslationProgress.vue`: 翻译进度改进 (116 行改进)
- `src/services/ai/tasks/proofreading-service.ts`: 校对服务重构 (216 行改进)
- `src/services/ai/tasks/polish-service.ts`: 润色服务增强 (52 行改进)
- `src/services/ai/tasks/translation-service.ts`: 翻译服务增强 (37 行改进)
- `src/services/ai/tasks/prompts/index.ts`: 提示词增强 (150 行改进)
- `src/services/ai/tools/memory-tools.ts`: 记忆工具增强 (140 行改进)
- `src/services/ai/tools/paragraph-tools.ts`: 段落工具增强 (209 行改进)
- `src/services/sync-data-service.ts`: 同步数据服务扩展 (184 行改进)
- `src/stores/ai-processing.ts`: AI 处理状态管理增强 (228 行改进)
- `src/components/ai/ThinkingProcessPanel.vue`: 思考过程面板优化 (130 行改进)

### 新增测试文件

- `src/__tests__/ask-user-store.test.ts`: 用户提问状态管理测试 (93 行)
- `src/__tests__/ask-user-tools.no-ui.test.ts`: 用户提问工具测试 (166 行)
- `src/__tests__/memory-tools.list-memories.test.ts`: 记忆列表工具测试 (111 行)
- `src/__tests__/sync-data-service.test.ts`: 同步数据服务测试 (327 行)
- `src/__tests__/ai-task-helper.executeToolCallLoop.test.ts`: AI 任务助手测试扩展 (237 行改进)
- `src/__tests__/ai-task-helper.truncateToolResult.test.ts`: 删除 (574 行删除)

### OpenSpec 变更提案

- `openspec/changes/batch-chapter-summary/`: 批量章节摘要功能
- `openspec/changes/archive/2026-01-19-add-ai-ask-user-tool/`: AI 用户提问工具
- `openspec/changes/archive/2026-01-19-add-ask-user-batch-tool/`: 批量用户提问工具
- `openspec/changes/archive/2026-01-19-add-chapter-summary/`: 章节摘要功能
- `openspec/changes/archive/2026-01-19-add-global-config-cache/`: 全局配置缓存
- `openspec/changes/archive/2026-01-19-add-list-memories-tool/`: 记忆列表工具
- `openspec/changes/archive/2026-01-19-add-skip-ai-ask-user-setting/`: 跳过 AI 询问用户设置
- `openspec/changes/archive/2026-01-19-update-completed-state-to-review/`: 更新任务状态
- `openspec/changes/archive/2026-01-19-update-polish-proofreading-skip-completed-stage/`: 更新润色校对跳过逻辑

### 代码统计

- **新增功能**: 10 大项
- **改进优化**: 5 类
- **问题修复**: 5 类
- **代码变更**: 9,424 行新增，2,026 行删除
- **修改文件**: 138 个文件
- **新增测试**: 约 697 行测试代码
- **OpenSpec 提案**: 9 个变更提案

---

## 🎯 用户体验改进

1. **更强大的批量能力**: 告别逐章点击，一键完成整本书的摘要提取，极大提升创作效率。
2. **更聪明的 AI**: 现在的 AI 能够"记住"你的术语和角色设定，无论是翻译还是写摘要都更具专业性。
3. **更顺畅的界面**: 修复了烦人的拖拽偏移问题，同步倒计时也变得更加静默优雅。
4. **更好的交互**: 新增 AI 用户交互工具，AI 可以主动向用户提问，获取更准确的信息。
5. **更完善的记忆管理**: 支持记忆的查看、同步和导入，AI 的记忆更加可控。
6. **更高的性能**: 全局配置缓存和滚动节流优化，提升应用响应速度。
7. **更规范的流程**: OpenSpec 工作流和代码审查工作流，提升开发质量。

---

## 🔄 升级建议

本次更新重点提升了 **AI 创作效率**、**内容一致性** 和 **用户体验**。

建议所有深度使用 AI 功能的用户升级，尤其是：

- 拥有大量章节需要整理摘要的用户。
- 对翻译一致性（词汇、角色）有较高要求的用户。
- 需要 AI 主动提问获取信息的用户。
- 关注应用性能和响应速度的用户。

---

## 📚 相关文档

- 项目架构文档：`CLAUDE.md`
- 翻译指南：`docs/TRANSLATION_GUIDE.md`
- 主题指南：`docs/THEME_GUIDE.md`
- 批量替换示例：`docs/batch-replace-examples.md`
- AI 任务流程文档：`docs/TRANSLATION_AI_TASK_FLOW.md`
- 流程改进建议：`docs/TRANSLATION_AI_TASK_FLOW_IMPROVEMENTS.md`
- OpenSpec 项目文档：`openspec/project.md`
- OpenSpec 代理指南：`openspec/AGENTS.md`
- v0.8.3 发布说明：`docs/ReleaseNotes/RELEASE_NOTES_v0.8.3.md`

---

## 🙏 致谢

感谢所有在本次版本开发中提供反馈和建议的伙伴们。

---

_本文档由自动化工具生成，基于 git diff v0.8.3..v0.8.4-chapter-summary_
