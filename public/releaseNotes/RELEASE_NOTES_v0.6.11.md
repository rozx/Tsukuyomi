# 发布说明 - v0.6.11

## 版本信息
- **版本号**: 0.6.11
- **发布日期**: 2025年12月2日

---

## 🎉 新功能

### 1. AI 思考过程显示功能
- **思考内容提取与显示**：
  - 在 Gemini 服务中新增对 Gemini 3 Pro 等模型的思考内容（reasoning content）支持
  - 在 OpenAI 服务中新增对 DeepSeek 等模型的思考内容支持
  - 实现思考内容的流式提取和独立处理，确保思考内容与实际响应文本分离
  - 在聊天界面中新增思考过程面板，实时显示 AI 的思考过程
  - 支持在翻译、润色、术语翻译和助手服务中显示思考过程
- **思考过程交互**：
  - 优化思考过程的显示方式，提供更好的用户体验
  - 支持思考过程的累积显示和独立查看
  - 改进思考过程与聊天内容的分离处理

### 2. 文本解释服务集成
- **ExplainService 服务**：
  - 新增 `ExplainService` 服务，专门用于解释选中的日文文本
  - 集成到 `AssistantService`，提供统一的解释功能接口
  - 自动创建记忆记录，保存文本解释结果供后续参考
  - 支持流式响应和思考过程显示
- **解释功能增强**：
  - 优化解释提示词生成，包含语法、文化背景和书籍关联信息
  - 支持连续对话和会话总结功能
  - 改进解释结果的格式化和展示

### 3. 助手服务翻译管理功能
- **翻译管理工具**：
  - 在 `AssistantService` 中新增翻译管理相关功能
  - 支持通过助手进行段落翻译、编辑和管理操作
  - 增强助手对翻译上下文的理解和处理能力
- **段落工具增强**：
  - 新增 `find_paragraph_by_keywords` 工具，支持通过关键词查找段落
  - 支持多关键词搜索和翻译过滤选项
  - 优化段落搜索的准确性和性能

### 4. 记忆管理功能增强
- **记忆搜索优化**：
  - 在记忆工具中新增 `limit` 和 `sort_by` 参数支持
  - 支持按创建时间或最后访问时间排序
  - 限制搜索结果数量，提升搜索性能（限制在 1-50 之间）
- **记忆删除优化**：
  - 重构记忆记录删除流程，优化删除性能
  - 改进删除操作的错误处理和反馈
- **记忆总结增强**：
  - 优化聊天总结过程，提供更好的 UI 反馈
  - 改进总结内容的生成质量和准确性

### 5. 工具接口扩展
- **ActionInfo 接口扩展**：
  - 在 `ActionInfo` 接口中新增 `limit` 和 `sort_by` 字段
  - 支持在工具调用中传递限制和排序参数
  - 统一工具接口的参数处理方式
- **工具功能增强**：
  - 在术语工具、角色工具和书籍工具中新增 `limit` 参数支持
  - 优化工具调用的性能和响应速度

### 6. 段落内容验证
- **内容验证功能**：
  - 在 `ChapterService` 中新增段落内容验证功能
  - 确保段落内容的完整性和有效性
  - 改进数据一致性和错误处理

---

## 🔧 改进与优化

### AI 服务优化
- **Gemini 服务增强**：
  - 优化思考内容的提取逻辑，改进对 Gemini 3 Pro 模型的支持
  - 增强响应处理，确保思考内容与实际内容正确分离
  - 改进流式响应的处理效率和准确性
- **OpenAI 服务优化**：
  - 优化 DeepSeek 等模型的思考内容处理
  - 改进流式响应的解析和累积逻辑
  - 增强错误处理和边界情况处理

### 翻译服务优化
- **翻译指南更新**：
  - 更新翻译指南，强调使用 `find_paragraph_by_keywords` 进行历史翻译一致性检查
  - 优化敬语翻译的工作流程说明
  - 改进翻译服务的提示词生成

### 界面优化
- **聊天界面改进**：
  - 优化思考过程的显示和交互
  - 改进聊天总结的 UI 反馈和用户体验
  - 增强聊天会话的状态管理

### 代码质量提升
- **代码重构**：
  - 优化 AI 服务方法的思考内容处理逻辑
  - 改进服务层的抽象和复用性
  - 提升代码的可维护性和可读性

