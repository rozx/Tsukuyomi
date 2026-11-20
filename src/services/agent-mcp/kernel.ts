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

/** 排队时最多等前一个调用多久；远小于桌面端 60 秒与中继 65 秒的调用超时 */
const DEFAULT_WRITE_QUEUE_MAX_WAIT_MS = 15_000;

export function isToolAllowedByPermission(
  required: AgentMcpPermissionMode,
  current: AgentMcpPermissionMode,
): boolean {
  return (
    AGENT_MCP_PERMISSION_MODES.indexOf(current) >= AGENT_MCP_PERMISSION_MODES.indexOf(required)
  );
}

/** 把一个对象的前几个字段压成一行：数组给出条数，字符串截断，嵌套对象不展开 */
function summarizeRecord(record: Record<string, unknown>, maxEntries: number): string {
  const entries = Object.entries(record);
  const parts: string[] = [];
  for (const [key, value] of entries.slice(0, maxEntries)) {
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
  if (entries.length > maxEntries) parts.push(`+${entries.length - maxEntries}`);
  return parts.join(', ');
}

/** 调用参数的一行摘要；没有参数时为空字符串，由界面显示「无参数」 */
function summarizeArgs(args: Record<string, unknown>): string {
  return summarizeRecord(args, 4);
}

/** 返回结果的一行摘要；没有返回值时为 undefined */
function summarizeResult(output: unknown): string | undefined {
  if (output === undefined || output === null) return undefined;
  if (Array.isArray(output)) return `[${output.length}]`;
  if (typeof output === 'object') {
    return summarizeRecord(output as Record<string, unknown>, 6) || undefined;
  }
  if (typeof output !== 'string' && typeof output !== 'number' && typeof output !== 'boolean') {
    return undefined;
  }
  const text = String(output).replace(/\s+/g, ' ').trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text || undefined;
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
  getCurrentPath?: () => string | null;
  /** 按书排队的写入最多等前一个调用多久（毫秒），测试用 */
  writeQueueMaxWaitMs?: number;
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

  /**
   * 标记了 serializeWritesPerBook 的工具对同一本书按调用顺序一个接一个执行（整个 execute，
   * 包括写入前读取的快照）：Agent 并发提交同一章的多批译文时，每次写入后的书库刷新与返回的
   * 剩余计数都按顺序反映前面的写入。前一个调用迟迟不结束时最多等 writeQueueMaxWaitMs，
   * 之后照常执行（存储层本身能处理并发写入），避免一个卡住的调用堵住这本书之后的所有写入。
   */
  const writeQueueMaxWaitMs = options.writeQueueMaxWaitMs ?? DEFAULT_WRITE_QUEUE_MAX_WAIT_MS;
  const writeQueues = new Map<string, Promise<unknown>>();
  const waitAtMost = (previous: Promise<unknown>): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, writeQueueMaxWaitMs);
      void previous.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  const runInBookOrder = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = writeQueues.get(key);
    const run = previous ? waitAtMost(previous).then(task) : task();
    const tail = run.catch(() => undefined);
    writeQueues.set(key, tail);
    void tail.then(() => {
      if (writeQueues.get(key) === tail) writeQueues.delete(key);
    });
    return run;
  };

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

    const record = (
      status: AgentMcpActivityStatus,
      detail: { errorMessage?: string; resultSummary?: string | undefined } = {},
    ): void => {
      options.onRecordActivity?.({
        channel: callOptions.channel,
        toolName,
        argsSummary,
        status,
        durationMs: Date.now() - startedAt,
        ...(detail.errorMessage ? { errorMessage: detail.errorMessage } : {}),
        ...(detail.resultSummary ? { resultSummary: detail.resultSummary } : {}),
      });
    };

    const fail = (
      status: Exclude<AgentMcpActivityStatus, 'success'>,
      code: string,
      message: string,
      details?: Record<string, unknown>,
    ): AgentMcpCallResult => {
      record(status, { errorMessage: message });
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
      tools: options.tools,
      ...(options.navigate ? { navigate: options.navigate } : {}),
      ...(options.getCurrentPath ? { getCurrentPath: options.getCurrentPath } : {}),
    };

    try {
      const execute = () => Promise.resolve(spec.execute(args, execContext));
      const bookKey = resolveBookId(args.book_id as string | undefined);
      const output =
        spec.serializeWritesPerBook && bookKey.ok
          ? await runInBookOrder(bookKey.bookId, execute)
          : await execute();
      if (isAgentMcpToolError(output)) {
        return fail('error', output.code, output.message, output.details);
      }

      const payload = { ok: true, result: output };
      record('success', { resultSummary: summarizeResult(output) });

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
