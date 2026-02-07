# Tasks: Add Help Docs AI Tool

## 1. 创建帮助文档查询工具文件

- [x] 1.1 创建 `src/services/ai/tools/help-docs-tools.ts` 文件
- [x] 1.2 导入必要的依赖（axios, ToolDefinition, ToolContext）
- [x] 1.3 定义帮助文档索引类型接口（HelpDocIndex）
- [x] 1.4 实现获取帮助文档索引的函数（fetchHelpIndex）
- [x] 1.5 实现获取单个帮助文档内容的函数（fetchHelpDoc）

## 2. 实现 search_help_docs 工具

- [x] 2.1 定义工具定义（name, description, parameters）
- [x] 2.2 实现工具处理器函数
- [x] 2.3 实现关键词搜索逻辑（匹配 title 和 description）
- [x] 2.4 实现大小写不敏感匹配
- [x] 2.5 添加参数验证和错误处理
- [x] 2.6 返回标准化的 JSON 响应格式

## 3. 实现 get_help_doc 工具

- [x] 3.1 定义工具定义（name, description, parameters）
- [x] 3.2 实现工具处理器函数
- [x] 3.3 实现文档 ID 验证逻辑
- [x] 3.4 实现 HTTP 请求获取文档内容
- [x] 3.5 添加网络错误处理
- [x] 3.6 返回标准化的 JSON 响应格式（包含 title, content, category, file）

## 4. 实现 list_help_docs 工具

- [x] 4.1 定义工具定义（name, description, parameters）
- [x] 4.2 实现工具处理器函数
- [x] 4.3 实现获取所有文档的逻辑
- [x] 4.4 按类别组织文档列表
- [x] 4.5 处理空文档列表的情况
- [x] 4.6 返回标准化的 JSON 响应格式

## 5. 导出工具定义

- [x] 5.1 创建 helpDocsTools 数组，包含所有三个工具定义
- [x] 5.2 确保所有工具遵循 ToolDefinition 接口
- [x] 5.3 为每个工具编写清晰的描述（中文）
- [x] 5.4 导出 helpDocsTools 供 ToolRegistry 使用

## 6. 更新 ToolRegistry

- [x] 6.1 在 `src/services/ai/tools/index.ts` 中导入 helpDocsTools
- [x] 6.2 添加 `getHelpDocsTools()` 静态方法
- [x] 6.3 在 `getAllTools()` 中调用 `getHelpDocsTools()`
- [x] 6.4 确保工具在所有服务中可用（不需要 bookId）
- [x] 6.5 更新 `getAllToolDefinitions()` 方法包含 helpDocsTools

## 7. 更新聊天助手服务

- [x] 7.1 在 `src/services/ai/tasks/assistant-service.ts` 中确认工具集
- [x] 7.2 验证帮助文档工具已包含在聊天助手的工具列表中
- [x] 7.3 确保工具描述对 AI 清晰易懂

## 8. 测试功能

- [x] 8.1 测试 search_help_docs 工具的关键词搜索功能
- [x] 8.2 测试 search_help_docs 工具的空结果处理
- [x] 8.3 测试 search_help_docs 工具的无效查询处理
- [x] 8.4 测试 get_help_doc 工具的文档获取功能
- [x] 8.5 测试 get_help_doc 工具的无效 ID 处理
- [x] 8.6 测试 get_help_doc 工具的缺失参数处理
- [x] 8.7 测试 list_help_docs 工具的文档列表功能
- [x] 8.8 测试中文关键词搜索功能
- [x] 8.9 测试中文文档内容获取功能
- [x] 8.10 测试网络错误处理

## 9. 代码质量检查

- [x] 9.1 运行 ESLint 检查代码规范
- [x] 9.2 运行 TypeScript 类型检查
- [x] 9.3 确保所有错误消息使用中文
- [x] 9.4 确保控制台日志清晰且有用
- [x] 9.5 确保代码注释充分且准确

## 10. 文档更新

- [x] 10.1 在相关帮助文档中说明新功能
- [x] 10.2 更新聊天助手使用指南，说明帮助文档查询能力
- [x] 10.3 添加示例对话，展示如何使用帮助文档工具
