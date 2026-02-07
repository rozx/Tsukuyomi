# 发布说明 - v0.6.10

## 版本信息
- **版本号**: 0.6.10
- **发布日期**: 2025年12月1日

---

## 🎉 新功能

### 1. 文本选择与解释功能
- **文本选择处理**：
  - 在 `ParagraphCard` 组件中新增文本选择检测功能
  - 支持在段落原文中选择文本，并提供上下文菜单操作
  - 实时检测文本选择状态，动态显示相关操作按钮
- **选中文本解释**：
  - 新增"解释选中文本"功能，可将选中的文本发送给 AI 助手进行解释
  - 优化上下文菜单，根据是否有文本选择显示不同的操作选项
  - 提升用户对原文的理解和翻译准确性

### 2. 段落上下文管理重构
- **选中段落管理**：
  - 重构段落上下文处理逻辑，使用 `selectedParagraphId` 替代 `hoveredParagraphId`
  - 在 `context` store 中新增 `selectedParagraphId` 状态管理
  - 改进段落选择状态的持久化，支持跨页面保持选中状态
- **上下文同步**：
  - 优化 `BookDetailsPage` 和 `BooksPage` 中的段落上下文初始化
  - 改进上下文切换时的状态清理逻辑
  - 增强上下文管理的准确性和一致性

### 3. 翻译和润色指南增强
- **翻译服务增强**：
  - 扩展 `TranslationService` 的翻译工作流程，包含详细的敬语处理步骤
  - 增强术语管理和角色管理的工作流程说明
  - 改进翻译一致性检查，参考历史段落确保翻译连贯性
  - 强调严格遵循 JSON 输出格式要求和翻译完整性维护
- **润色服务优化**：
  - 在 `PolishService` 中新增翻译一致性检查功能
  - 通过参考前文段落确保翻译的连贯性和一致性
  - 优化润色流程的清晰度和准确性

### 4. 最后编辑时间戳功能
- **自动时间戳更新**：
  - 在修改 AI 模型、书籍和设置时自动更新 `lastEdited` 时间戳
  - 确保在数据加载和迁移过程中保留 `lastEdited` 时间戳
  - 在必要时使用当前日期初始化 `lastEdited`，增强数据一致性
- **数据追踪**：
  - 在 `ai-models`、`books` 和 `settings` store 中实现时间戳管理
  - 支持数据同步服务中的时间戳处理
  - 提供更准确的数据修改历史追踪

### 5. 翻译编辑功能增强
- **段落编辑优化**：
  - 增强 `ParagraphCard` 组件中的翻译编辑功能
  - 改进编辑体验和交互流程
  - 优化编辑状态的管理和反馈

---

## 🔧 改进与优化

### 段落组件优化
- **字符索引计算改进**：
  - 优化段落组件中的字符索引计算逻辑
  - 添加对未定义行和字符的检查，防止潜在错误
  - 改进确定点击位置最近字符的逻辑，确保光标定位准确

### 代码质量提升
- **代码清理**：
  - 移除 `useEditMode` composable 中未使用的服务导入
  - 优化代码结构，减少不必要的依赖
  - 提升代码的可维护性和可读性

### 测试更新
- **测试用例完善**：
  - 更新 `use-keyboard-shortcuts.test.ts` 测试用例
  - 更新 `use-paragraph-navigation.test.ts` 测试用例
  - 更新 `use-edit-mode.test.ts` 测试用例
  - 更新 `use-chapter-drag-drop.test.ts` 测试用例
  - 确保新功能和改进的测试覆盖

---

## 🐛 问题修复

### 段落组件修复
- **字符索引计算修复**：
  - 修复段落组件中字符索引计算可能出现的错误
  - 添加对边界情况的处理，防止在计算过程中出现未定义值
  - 改进光标定位的准确性，特别是在复杂文本布局中

---

## 📝 技术细节

### 主要修改文件
- `src/components/novel/ParagraphCard.vue`：新增文本选择功能，增强编辑功能，修复字符索引计算
- `src/stores/context.ts`：新增 `selectedParagraphId` 状态管理
- `src/pages/BookDetailsPage.vue`：优化段落上下文初始化
- `src/pages/BooksPage.vue`：优化段落上下文初始化
- `src/services/ai/tasks/translation-service.ts`：增强翻译指南和工作流程
- `src/services/ai/tasks/polish-service.ts`：优化润色服务，新增一致性检查
- `src/services/ai/tasks/assistant-service.ts`：支持文本解释功能
- `src/services/ai/providers/openai-service.ts`：优化服务提供者实现
- `src/services/ai/types/ai-service.ts`：扩展服务类型定义
- `src/stores/ai-models.ts`：实现 `lastEdited` 时间戳管理
- `src/stores/books.ts`：实现 `lastEdited` 时间戳管理
- `src/stores/settings.ts`：实现 `lastEdited` 时间戳管理
- `src/services/sync-data-service.ts`：支持时间戳处理
- `src/composables/book-details/useEditMode.ts`：清理未使用的导入
- `src/components/layout/AppRightPanel.vue`：更新段落上下文处理

### 新增功能统计
- **新增功能**: 5 项
- **改进优化**: 3 项
- **问题修复**: 1 项
- **代码变更**: 约 689 行新增，79 行删除
- **修改文件**: 17 个文件

---

## 🎯 用户体验改进

1. **文本选择功能**：新增的文本选择和解释功能使原文理解更加便捷，提升翻译准确性
2. **上下文管理优化**：重构的段落上下文管理使状态管理更加清晰和一致
3. **翻译质量提升**：增强的翻译和润色指南确保更高质量的翻译输出
4. **数据追踪增强**：自动时间戳更新提供更准确的数据修改历史
5. **编辑体验改进**：优化的编辑功能和修复的字符索引计算使编辑操作更加流畅
6. **代码质量提升**：代码清理和测试更新提升了应用的稳定性和可维护性

---

## 🔄 升级建议

本次更新主要聚焦于：

1. **交互体验增强**：文本选择和解释功能显著提升了用户与原文的交互体验
2. **翻译质量提升**：增强的翻译和润色指南确保更高质量和一致性的翻译输出
3. **数据管理优化**：自动时间戳更新提供了更好的数据追踪和管理能力
4. **稳定性改进**：修复的字符索引计算问题提升了编辑功能的稳定性

建议所有用户升级以获得更好的使用体验。特别是文本选择功能和翻译指南的增强将显著提升翻译工作的效率和准确性。

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

