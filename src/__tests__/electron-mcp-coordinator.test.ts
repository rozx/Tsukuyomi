import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElectronMcpCoordinator } from '../../src-electron/mcp-coordinator';
import {
  DESKTOP_MCP_LONG_OPERATION_TOOLS,
  type DesktopMcpIpcRequest,
  type DesktopMcpServerStatus,
} from 'src/models/desktop-mcp';
import { ALL_AGENT_MCP_TOOLS } from 'src/services/agent-mcp';

describe('Electron MCP IPC Coordinator', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('主进程转发工具请求到渲染进程，丢弃非可信来源响应，并在窗口关闭/缺失/加载中立即返回 -32002', async () => {
    const sentToRenderer: DesktopMcpIpcRequest[] = [];
    const statusEvents: DesktopMcpServerStatus[] = [];
    let currentWindow: {
      isDestroyed: () => boolean;
      webContents: {
        isLoading?: () => boolean;
        send: (ch: string, payload: unknown) => void;
      };
    } | null = {
      isDestroyed: () => false,
      webContents: {
        isLoading: () => false,
        send: (ch, payload) => {
          if (ch === 'agent-mcp:request') sentToRenderer.push(payload as DesktopMcpIpcRequest);
          if (ch === 'agent-mcp:status') statusEvents.push(payload as DesktopMcpServerStatus);
        },
      },
    };

    const coordinator = createElectronMcpCoordinator({
      getWindow: () => currentWindow as never,
      isTrusted: (event) => (event as { trusted?: boolean }).trusted === true,
      version: '0.19.2',
      defaultTimeoutMs: 2000,
    });

    // 非可信来源无法启停服务
    const untrustedStart = await coordinator.handleStart({ trusted: false } as never, {
      port: 0,
      authToken: 'tok',
    });
    expect(untrustedStart.state).toBe('stopped');

    // 可信来源发送请求 -> 非可信响应被忽略 -> 可信响应完成调用
    coordinator.handleRendererReady({ trusted: true } as never);
    const dispatchPromise = coordinator.dispatchToRenderer('tools/list', {});
    expect(sentToRenderer).toHaveLength(1);
    const req = sentToRenderer[0]!;

    coordinator.handleRendererResponse({ trusted: false } as never, {
      requestId: req.requestId,
      result: { tools: ['spoofed'] },
    });

    coordinator.handleRendererResponse({ trusted: true } as never, {
      requestId: req.requestId,
      result: { tools: ['real'] },
    });

    await expect(dispatchPromise).resolves.toEqual({ tools: ['real'] });

    // 窗口关闭时立即以 -32002 结束挂起请求
    const pendingBeforeClose = coordinator.dispatchToRenderer('tools/list', {});
    coordinator.onWindowClosed();
    await expect(pendingBeforeClose).rejects.toThrow(/closed|unavailable/i);

    // 窗口为 null 时直接拒绝
    currentWindow = null;
    await expect(coordinator.dispatchToRenderer('tools/list', {})).rejects.toThrow(/unavailable/i);

    // 渲染进程尚在加载中时立即拒绝（-32002），不等待 60 秒超时
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        isLoading: () => true,
        send: vi.fn(),
      },
    };
    await expect(coordinator.dispatchToRenderer('tools/list', {})).rejects.toThrow(/loading/i);

    await coordinator.dispose();
  });

  it('渲染进程未就绪时立即返回 -32002；仅可信就绪信号生效；渲染进程重载后需重新就绪', async () => {
    const sent: DesktopMcpIpcRequest[] = [];
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {
        isLoading: () => false,
        send: (ch: string, payload: unknown) => {
          if (ch === 'agent-mcp:request') sent.push(payload as DesktopMcpIpcRequest);
        },
      },
    };
    const coordinator = createElectronMcpCoordinator({
      getWindow: () => fakeWindow as never,
      isTrusted: (event) => (event as { trusted?: boolean }).trusted === true,
      version: '0.19.2',
      defaultTimeoutMs: 60_000,
    });

    // 页面已加载完成但 boot 尚未注册监听：不得把请求发给无人接收的渲染进程后等满超时
    await expect(coordinator.dispatchToRenderer('tools/list', {})).rejects.toThrow(/not ready/i);
    expect(sent).toHaveLength(0);

    // 非可信来源的就绪信号被忽略
    coordinator.handleRendererReady({ trusted: false } as never);
    await expect(coordinator.dispatchToRenderer('tools/list', {})).rejects.toThrow(/not ready/i);

    // 可信就绪后正常转发
    coordinator.handleRendererReady({ trusted: true } as never);
    const first = coordinator.dispatchToRenderer('tools/list', {});
    expect(sent).toHaveLength(1);

    // 渲染进程重载/崩溃：结束挂起请求，并回到未就绪状态（旧页面的就绪不得沿用到新页面）
    coordinator.onRendererReset();
    await expect(first).rejects.toThrow(/reload|reset/i);
    await expect(coordinator.dispatchToRenderer('tools/list', {})).rejects.toThrow(/not ready/i);
    expect(sent).toHaveLength(1);

    // 新页面重新就绪后恢复
    coordinator.handleRendererReady({ trusted: true } as never);
    const second = coordinator.dispatchToRenderer('tools/list', {});
    expect(sent).toHaveLength(2);
    coordinator.handleRendererResponse({ trusted: true } as never, {
      requestId: sent[1]!.requestId,
      result: { tools: [] },
    });
    await expect(second).resolves.toEqual({ tools: [] });

    // 关窗同样清除就绪状态
    coordinator.onWindowClosed();
    await expect(coordinator.dispatchToRenderer('tools/list', {})).rejects.toThrow(/not ready/i);

    await coordinator.dispose();
  });

  it('支持运行时动态更新令牌与重启换端口，并在停服时立即终止挂起请求', async () => {
    const startMock = vi.fn((cfg: { port: number; authToken: string }) =>
      Promise.resolve({ state: 'running' as const, port: cfg.port, error: null }),
    );
    const stopMock = vi.fn(() =>
      Promise.resolve({ state: 'stopped' as const, port: null, error: null }),
    );
    const updateAuthTokenMock = vi.fn();
    let status: DesktopMcpServerStatus = { state: 'stopped', port: null, error: null };

    const fakeWindow = {
      isDestroyed: () => false,
      webContents: { isLoading: () => false, send: vi.fn() },
    };

    const coordinator = createElectronMcpCoordinator({
      getWindow: () => fakeWindow as never,
      isTrusted: () => true,
      version: '0.19.2',
      createServer: () => ({
        start: async (cfg) => {
          status = await startMock(cfg);
          return status;
        },
        stop: async () => {
          status = await stopMock();
          return status;
        },
        updateAuthToken: updateAuthTokenMock,
        getStatus: () => status,
        handleRawRequest: vi.fn(),
      }),
    });

    await coordinator.handleStart({} as never, { port: 48321, authToken: 'tok-1' });
    expect(startMock).toHaveBeenCalledTimes(1);

    // 同端口只轮换令牌，不重启监听
    await coordinator.handleUpdateConfig({} as never, { port: 48321, authToken: 'tok-2' });
    expect(updateAuthTokenMock).toHaveBeenCalledWith('tok-2');
    expect(startMock).toHaveBeenCalledTimes(1);

    // 换端口则重启监听
    await coordinator.handleUpdateConfig({} as never, { port: 48322, authToken: 'tok-2' });
    expect(startMock).toHaveBeenCalledTimes(2);

    // 停服时终止挂起请求
    coordinator.handleRendererReady({ trusted: true } as never);
    const pending = coordinator.dispatchToRenderer('tools/list', {});
    await coordinator.handleStop({} as never);
    await expect(pending).rejects.toThrow(/stopped/i);

    await coordinator.dispose();
  });

  it('渲染进程超时会向调用方返回明确超时错误而不挂起', async () => {
    vi.useFakeTimers();
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: { isLoading: () => false, send: vi.fn() },
    };
    const coordinator = createElectronMcpCoordinator({
      getWindow: () => fakeWindow as never,
      isTrusted: () => true,
      version: '0.19.2',
      defaultTimeoutMs: 500,
    });

    coordinator.handleRendererReady({ trusted: true } as never);
    const p = coordinator.dispatchToRenderer('tools/call', { name: 'list_books' });
    const assertion = expect(p).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(600);
    await assertion;

    // 长操作工具（import_book_from_url）使用 longTimeoutMs，超过 defaultTimeoutMs 不提前超时
    const longPromise = coordinator.dispatchToRenderer('tools/call', {
      name: 'import_book_from_url',
    });
    let settled = false;
    void longPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(700);
    expect(settled).toBe(false);

    const longAssertion = expect(longPromise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(200_000);
    await longAssertion;

    await coordinator.dispose();
  });

  it('长操作超时清单中的每个工具名都必须存在于已注册工具集合中', () => {
    const toolNames = new Set(ALL_AGENT_MCP_TOOLS.map((t) => t.name));
    for (const longOpTool of DESKTOP_MCP_LONG_OPERATION_TOOLS) {
      expect(toolNames.has(longOpTool)).toBe(true);
    }
  });
});
