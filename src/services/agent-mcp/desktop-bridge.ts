import type {
  DesktopMcpAPI,
  DesktopMcpIpcRequest,
  DesktopMcpServerStatus,
  DesktopMcpStartConfig,
} from 'src/models/desktop-mcp';
import type { AgentMcpKernel } from './kernel';

export interface CreateDesktopMcpBridgeOptions {
  api: DesktopMcpAPI;
  kernel: AgentMcpKernel;
  onStatusChange?: (status: DesktopMcpServerStatus) => void;
}

export interface DesktopMcpBridge {
  mount: () => void;
  dispose: () => void;
  start: (config: DesktopMcpStartConfig) => Promise<DesktopMcpServerStatus>;
  stop: () => Promise<DesktopMcpServerStatus>;
  updateConfig: (config: DesktopMcpStartConfig) => Promise<DesktopMcpServerStatus>;
  syncStatus: () => Promise<DesktopMcpServerStatus>;
}

export function createDesktopMcpBridge(options: CreateDesktopMcpBridgeOptions): DesktopMcpBridge {
  let cleanupStatus: (() => void) | null = null;
  let cleanupRequest: (() => void) | null = null;

  const notifyStatus = (status: DesktopMcpServerStatus): DesktopMcpServerStatus => {
    options.onStatusChange?.(status);
    return status;
  };

  const runStatusCommand = async (
    action: () => Promise<DesktopMcpServerStatus>,
  ): Promise<DesktopMcpServerStatus> => notifyStatus(await action());

  const handleRequest = async (req: DesktopMcpIpcRequest): Promise<void> => {
    try {
      if (req.method === 'tools/list') {
        const tools = options.kernel.listTools('desktop-mcp').map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: tool.readOnlyHint },
        }));
        options.api.sendResponse({ requestId: req.requestId, result: { tools } });
        return;
      }

      if (req.method === 'tools/call') {
        const toolName = typeof req.params.name === 'string' ? req.params.name : '';
        const rawArgs =
          req.params.arguments && typeof req.params.arguments === 'object'
            ? (req.params.arguments as Record<string, unknown>)
            : {};
        const outcome = await options.kernel.callTool(toolName, rawArgs, {
          channel: 'desktop-mcp',
        });
        options.api.sendResponse({
          requestId: req.requestId,
          result: {
            content: [{ type: 'text', text: outcome.text }],
            isError: outcome.isError,
          },
        });
        return;
      }

      if (req.method === 'prompts/list') {
        options.api.sendResponse({
          requestId: req.requestId,
          result: { prompts: options.kernel.listPrompts() },
        });
        return;
      }

      if (req.method === 'prompts/get') {
        const promptName = typeof req.params.name === 'string' ? req.params.name : '';
        const promptArgs =
          req.params.arguments && typeof req.params.arguments === 'object'
            ? (req.params.arguments as Record<string, string | undefined>)
            : {};
        const prompt = options.kernel.getPrompt(promptName, promptArgs);
        if (!prompt) {
          options.api.sendResponse({
            requestId: req.requestId,
            error: { code: -32602, message: `Unknown prompt: ${promptName}` },
          });
          return;
        }
        options.api.sendResponse({
          requestId: req.requestId,
          result: {
            description: prompt.description,
            messages: prompt.messages,
          },
        });
        return;
      }

      options.api.sendResponse({
        requestId: req.requestId,
        error: { code: -32601, message: `Unsupported MCP method: ${String(req.method)}` },
      });
    } catch (error) {
      options.api.sendResponse({
        requestId: req.requestId,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  const mount = (): void => {
    dispose();
    cleanupStatus = options.api.onStatus((status) => {
      notifyStatus(status);
    });
    cleanupRequest = options.api.onRequest((req) => {
      void handleRequest(req);
    });
    // 监听注册完成后才告知主进程可以转发请求
    options.api.notifyReady();
  };

  const dispose = (): void => {
    cleanupStatus?.();
    cleanupStatus = null;
    cleanupRequest?.();
    cleanupRequest = null;
  };

  return {
    mount,
    dispose,
    start: (config) => runStatusCommand(() => options.api.start(config)),
    stop: () => runStatusCommand(() => options.api.stop()),
    updateConfig: (config) => runStatusCommand(() => options.api.updateConfig(config)),
    syncStatus: () => runStatusCommand(() => options.api.getStatus()),
  };
}
