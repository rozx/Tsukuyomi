import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import { useAgentMcpStore } from 'src/stores/agent-mcp';
import { useToastHistoryStore } from 'src/stores/toast-history';
import { getAgentMcpKernel } from 'src/services/agent-mcp';
import { startAgentMcpRuntime } from 'src/services/agent-mcp/runtime';
import type { DesktopMcpAPI } from 'src/models/desktop-mcp';

const { platformState } = vi.hoisted(() => ({
  platformState: { isElectron: false },
}));

vi.mock('src/utils/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isElectron: () => platformState.isElectron,
}));

function createMockDesktopApi(): DesktopMcpAPI {
  return {
    start: vi.fn((cfg) =>
      Promise.resolve({ state: 'running' as const, port: cfg.port, error: null }),
    ),
    stop: vi.fn(() => Promise.resolve({ state: 'stopped' as const, port: null, error: null })),
    updateConfig: vi.fn((cfg) =>
      Promise.resolve({ state: 'running' as const, port: cfg.port, error: null }),
    ),
    getStatus: vi.fn(() => Promise.resolve({ state: 'stopped' as const, port: null, error: null })),
    onStatus: vi.fn(() => () => undefined),
    onRequest: vi.fn(() => () => undefined),
    sendResponse: vi.fn(),
    notifyReady: vi.fn(),
  };
}