---

## 🐛 问题修复

### 测试修复
- **内存服务测试修复**：
  - 修复内存服务测试中的游标处理问题
  - 改进测试的稳定性和准确性

### 服务修复
- **翻译服务修复**：
  - 修复翻译指南和服务方法中对 `find_paragraph_by_keywords` 的使用
  - 确保工具调用的正确性和一致性

---

## 📝 技术细节

### 主要修改文件
- `src/services/ai/providers/gemini-service.ts`：新增思考内容提取和处理，优化响应处理
- `src/services/ai/providers/openai-service.ts`：优化思考内容处理，改进流式响应
- `src/services/ai/tasks/assistant-service.ts`：新增翻译管理功能，增强助手服务
- `src/services/ai/tasks/explain-service.ts`：新增文本解释服务
- `src/services/ai/tasks/translation-service.ts`：更新翻译指南，优化工具使用
- `src/services/ai/tasks/polish-service.ts`：优化润色服务，支持思考过程显示
- `src/services/ai/tasks/term-translation-service.ts`：支持思考过程显示
- `src/services/ai/tools/paragraph-tools.ts`：新增 `find_paragraph_by_keywords` 工具
- `src/services/ai/tools/memory-tools.ts`：新增 `limit` 和 `sort_by` 参数支持
- `src/services/ai/tools/character-tools.ts`：新增 `limit` 参数支持
- `src/services/ai/tools/terminology-tools.ts`：新增 `limit` 参数支持
- `src/services/ai/tools/types.ts`：扩展 `ActionInfo` 接口
- `src/services/ai/types/ai-service.ts`：新增 `reasoningContent` 类型定义
- `src/services/memory-service.ts`：优化记忆管理功能，改进删除流程
- `src/services/chapter-service.ts`：新增段落内容验证功能
- `src/components/layout/AppRightPanel.vue`：优化思考过程显示和聊天界面
- `src/components/novel/ParagraphCard.vue`：优化文本解释功能集成
- `src/stores/chat-sessions.ts`：优化聊天会话管理
- `src/__tests__/memory-service.test.ts`：修复测试用例

### 新增功能统计
- **新增功能**: 6 项
- **改进优化**: 4 项
- **问题修复**: 2 项
- **代码变更**: 约 2334 行新增，721 行删除
- **修改文件**: 24 个文件

---

## 🎯 用户体验改进

1. **思考过程可视化**：新增的思考过程显示功能让用户能够了解 AI 的推理过程，提升透明度和信任度
2. **文本解释增强**：集成的文本解释服务使原文理解更加便捷，提升翻译准确性
3. **助手功能扩展**：增强的助手服务翻译管理功能提供更强大的翻译辅助能力
4. **记忆管理优化**：优化的记忆搜索和删除功能提升了记忆管理的效率和准确性
5. **工具功能增强**：扩展的工具接口和参数支持使 AI 工具调用更加灵活和高效
6. **界面体验改进**：优化的聊天界面和思考过程显示提供了更好的交互体验

---

## 🔄 升级建议

本次更新主要聚焦于：

1. **AI 能力增强**：思考过程显示和文本解释功能显著提升了 AI 辅助翻译的能力和透明度
2. **工具功能扩展**：新增的段落搜索工具和扩展的工具接口提供了更强大的翻译辅助功能
3. **记忆管理优化**：优化的记忆管理功能提升了知识库的使用效率和准确性
4. **用户体验提升**：改进的界面和交互使翻译工作更加流畅和高效

建议所有用户升级以获得更好的使用体验。特别是思考过程显示功能和文本解释服务将显著提升翻译工作的效率和准确性。

---

## 📚 相关文档

- 项目架构文档：`AGENTS.md`
- 翻译指南：`docs/TRANSLATION_GUIDE.md`
- 主题指南：`docs/THEME_GUIDE.md`
- 组合函数检查报告：`docs/COMPOSABLES_CHECK_REPORT.md`
- 组合函数测试摘要：`docs/COMPOSABLES_TESTS_SUMMARY.md`

---

## 🙏 致谢

感谢所有为本次版本做出贡献的开发者。

---

*本文档由自动化工具生成，如有疑问请提交 Issue。*

