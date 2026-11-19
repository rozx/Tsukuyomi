import type { WebMcpAvailability, WebMcpRuntimeStatus } from 'src/models/agent-mcp';
import type { AgentMcpKernel } from './kernel';
import type { AgentMcpToolSchema } from './types';

export interface WebMcpRegisteredToolDef {
  name: string;
  description: string;
  inputSchema: AgentMcpToolSchema;
  annotations: {
    readOnlyHint: boolean;
  };
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface WebMcpModelContext {
  registerTool: (
    tool: WebMcpRegisteredToolDef,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
  unregisterTool?: (name: string) => void | Promise<void>;
}

export interface WebMcpEnvLike {
  document?: { modelContext?: WebMcpModelContext } | null;
  navigator?: { modelContext?: WebMcpModelContext } | null;
}

export function detectWebMcpHost(env?: WebMcpEnvLike): {
  availability: WebMcpAvailability;
  context: WebMcpModelContext | null;
} {
  const doc = env
    ? env.document
    : typeof document !== 'undefined'
      ? (document as unknown as { modelContext?: WebMcpModelContext })
      : null;
  if (doc?.modelContext && typeof doc.modelContext.registerTool === 'function') {
    return { availability: 'native-document', context: doc.modelContext };
  }
  const nav = env
    ? env.navigator
    : typeof navigator !== 'undefined'
      ? (navigator as unknown as { modelContext?: WebMcpModelContext })
      : null;
  if (nav?.modelContext && typeof nav.modelContext.registerTool === 'function') {
    return { availability: 'native-navigator', context: nav.modelContext };
  }
  return { availability: 'unavailable', context: null };
}

export interface CreateWebMcpAdapterOptions {
  kernel: AgentMcpKernel;
  env?: () => WebMcpEnvLike;
  onStatusChange?: (status: WebMcpRuntimeStatus) => void;
}

export interface WebMcpAdapter {
  sync: (enabled: boolean) => Promise<void>;
  unregisterAll: () => Promise<void>;
  refreshAvailability: () => WebMcpAvailability;
}

export function createWebMcpAdapter(options: CreateWebMcpAdapterOptions): WebMcpAdapter {
  let controller: AbortController | null = null;
  let registeredNames: string[] = [];
  let activeContext: WebMcpModelContext | null = null;
  let lastSyncedSignature: string | null = null;
  let queue: Promise<void> = Promise.resolve();
  let lastStatus: WebMcpRuntimeStatus = {
    availability: 'unavailable',
    registered: false,
    registeredToolNames: [],
    error: null,
  };

  const emitStatus = (next: WebMcpRuntimeStatus): void => {
    lastStatus = {
      ...next,
      registeredToolNames: [...next.registeredToolNames],
    };
    options.onStatusChange?.(lastStatus);
  };

  const getHost = () => detectWebMcpHost(options.env?.());

  const enqueue = (task: () => Promise<void>): Promise<void> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  const performUnregisterAll = async (): Promise<void> => {
    const prevController = controller;
    const prevNames = [...registeredNames];
    const prevContext = activeContext;
    controller = null;
    registeredNames = [];
    activeContext = null;
    lastSyncedSignature = null;

    if (prevController) {
      try {
        prevController.abort();
      } catch {
        // 忽略清理异常
      }
    }

    if (prevContext?.unregisterTool) {
      for (const name of prevNames) {
        try {
          await prevContext.unregisterTool(name);
        } catch {
          // 某些实现已在 abort 时移除，忽略重复注销错误
        }
      }
    }
  };

  const performSync = async (enabled: boolean): Promise<void> => {
    const { availability, context } = getHost();
    const tools = enabled && context ? options.kernel.listTools('webmcp') : [];
    const signature = `${String(enabled)}:${availability}:${tools.map((t) => t.name).join(',')}`;

    // 同一宿主上下文与同一工具集合下跳过重复注销/重注册，避免冗余操作
    if (signature === lastSyncedSignature && context === activeContext) {
      return;
    }

    // 权限切换与重注册前必须先注销全部旧工具，防止同名 registerTool 抛错
    await performUnregisterAll();

    if (!enabled || !context) {
      lastSyncedSignature = signature;
      emitStatus({
        availability,
        registered: false,
        registeredToolNames: [],
        error: null,
      });
      return;
    }

    const nextController = new AbortController();
    const succeeded: string[] = [];
    const errors: string[] = [];

    for (const tool of tools) {
      const def: WebMcpRegisteredToolDef = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: tool.readOnlyHint },
        execute: async (rawArgs: Record<string, unknown>) => {
          const outcome = await options.kernel.callTool(tool.name, rawArgs, {
            channel: 'webmcp',
          });
          return {
            content: [{ type: 'text', text: outcome.text }],
            isError: outcome.isError,
          };
        },
      };

      try {
        await context.registerTool(def, { signal: nextController.signal });
        succeeded.push(tool.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${tool.name}: ${message}`);
      }
    }

    controller = nextController;
    registeredNames = succeeded;
    activeContext = context;
    lastSyncedSignature = errors.length === 0 ? signature : null;

    emitStatus({
      availability,
      registered: succeeded.length > 0,
      registeredToolNames: succeeded,
      error: errors.length > 0 ? errors.join('; ') : null,
    });
  };

  const refreshAvailability = (): WebMcpAvailability => {
    const { availability } = getHost();
    emitStatus({
      ...lastStatus,
      availability,
    });
    return availability;
  };

  return {
    sync: (enabled) => enqueue(() => performSync(enabled)),
    unregisterAll: () => enqueue(performUnregisterAll),
    refreshAvailability,
  };
}
