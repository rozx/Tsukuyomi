import { randomUUID } from 'node:crypto';
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import {
  DESKTOP_MCP_LONG_OPERATION_TOOLS,
  type DesktopMcpIpcRequest,
  type DesktopMcpIpcResponse,
  type DesktopMcpMethod,
  type DesktopMcpServerStatus,
  type DesktopMcpStartConfig,
} from '../src/models/desktop-mcp';
import {
  McpJsonRpcError,
  createElectronMcpServer,
  type ElectronMcpServerInstance,
} from './mcp-server';

const DEFAULT_TIMEOUT_MS = 60_000;
const LONG_OPERATION_TIMEOUT_MS = 180_000;
const LONG_OPERATION_TOOLS = new Set<string>(DESKTOP_MCP_LONG_OPERATION_TOOLS);

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CreateElectronMcpCoordinatorOptions {
  getWindow: () => BrowserWindow | null;
  isTrusted: (event: IpcMainInvokeEvent | IpcMainEvent, window: BrowserWindow | null) => boolean;
  version: string;
  defaultTimeoutMs?: number;
  longTimeoutMs?: number;
  createServer?: typeof createElectronMcpServer;
}

export interface ElectronMcpCoordinator {
  handleStart: (
    event: IpcMainInvokeEvent,
    config: DesktopMcpStartConfig,
  ) => Promise<DesktopMcpServerStatus>;
  handleStop: (event: IpcMainInvokeEvent) => Promise<DesktopMcpServerStatus>;
  handleUpdateConfig: (
    event: IpcMainInvokeEvent,
    config: DesktopMcpStartConfig,
  ) => Promise<DesktopMcpServerStatus>;
  handleGetStatus: (event: IpcMainInvokeEvent) => DesktopMcpServerStatus;
  handleRendererResponse: (event: IpcMainEvent, response: DesktopMcpIpcResponse) => void;
  /** 渲染进程已注册请求监听 */
  handleRendererReady: (event: IpcMainEvent) => void;
  dispatchToRenderer: (
    method: DesktopMcpMethod,
    params: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  onWindowClosed: () => void;
  /** 主框架重新加载、跨文档导航或渲染进程崩溃：旧页面的就绪状态与挂起请求全部作废 */
  onRendererReset: () => void;
  dispose: () => Promise<void>;
}

export function createElectronMcpCoordinator(
  options: CreateElectronMcpCoordinatorOptions,
): ElectronMcpCoordinator {
  const defaultTimeout = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const longTimeout = options.longTimeoutMs ?? LONG_OPERATION_TIMEOUT_MS;
  const pending = new Map<string, PendingRequest>();
  // 页面加载完成不代表 boot 已注册请求监听；只有收到可信就绪信号后才转发
  let rendererReady = false;

  const sendToWindow = (channel: string, payload: unknown): boolean => {
    const window = options.getWindow();
    if (!window || window.isDestroyed()) return false;
    window.webContents.send(channel, payload);
    return true;
  };

  const rejectAllPending = (reason: string): void => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new McpJsonRpcError(-32002, reason, 200));
      pending.delete(id);
    }
  };

  const dispatchToRenderer = (
    method: DesktopMcpMethod,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const window = options.getWindow();
    if (!window || window.isDestroyed() || window.webContents?.isDestroyed?.()) {
      return Promise.reject(new McpJsonRpcError(-32002, 'Renderer window is unavailable.', 200));
    }
    if (window.webContents?.isLoading?.()) {
      return Promise.reject(new McpJsonRpcError(-32002, 'Renderer window is still loading.', 200));
    }
    if (!rendererReady) {
      return Promise.reject(new McpJsonRpcError(-32002, 'Renderer is not ready yet.', 200));
    }

    const requestId = randomUUID();
    const isLongOp =
      method === 'tools/call' &&
      typeof params.name === 'string' &&
      LONG_OPERATION_TOOLS.has(params.name);
    const timeoutMs = isLongOp ? longTimeout : defaultTimeout;

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new McpJsonRpcError(-32002, `MCP renderer call timed out after ${timeoutMs}ms.`, 200),
        );
      }, timeoutMs);

      pending.set(requestId, { resolve, reject, timer });

      const request: DesktopMcpIpcRequest = {
        requestId,
        method,
        params,
      };
      if (!sendToWindow('agent-mcp:request', request)) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(new McpJsonRpcError(-32002, 'Renderer window is unavailable.', 200));
      }
    });
  };

  const serverFactory = options.createServer ?? createElectronMcpServer;
  const server: ElectronMcpServerInstance = serverFactory({
    version: options.version,
    dispatch: dispatchToRenderer,
    onStatusChange: (nextStatus) => {
      sendToWindow('agent-mcp:status', nextStatus);
    },
  });

  const handleStart = async (
    event: IpcMainInvokeEvent,
    config: DesktopMcpStartConfig,
  ): Promise<DesktopMcpServerStatus> => {
    if (!options.isTrusted(event, options.getWindow())) {
      return server.getStatus();
    }
    return server.start(config);
  };

  const handleStop = async (event: IpcMainInvokeEvent): Promise<DesktopMcpServerStatus> => {
    if (!options.isTrusted(event, options.getWindow())) {
      return server.getStatus();
    }
    rejectAllPending('Local MCP server stopped.');
    return server.stop();
  };

  const handleUpdateConfig = async (
    event: IpcMainInvokeEvent,
    config: DesktopMcpStartConfig,
  ): Promise<DesktopMcpServerStatus> => {
    if (!options.isTrusted(event, options.getWindow())) {
      return server.getStatus();
    }
    // 是否需要重启由服务在轮到这次更新时决定：这里按调用那一刻的状态判断的话，
    // 服务还在启动时会拿到过时的状态，端口变化也会被忽略
    return server.applyConfig(config);
  };

  const handleGetStatus = (event: IpcMainInvokeEvent): DesktopMcpServerStatus => {
    if (!options.isTrusted(event, options.getWindow())) {
      return { state: 'stopped', port: null, error: null };
    }
    return server.getStatus();
  };

  const handleRendererResponse = (event: IpcMainEvent, response: DesktopMcpIpcResponse): void => {
    if (!options.isTrusted(event, options.getWindow())) return;
    if (!response?.requestId) return;
    const entry = pending.get(response.requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(response.requestId);
    if (response.error) {
      entry.reject(new McpJsonRpcError(response.error.code, response.error.message, 200));
    } else {
      entry.resolve(response.result ?? {});
    }
  };

  const handleRendererReady = (event: IpcMainEvent): void => {
    if (!options.isTrusted(event, options.getWindow())) return;
    rendererReady = true;
  };

  const onWindowClosed = (): void => {
    rendererReady = false;
    rejectAllPending('Renderer window closed while handling MCP request.');
  };

  const onRendererReset = (): void => {
    rendererReady = false;
    rejectAllPending('Renderer reloaded while handling MCP request.');
  };

  const dispose = async (): Promise<void> => {
    rejectAllPending('Application shutting down.');
    await server.stop();
  };

  return {
    handleStart,
    handleStop,
    handleUpdateConfig,
    handleGetStatus,
    handleRendererResponse,
    handleRendererReady,
    dispatchToRenderer,
    onWindowClosed,
    onRendererReset,
    dispose,
  };
}
