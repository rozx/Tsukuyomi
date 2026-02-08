# Proposal: Add Help Docs AI Tool

## Why

聊天助手目前无法访问应用的帮助文档，导致AI无法准确回答关于应用使用方法的问题。用户询问"如何添加术语"、"如何切换AI模型"等使用相关问题时，AI只能依赖其内置知识库，可能无法提供最新或准确的指导。通过添加帮助文档查询工具，AI可以访问最新的帮助文档，为用户提供准确、详细的使用指导。

## What Changes

- **新增帮助文档查询AI工具**：创建 `help-docs-tools.ts`，提供查询帮助文档的功能
  - `search_help_docs`: 根据关键词搜索帮助文档
  - `get_help_doc`: 获取指定帮助文档的完整内容
  - `list_help_docs`: 列出所有可用的帮助文档
- **集成到ToolRegistry**：在 `ToolRegistry` 中添加 `getHelpDocsTools()` 方法
- **更新聊天助手工具集**：在聊天助手的工具列表中包含帮助文档查询工具
- **添加帮助文档索引**：利用现有的 `public/help/index.json` 作为文档索引

## Capabilities

### New Capabilities
- `help-docs-query`: 提供AI查询帮助文档的能力，包括搜索、获取文档内容和列出文档

### Modified Capabilities
- 无

## Impact

**受影响的代码**：
- `src/services/ai/tools/` - 新增 `help-docs-tools.ts`
- `src/services/ai/tools/index.ts` - 添加 `getHelpDocsTools()` 方法和工具注册
- `src/services/ai/tasks/assistant-service.ts` - 更新聊天助手的工具集

**受影响的系统**：
- 聊天助手服务 - 获得帮助文档查询能力
- 帮助文档系统 - 被AI工具访问和利用

**依赖**：
- 无新增外部依赖
- 依赖现有的 `public/help/index.json` 和 `public/help/*.md` 文件
