## 1. 创建 AI 任务状态工具

- [x] 1.1 创建 `src/services/ai/tools/task-status-tools.ts` 文件
- [x] 1.2 定义 `update_task_status` 工具的 JSON schema
- [x] 1.3 实现状态值验证逻辑（planning、working、review、end）
- [x] 1.4 实现任务类型特定的状态转换规则验证
- [x] 1.5 实现工具处理器，调用 aiProcessingStore 更新任务状态
- [x] 1.6 添加错误处理和返回信息

## 2. 创建章节标题翻译工具

- [x] 2.1 创建 `src/services/ai/tools/chapter-title-tools.ts` 文件
- [x] 2.2 定义 `update_chapter_title` 工具的 JSON schema
- [x] 2.3 实现参数验证（chapter_id、translated_title）
- [x] 2.4 实现章节存在性验证
- [x] 2.5 实现标题翻译保存逻辑
- [x] 2.6 添加错误处理和返回信息

## 3. 创建批量翻译提交工具

- [x] 3.1 创建 `src/services/ai/tools/translation-batch-tools.ts` 文件
- [x] 3.2 定义 `add_translation_batch` 工具的 JSON schema
- [x] 3.3 实现批次参数验证（空批次、缺少 index）
- [x] 3.4 实现段落 ID 重复检测
- [x] 3.5 实现段落分配范围验证
- [x] 3.6 实现批次大小限制（最大 100 个段落）
- [x] 3.7 实现任务类型特定的保存逻辑（translation/polish/proofreading）
- [x] 3.8 实现原子性保存（验证全部通过后统一保存）
- [x] 3.9 添加错误处理和返回信息

## 4. 注册新工具到工具系统

- [x] 4.1 更新 `src/services/ai/tools/index.ts` 导出三个新工具
- [x] 4.2 确保工具被正确注册到 AI 服务可用工具列表

## 5. 修改翻译任务服务

- [x] 5.1 修改 `src/services/ai/tasks/translation-service.ts`
- [x] 5.2 移除对 response-parser 的依赖
- [x] 5.3 添加对新工具的调用监听
- [x] 5.4 实现工具调用结果处理逻辑
- [x] 5.5 确保任务状态通过工具调用更新

## 6. 修改润色任务服务

- [x] 6.1 修改 `src/services/ai/tasks/polish-service.ts`
- [x] 6.2 移除对 response-parser 的依赖
- [x] 6.3 添加对新工具的调用监听
- [x] 6.4 实现工具调用结果处理逻辑
- [x] 6.5 确保任务状态通过工具调用更新（跳过 review）

## 7. 修改校对任务服务

- [x] 7.1 修改 `src/services/ai/tasks/proofreading-service.ts`
- [x] 7.2 移除对 response-parser 的依赖
- [x] 7.3 添加对新工具的调用监听
- [x] 7.4 实现工具调用结果处理逻辑
- [x] 7.5 确保任务状态通过工具调用更新（跳过 review）

## 8. 更新翻译任务提示词

- [x] 8.1 修改 `src/services/ai/tasks/prompts/translation.ts`
- [x] 8.2 移除所有 JSON 格式示例和要求
- [x] 8.3 添加 `update_task_status` 工具使用说明
- [x] 8.4 添加 `add_translation_batch` 工具使用说明
- [x] 8.5 添加 `update_chapter_title` 工具使用说明
- [x] 8.6 强调"不要输出 JSON，使用工具调用"

## 9. 更新润色任务提示词

- [x] 9.1 修改 `src/services/ai/tasks/prompts/polish.ts`
- [x] 9.2 移除所有 JSON 格式示例和要求
- [x] 9.3 添加 `update_task_status` 工具使用说明（跳过 review）
- [x] 9.4 添加 `add_translation_batch` 工具使用说明
- [x] 9.5 强调"不要输出 JSON，使用工具调用"

## 10. 更新校对任务提示词

- [x] 10.1 修改 `src/services/ai/tasks/prompts/proofreading.ts`
- [x] 10.2 移除所有 JSON 格式示例和要求
- [x] 10.3 添加 `update_task_status` 工具使用说明（跳过 review）
- [x] 10.4 添加 `add_translation_batch` 工具使用说明
- [x] 10.5 强调"不要输出 JSON，使用工具调用"

## 11. 删除旧代码

- [x] 11.1 删除 `src/services/ai/tasks/utils/response-parser.ts` 文件
- [x] 11.2 删除 `src/services/ai/tasks/utils/response-parser.test.ts` 文件
- [x] 11.3 重构 `src/services/ai/tasks/utils/stream-handler.ts`
- [x] 11.4 移除 `stream-handler.ts` 中的状态检测逻辑（STATUS_REGEX、状态转换验证等）
- [x] 11.5 移除 `stream-handler.ts` 中的内容检测逻辑（CONTENT_KEY_REGEX）
- [x] 11.6 保留流式输出的基本处理和思考内容追加功能

## 12. 代码质量检查

- [x] 12.1 运行 `bun run type-check` 检查类型错误
- [x] 12.2 运行 `bun run lint` 检查代码规范
- [x] 12.3 修复所有类型错误
- [x] 12.4 修复所有 lint 警告

## 13. 功能测试

- [x] 13.1 测试批量提交功能
- [x] 13.2 测试章节标题翻译功能
- [x] 13.3 测试状态验证（无效状态值、无效转换）

## 14. 文档更新

- [x] 14.1 更新 AGENTS.md（如有相关说明）
- [x] 14.2 确认变更归档完成
