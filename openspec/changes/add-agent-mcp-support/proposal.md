# Proposal

## Why

许多用户已经订阅了 Claude Code、Pi、Antigravity 等 Coding Agents，但目前在 Tsukuyomi 中使用 AI 翻译仍必须单独配置第三方 API Key 并按调用付费；同时，外部 Agent 也无法直接操控 Tsukuyomi 完成加书、导书、查设定和逐章翻译。引入面向外部 Agent 的 MCP 与 WebMCP 支持，可以让用户直接复用现有 Coding Agent 的模型额度，同时继续享受 Tsukuyomi 的书库管理、术语表、角色设定、三信号记忆注入、多版本译文与跨设备同步能力。

## What Changes

- 新增协议无关的 **外部 Agent 工具内核**（`src/services/agent-mcp/`）：提供面向外部 Agent 工作流的精选工具集（应用上下文与导航、书库与导入/加章、分块翻译上下文打包与批量写回、术语/角色/记忆/特殊指令维护）与 3 个内置翻译工作流模板，复用既有 `useBooksStore` 写盘刷新、`chunk-formatter`、`selectRelevantMemoriesForChunk` 与从 `translation-tools.ts` 抽离的译文校验逻辑。
- 新增 **三级权限门禁**（`read_only` / `translate_and_edit` / `full`）与调用活动记录，服务总开关默认关闭；写回已有译文默认采用 `append` 新增译文版本并选中（支持显式 `overwrite`），并为 `mcp:*` / `webmcp:*` 外部译文来源提供友好展示标签。
- 新增 **Electron 本地双代 Streamable HTTP MCP 服务端**（`src-electron/mcp-server.ts` + IPC 桥接）：仅绑定 `127.0.0.1`，在同一 `POST /mcp` 端点兼容 `2026-07-28` 无状态语义与 `2025-03-26` 握手协议，提供 Bearer Token 鉴权、`Host`/`Origin` 防护、`trustedDesktopSender` IPC 校验与 MCP `tools/*`、`prompts/*` 协议，使 Antigravity、Pi、Claude Code 等本地 Coding Agents 开箱即用；服务端端口、Token 与开关作为设备本地配置，不参与 Gist 同步与设置备份导出。
- 新增 **浏览器 WebMCP 适配层与本地中继接入**（`src/services/agent-mcp/webmcp-adapter.ts`、`webmcp-relay.ts`）：开启时按需加载页面 WebMCP 运行时（`@mcp-b/global`）并接入用户电脑上的 WebMCP 本地中继（`@mcp-b/webmcp-local-relay`），按开关和权限模式动态注册与清理工具，使浏览器版也能被 Claude Code 等本地 Agent 使用，且不依赖浏览器实验开关。
- 新增 **独立一级工作台页面 `/mcp`**（`AgentMcpPage.vue` + Desktop / Tablet / Mobile 三变体与 `useAgentMcpPage` composable），在桌面与平板主导航中平行于 AI 导入（`/import`）与 AI 模型（`/ai`），提供连接控制、端口/Token 管理、Claude Code / Pi / Antigravity / WebMCP 一键配置片段、工具目录浏览与实时调用日志。

## Capabilities

### New Capabilities

- `agent-mcp-tool-kernel`: 协议无关的外部 Agent 工具内核，涵盖精选工具集、翻译上下文分块打包与批量写回、内置工作流模板、三级权限门禁、外部译文来源标签解析与调用活动记录。
- `agent-mcp-desktop-server`: Electron 桌面端本地 Streamable HTTP MCP 服务端与 IPC 桥接，包含 `127.0.0.1` 绑定、Bearer Token 鉴权、DNS Rebinding/Origin 校验、MCP Tools/Prompts 路由以及与 Gist 同步隔离的设备本地配置。
- `agent-mcp-webmcp-bridge`: 浏览器端 WebMCP 适配层，负责探测并绑定 `document.modelContext` / `navigator.modelContext`、基于 `AbortSignal` 或 `unregisterTool` 的生命周期管理、权限变更时的动态重注册以及工作流指南工具暴露。
- `agent-mcp-workspace`: 平行于 AI 导入与 AI 模型的独立 `/mcp` 一级页面与导航入口，遵循三变体分派规范，提供双端连接管理、客户端配置片段复制、暴露工具浏览与实时调用活动观测。

### Modified Capabilities

<!-- 无既有规格需求变更；本变更遵循既有 device-variant-dispatch、desktop-tool-pages 与设备本地配置不参与 Gist 同步的约定，不修改其需求。 -->

## Impact

- **渲染进程服务层**：新增 `src/services/agent-mcp/`（工具内核、各领域工具处理器、上下文打包器、WebMCP 适配器、Electron IPC 桥接、外部译文来源解析）；新增 `src/boot/agent-mcp.ts` 启动钩子（注册至 `quasar.config.ts`）。
- **Electron 主进程与 Preload**：新增 `src-electron/mcp-server.ts` 与 IPC 通道；更新 `src-electron/electron-main.ts`、`src-electron/electron-preload.ts` 及 `src/types/electron.d.ts`。
- **状态与配置**：在 `src/models/settings.ts` 与 `src/stores/settings.ts` 中增加设备本地 `agentMcp` 配置字段（上传 Gist 时剥离、下载时保留本机值）；新增 `src/stores/agent-mcp.ts` 管理运行态状态与内存态调用活动日志。
- **UI 与路由**：新增 `src/pages/AgentMcpPage.vue`、`src/pages/agent-mcp/AgentMcp{Desktop,Tablet,Mobile}.vue`、`src/composables/agent-mcp-page/useAgentMcpPage.ts` 与共享碎片组件；更新 `src/router/routes.ts`、`src/composables/useMainNavActive.ts`、`src/composables/layout/useMainNavDispatch.ts`、`src/components/layout/AppSideMenu.vue`、`src/components/layout/TabletNavRail.vue`、`src/components/dialogs/TranslationHistoryDialog.vue`、`src/composables/book-details/useBookDetailsPage.ts`；补齐 `zh-CN` / `zh-TW` / `en-US` 三语 i18n 与帮助文档。
- **测试**：在 `src/__tests__/` 下按 TDD 为工具内核、权限门禁、翻译打包与写回、Electron Streamable HTTP MCP 服务端、WebMCP 适配层、本地设置同步隔离与导航/页面 composable 编写 Vitest 测试。
