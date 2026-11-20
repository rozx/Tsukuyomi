import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import { useAgentMcpStore } from 'src/stores/agent-mcp';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpContextTools } from 'src/services/agent-mcp/tools/context';
import { agentMcpLibraryTools } from 'src/services/agent-mcp/tools/library';
import { createDesktopMcpBridge } from 'src/services/agent-mcp/desktop-bridge';
import type {
  DesktopMcpAPI,
  DesktopMcpIpcRequest,
  DesktopMcpIpcResponse,
  DesktopMcpServerStatus,
} from 'src/models/desktop-mcp';

describe('Renderer desktop-mcp bridge', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useAgentMcpStore().clearActivities();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('消费 IPC 请求并调用共享工具内核回传结果与同步状态', async () => {
    const callbacks: {
      request: ((req: DesktopMcpIpcRequest) => void) | null;
      status: ((status: DesktopMcpServerStatus) => void) | null;
    } = { request: null, status: null };
    const responses: DesktopMcpIpcResponse[] = [];

    const mockApi: DesktopMcpAPI = {
      start: vi.fn((cfg) =>
        Promise.resolve({ state: 'running' as const, port: cfg.port, error: null }),
      ),
      stop: vi.fn(() => Promise.resolve({ state: 'stopped' as const, port: null, error: null })),
      updateConfig: vi.fn((cfg) =>
        Promise.resolve({ state: 'running' as const, port: cfg.port, error: null }),
      ),
      getStatus: vi.fn(() =>
        Promise.resolve({ state: 'stopped' as const, port: null, error: null }),
      ),
      onStatus: (cb) => {
        callbacks.status = cb;
        return () => {
          callbacks.status = null;
        };
      },
      onRequest: (cb) => {
        callbacks.request = cb;
        return () => {
          callbacks.request = null;
        };
      },
      sendResponse: (res) => {
        responses.push(res);
      },
      notifyReady: vi.fn(() => {
        // 就绪信号必须在请求监听注册之后发出
        expect(callbacks.request).not.toBeNull();
      }),
    };

    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
    });
    const bridge = createDesktopMcpBridge({
      api: mockApi,
      kernel,
      onStatusChange: (status) => useAgentMcpStore().setDesktopServerStatus(status),
    });
    bridge.mount();
    expect(mockApi.notifyReady).toHaveBeenCalledTimes(1);

    // 同步状态推送到回调
    callbacks.status?.({ state: 'running', port: 48321, error: null });
    expect(useAgentMcpStore().desktopServerStatus).toEqual({
      state: 'running',
      port: 48321,
      error: null,
    });

    // tools/list
    callbacks.request?.({ requestId: 'req-1', method: 'tools/list', params: {} });
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    expect(responses[0]?.requestId).toBe('req-1');
    expect(Array.isArray((responses[0]?.result as { tools?: unknown[] })?.tools)).toBe(true);

    // tools/call
    callbacks.request?.({
      requestId: 'req-2',
      method: 'tools/call',
      params: { name: 'list_books', arguments: {} },
    });
    await vi.waitFor(() => expect(responses).toHaveLength(2));
    expect((responses[1]?.result as { isError: boolean }).isError).toBe(false);

    // prompts/get
    callbacks.request?.({
      requestId: 'req-3',
      method: 'prompts/get',
      params: { name: 'translate-chapter', arguments: { chapter_id: 'ch-1' } },
    });
    await vi.waitFor(() => expect(responses).toHaveLength(3));
    expect(
      (responses[2]?.result as { messages?: Array<{ content: { text: string } }> })?.messages?.[0]
        ?.content.text,
    ).toContain('ch-1');

    bridge.dispose();
  });
});
