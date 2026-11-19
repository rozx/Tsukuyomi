import type {
  AgentMcpActivityStatus,
  ExternalAgentChannel,
  RecordAgentMcpActivityInput,
} from 'src/models/agent-mcp';
import { AGENT_MCP_PERMISSION_MODES, type AgentMcpPermissionMode } from 'src/models/settings';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import {
  agentMcpError,
  isAgentMcpToolError,
  type AgentMcpCallOptions,
  type AgentMcpCallResult,
  type AgentMcpExecutionContext,
  type AgentMcpPromptDescriptor,
  type AgentMcpPromptResult,
  type AgentMcpToolDescriptor,
  type AgentMcpToolSpec,
  type AgentMcpWriteNotification,
  type ResolveBookIdResult,
} from './types';
import { getAgentMcpPrompt, listAgentMcpPrompts } from './prompts';

export function isToolAllowedByPermission(
  required: AgentMcpPermissionMode,
  current: AgentMcpPermissionMode,
): boolean {
  return (
    AGENT_MCP_PERMISSION_MODES.indexOf(current) >= AGENT_MCP_PERMISSION_MODES.indexOf(required)
  );
}

function summarizeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '{}';
  const parts: string[] = [];
  for (const [key, value] of entries.slice(0, 4)) {
    if (Array.isArray(value)) {
      parts.push(`${key}=[${value.length}]`);
    } else if (typeof value === 'string') {
      const compact = value.replace(/\s+/g, ' ').trim();
      parts.push(`${key}=${compact.length > 24 ? `${compact.slice(0, 24)}…` : compact}`);
    } else if (value !== null && typeof value === 'object') {
      parts.push(`${key}={…}`);
    } else {
      parts.push(`${key}=${String(value)}`);
    }
  }
  if (entries.length > 4) parts.push(`+${entries.length - 4}`);
  return parts.join(', ');
}

function toDescriptor(spec: AgentMcpToolSpec): AgentMcpToolDescriptor {
  return {
    name: spec.name,
    description: spec.description,
    category: spec.category,
    permission: spec.permission,
    readOnlyHint: spec.readOnlyHint,
    inputSchema: spec.inputSchema,
  };
}

export interface CreateAgentMcpKernelOptions {
  tools: readonly AgentMcpToolSpec[];
  onRecordActivity?: (entry: RecordAgentMcpActivityInput) => void;
  onWriteNotify?: (info: AgentMcpWriteNotification) => void;
  navigate?: (path: string) => Promise<void> | void;
}

export interface AgentMcpKernel {
  listTools: (channel: ExternalAgentChannel) => AgentMcpToolDescriptor[];
  listPrompts: () => AgentMcpPromptDescriptor[];
  getPrompt: (
    name: string,
    args?: Record<string, string | undefined>,
  ) => AgentMcpPromptResult | null;
  callTool: (
    toolName: string,
    rawArgs: Record<string, unknown> | undefined,
    options: AgentMcpCallOptions,
  ) => Promise<AgentMcpCallResult>;
}

export function createAgentMcpKernel(options: CreateAgentMcpKernelOptions): AgentMcpKernel {
  const toolMap = new Map<string, AgentMcpToolSpec>();
  for (const tool of options.tools) {
    toolMap.set(tool.name, tool);
  }

  const getCurrentConfig = () => useSettingsStore().agentMcp;

  const listTools = (channel: ExternalAgentChannel): AgentMcpToolDescriptor[] => {
    const mode = getCurrentConfig().permissionMode;
    return options.tools
      .filter(
        (tool) =>
          (!tool.webMcpOnly || channel === 'webmcp') &&
          isToolAllowedByPermission(tool.permission, mode),
      )
      .map(toDescriptor);
  };

  const resolveBookId = (explicitBookId?: string | null): ResolveBookIdResult => {
    const explicit = typeof explicitBookId === 'string' ? explicitBookId.trim() : '';
    if (explicit) {
      return { ok: true, bookId: explicit };
    }
    const current = useContextStore().currentBookId?.trim() ?? '';
    if (current) {
      return { ok: true, bookId: current };
    }
    return {
      ok: false,
      error: agentMcpError(
        'BOOK_ID_REQUIRED',
        'Missing book_id and no book is currently open. Call list_books first or provide book_id explicitly.',
      ),
    };
  };

  const buildErrorResult = (
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ): AgentMcpCallResult => {
    const payload = {
      ok: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    };
    return {
      isError: true,
      data: payload,
      text: JSON.stringify(payload),
      errorCode: code,
      errorMessage: message,
    };
  };

  const callTool = async (
    toolName: string,
    rawArgs: Record<string, unknown> | undefined,
    callOptions: AgentMcpCallOptions,
  ): Promise<AgentMcpCallResult> => {
    const startedAt = Date.now();
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    const argsSummary = summarizeArgs(args);

    const record = (status: AgentMcpActivityStatus, errorMessage?: string): void => {
      options.onRecordActivity?.({
        channel: callOptions.channel,
        toolName,
        argsSummary,
        status,
        durationMs: Date.now() - startedAt,
        ...(errorMessage ? { errorMessage } : {}),
      });
    };

    const fail = (
      status: Exclude<AgentMcpActivityStatus, 'success'>,
      code: string,
      message: string,
      details?: Record<string, unknown>,
    ): AgentMcpCallResult => {
      record(status, message);
      return buildErrorResult(code, message, details);
    };

    const spec = toolMap.get(toolName);
    if (!spec || (spec.webMcpOnly && callOptions.channel !== 'webmcp')) {
      return fail('error', 'UNKNOWN_TOOL', `Unknown tool: ${toolName}`);
    }

    const config = getCurrentConfig();
    if (!isToolAllowedByPermission(spec.permission, config.permissionMode)) {
      const message =
        spec.permission === 'full'
          ? `Tool "${toolName}" requires permission mode "full" (current: "${config.permissionMode}").`
          : `Tool "${toolName}" is not permitted in "${config.permissionMode}" mode (requires "${spec.permission}").`;
      return fail('denied', 'PERMISSION_DENIED', message, {
        required_permission: spec.permission,
        current_permission: config.permissionMode,
      });
    }

    if (spec.requiresBookStore !== false && !useBooksStore().isLoaded) {
      return fail(
        'error',
        'NOT_READY',
        'Book library is not loaded yet. Please retry after startup finishes.',
      );
    }

    const execContext: AgentMcpExecutionContext = {
      channel: callOptions.channel,
      permissionMode: config.permissionMode,
      defaultWriteMode: config.defaultWriteMode,
      resolveBookId,
      ...(options.navigate ? { navigate: options.navigate } : {}),
    };

    try {
      const output = await spec.execute(args, execContext);
      if (isAgentMcpToolError(output)) {
        return fail('error', output.code, output.message, output.details);
      }

      const payload = { ok: true, result: output };
      record('success');

      if (!spec.readOnlyHint && config.notifyOnWrite && options.onWriteNotify) {
        try {
          options.onWriteNotify({
            channel: callOptions.channel,
            toolName,
            argsSummary,
          });
        } catch {
          // 通知异常不得影响工具返回值
        }
      }

      return {
        isError: false,
        data: output,
        text: JSON.stringify(payload),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail('error', 'TOOL_EXECUTION_ERROR', message);
    }
  };

  return {
    listTools,
    listPrompts: listAgentMcpPrompts,
    getPrompt: getAgentMcpPrompt,
    callTool,
  };
}