describe('Agent MCP boot/runtime lifecycle', () => {
  beforeEach(async () => {
    platformState.isElectron = false;
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useAgentMcpStore().clearActivities();
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });

  let disposeBoot: (() => void) | null = null;

  afterEach(() => {
    disposeBoot?.();
    disposeBoot = null;
    delete (document as unknown as { modelContext?: unknown }).modelContext;
    vi.restoreAllMocks();
  });

  it('默认关闭时不启动桌面服务端，也不注册 WebMCP 工具', async () => {
    const mockApi = createMockDesktopApi();
    const registerTool = vi.fn();

    const webRuntime = await startAgentMcpRuntime({
      isElectronEnv: false,
      webMcpEnv: () => ({ document: { modelContext: { registerTool } }, navigator: {} }),
      onWebMcpStatusChange: (s) => useAgentMcpStore().setWebMcpStatus(s),
    });
    expect(registerTool).not.toHaveBeenCalled();
    webRuntime.dispose();

    const desktopRuntime = await startAgentMcpRuntime({
      isElectronEnv: true,
      desktopApi: mockApi,
      webMcpEnv: () => ({ document: { modelContext: { registerTool } }, navigator: {} }),
      onDesktopStatusChange: (s) => useAgentMcpStore().setDesktopServerStatus(s),
    });
    expect(mockApi.start).not.toHaveBeenCalled();
    expect(registerTool).not.toHaveBeenCalled();
    desktopRuntime.dispose();
  });

  it('Web 端开启 webMcpEnabled 后自动恢复注册，卸载时清理', async () => {
    await useSettingsStore().updateAgentMcpSettings({ webMcpEnabled: true });
    const registerTool = vi.fn();
    const unregisterTool = vi.fn();

    const runtime = await startAgentMcpRuntime({
      isElectronEnv: false,
      webMcpEnv: () => ({
        document: { modelContext: { registerTool, unregisterTool } },
        navigator: {},
      }),
      onWebMcpStatusChange: (s) => useAgentMcpStore().setWebMcpStatus(s),
    });
    expect(registerTool).toHaveBeenCalled();
    expect(useAgentMcpStore().webMcpStatus.registered).toBe(true);

    runtime.dispose();
    await vi.waitFor(() => expect(unregisterTool).toHaveBeenCalled());
  });

  it('Electron 端开启 desktopServerEnabled 后自动恢复服务端且始终跳过 WebMCP 注册', async () => {
    const settings = useSettingsStore();
    const token = await settings.regenerateAgentMcpAuthToken();
    await settings.updateAgentMcpSettings({
      desktopServerEnabled: true,
      desktopPort: 48322,
      webMcpEnabled: true, // 即便配置里为 true，Electron 端也绝不注册 WebMCP
    });

    const mockApi = createMockDesktopApi();
    const registerTool = vi.fn();

    const runtime = await startAgentMcpRuntime({
      isElectronEnv: true,
      desktopApi: mockApi,
      webMcpEnv: () => ({ document: { modelContext: { registerTool } }, navigator: {} }),
      onDesktopStatusChange: (s) => useAgentMcpStore().setDesktopServerStatus(s),
    });

    expect(mockApi.start).toHaveBeenCalledWith({ port: 48322, authToken: token });
    expect(registerTool).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('boot 入口响应式监听 webMcpEnabled 与 permissionMode 变更、写操作弹 Toast 并转发路由导航', async () => {
    const registered = new Map<string, unknown>();
    const registerTool = vi.fn((tool: { name: string }, opts?: { signal?: AbortSignal }) => {
      registered.set(tool.name, tool);
      opts?.signal?.addEventListener('abort', () => {
        registered.delete(tool.name);
      });
    });
    (document as unknown as { modelContext?: unknown }).modelContext = { registerTool };

    const toastAdd = vi.fn();
    const routerPush = vi.fn(() => Promise.resolve());
    const toastHistorySpy = vi
      .spyOn(useToastHistoryStore(), 'addToHistory')
      .mockResolvedValue(undefined as never);

    const { initAgentMcpBoot } = await import('src/boot/agent-mcp');
    disposeBoot = await initAgentMcpBoot({
      app: { config: { globalProperties: { $toast: { add: toastAdd } } } },
      router: { push: routerPush, currentRoute: { value: { path: '/mcp' } } },
    });

    // 初始关闭：不应注册任何工具
    await nextTick();
    await vi.waitFor(() => {
      expect(useAgentMcpStore().webMcpStatus.availability).toBe('native-document');
    });
    expect(registered.size).toBe(0);

    // 1. 开启 webMcpEnabled -> boot 的 Vue watch 自动触发重注册
    const settings = useSettingsStore();
    await settings.updateAgentMcpSettings({ webMcpEnabled: true });
    await vi.waitFor(() => {
      expect(registered.has('create_book')).toBe(true);
    });

    // 2. 切换 permissionMode 为 read_only -> boot 的 watch 自动收窄工具集合
    await settings.updateAgentMcpSettings({ permissionMode: 'read_only' });
    await vi.waitFor(() => {
      expect(registered.has('create_book')).toBe(false);
      expect(registered.has('list_books')).toBe(true);
    });

    // 3. 切回 translate_and_edit 并执行写操作 -> boot 接线触发 Toast + 历史记录 + 路由导航 + 活动日志
    await settings.updateAgentMcpSettings({ permissionMode: 'translate_and_edit' });
    const kernel = getAgentMcpKernel();
    const navRes = await kernel.callTool('navigate_to', { target: 'books' }, { channel: 'webmcp' });
    expect(navRes.isError).toBe(false);
    expect(routerPush).toHaveBeenCalledWith('/books');
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'info',
        detail: expect.stringContaining('WebMCP'),
      }),
    );
    expect(toastHistorySpy).toHaveBeenCalled();
    expect(useAgentMcpStore().activities[0]?.toolName).toBe('navigate_to');

    // boot 把路由的当前路径接给 get_app_context，外部 Agent 能知道用户在哪个页面
    const ctxRes = await kernel.callTool('get_app_context', {}, { channel: 'webmcp' });
    expect((ctxRes.data as { page: { kind: string } }).page.kind).toBe('agent_mcp');

    // 清理：关闭开关并触发同步释放
    await settings.updateAgentMcpSettings({ webMcpEnabled: false });
    await vi.waitFor(() => expect(registered.size).toBe(0));
  });
});
