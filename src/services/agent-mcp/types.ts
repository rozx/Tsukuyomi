import type { ExternalAgentChannel } from 'src/models/agent-mcp';
import type { AgentMcpPermissionMode, AgentMcpWriteMode } from 'src/models/settings';

export type AgentMcpToolCategory = 'context' | 'library' | 'translation' | 'worldbuilding';

export interface AgentMcpToolSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AgentMcpToolError {
  __agentMcpError: true;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function agentMcpError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): AgentMcpToolError {
  return {
    __agentMcpError: true,
    code,
    message,
    ...(details ? { details } : {}),
  };
}

export function isAgentMcpToolError(value: unknown): value is AgentMcpToolError {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__agentMcpError' in value &&
    (value as { __agentMcpError?: unknown }).__agentMcpError === true
  );
}

export type ResolveBookIdResult =
  | { ok: true; bookId: string }
  | { ok: false; error: AgentMcpToolError };

export interface AgentMcpExecutionContext {
  channel: ExternalAgentChannel;
  permissionMode: AgentMcpPermissionMode;
  defaultWriteMode: AgentMcpWriteMode;
  resolveBookId: (explicitBookId?: string | null) => ResolveBookIdResult;
  navigate?: (path: string) => Promise<void> | void;
  /** 用户当前所在的应用内路径（如 /books/abc）；未接入路由时不提供 */
  getCurrentPath?: () => string | null;
  /** 内核注册的全部工具：需要列出工具的工具（如返回快速上手指南）从这里取，不反过来依赖工具清单 */
  tools: readonly AgentMcpToolSpec[];
}

export interface AgentMcpToolSpec {
  name: string;
  description: string;
  category: AgentMcpToolCategory;
  /** 最低所需权限等级 */
  permission: AgentMcpPermissionMode;
  readOnlyHint: boolean;
  /** 是否仅在 WebMCP 通道暴露（例如 get_workflow_guide） */
  webMcpOnly?: boolean;
  /** 是否要求书库 Store 已加载完成 */
  requiresBookStore?: boolean;
  inputSchema: AgentMcpToolSchema;
  execute: (args: Record<string, unknown>, context: AgentMcpExecutionContext) => unknown;
}

export interface AgentMcpToolDescriptor {
  name: string;
  description: string;
  category: AgentMcpToolCategory;
  permission: AgentMcpPermissionMode;
  readOnlyHint: boolean;
  inputSchema: AgentMcpToolSchema;
}

export interface AgentMcpCallOptions {
  channel: ExternalAgentChannel;
}

export interface AgentMcpCallResult {
  isError: boolean;
  data?: unknown;
  text: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface AgentMcpPromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface AgentMcpPromptDescriptor {
  name: string;
  description: string;
  arguments: AgentMcpPromptArgument[];
}

export interface AgentMcpPromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

export interface AgentMcpPromptResult {
  description: string;
  messages: AgentMcpPromptMessage[];
}

export interface AgentMcpWriteNotification {
  channel: ExternalAgentChannel;
  toolName: string;
  argsSummary: string;
}
