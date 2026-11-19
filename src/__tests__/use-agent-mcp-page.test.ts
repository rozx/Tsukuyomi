import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import { useAgentMcpStore } from 'src/stores/agent-mcp';
import {
  injectAgentMcpPage,
  provideAgentMcpPage,
  type AgentMcpPageContext,
} from 'src/composables/agent-mcp-page/useAgentMcpPage';

const { toastAdd, platformState } = vi.hoisted(() => ({
  toastAdd: vi.fn(),
  platformState: { isElectron: false },
}));
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: toastAdd }),
}));
vi.mock('src/utils/platform', () => ({
  isElectron: () => platformState.isElectron,
}));

describe('useAgentMcpPage composable', () => {
  beforeEach(async () => {
    toastAdd.mockClear();
    platformState.isElectron = false;
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useAgentMcpStore().clearActivities();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountHarness() {
    let captured!: AgentMcpPageContext;
    const variant = ref<'desktop' | 'mobile'>('desktop');

    const ChildA = defineComponent({
      setup() {
        captured = injectAgentMcpPage();
        return () => h('div', { 'data-variant': 'desktop' });
      },
    });
    const ChildB = defineComponent({
      setup() {
        captured = injectAgentMcpPage();
        return () => h('div', { 'data-variant': 'mobile' });
      },
    });
    const Parent = defineComponent({
      setup() {
        provideAgentMcpPage();
        return () => h(variant.value === 'desktop' ? ChildA : ChildB);
      },
    });

    const el = document.createElement('div');
    const app = createApp(Parent);
    app.mount(el);
    return {
      unmount: () => app.unmount(),
      variant,
      getCtx: () => captured,
    };
  }

  it('桌面端动态生成包含实时端口与令牌的配置片段，不展示 WebMCP 开关；跨断点切换保持状态', async () => {
    platformState.isElectron = true;
    const settings = useSettingsStore();
    await settings.setUiLocale('zh-CN');
    const token1 = await settings.regenerateAgentMcpAuthToken();
    await settings.updateAgentMcpSettings({ desktopPort: 49123 });

    const { unmount, variant, getCtx } = mountHarness();
    const ctx = getCtx();

    expect(ctx.isElectronEnv.value).toBe(true);
    expect(ctx.metrics.value).toHaveLength(4);
    expect(ctx.connectTabs.value).toEqual(['claude-code', 'pi', 'antigravity']);
    expect(ctx.prompts.value[0]?.displayDescription).toContain('按块拉取');
    expect(
      ctx.exposedTools.value.find((t) => t.name === 'list_books')?.displayDescription,
    ).toContain('书库');

    expect(ctx.activeSnippet.value).toContain('http://127.0.0.1:49123/mcp');
    expect(ctx.activeSnippet.value).toContain(token1);

    // 切到 Pi 标签页、填搜索词、修改端口草稿，然后切换断点验证状态保持
    ctx.activeConnectTab.value = 'pi';
    ctx.toolSearchQuery.value = 'translation';
    ctx.portDraft.value = 49999;

    variant.value = 'mobile';
    await nextTick();

    const ctxAfterSwitch = getCtx();
    expect(ctxAfterSwitch.activeConnectTab.value).toBe('pi');
    expect(ctxAfterSwitch.toolSearchQuery.value).toBe('translation');
    expect(ctxAfterSwitch.portDraft.value).toBe(49999);
    expect(ctxAfterSwitch.activeSnippet.value).toContain('"tsukuyomi"');
    expect(ctxAfterSwitch.activeSnippet.value).toContain(token1);

    // 轮换令牌后配置片段实时更新
    const token2 = await ctxAfterSwitch.regenerateToken();
    expect(token2).not.toBe(token1);
    expect(ctxAfterSwitch.activeSnippet.value).toContain(token2);
    expect(ctxAfterSwitch.activeSnippet.value).not.toContain(token1);

    unmount();
  });

  it('浏览器端展示 WebMCP 控件并隐藏桌面服务端开关，权限变更实时收窄暴露工具列表', async () => {
    platformState.isElectron = false;
    const { unmount, getCtx } = mountHarness();
    const ctx = getCtx();

    expect(ctx.isElectronEnv.value).toBe(false);
    expect(ctx.connectTabs.value).toContain('webmcp');
    expect(ctx.activeSnippet.value).toContain('WebMCP');
    expect(ctx.activeSnippet.value).toContain('get_workflow_guide');

    const initialCount = ctx.exposedTools.value.length;
    expect(ctx.exposedTools.value.some((t) => t.name === 'submit_translations')).toBe(true);
    expect(ctx.exposedTools.value.some((t) => t.name === 'delete_book')).toBe(false);

    await ctx.setPermissionMode('read_only');
    expect(ctx.exposedTools.value.length).toBeLessThan(initialCount);
    expect(ctx.exposedTools.value.every((t) => t.readOnlyHint)).toBe(true);

    await ctx.setPermissionMode('full');
    expect(ctx.exposedTools.value.some((t) => t.name === 'delete_book')).toBe(true);

    // toggleWebMcp 仅更新设置，不再手动重复调用 adapter.sync（统一交由 boot watch 单通道触发）
    const { startAgentMcpRuntime, getActiveWebMcpAdapter } =
      await import('src/services/agent-mcp/runtime');
    const webRuntime = await startAgentMcpRuntime({
      isElectronEnv: false,
      webMcpEnv: () => ({ document: { modelContext: { registerTool: vi.fn() } }, navigator: {} }),
    });
    const syncSpy = vi.spyOn(getActiveWebMcpAdapter()!, 'sync');
    await ctx.toggleWebMcp(true);
    expect(useSettingsStore().agentMcp.webMcpEnabled).toBe(true);
    expect(syncSpy).not.toHaveBeenCalled();

    unmount();
    webRuntime.dispose();
  });

  it('运行中切换端口遇到端口冲突时回退 desktopServerEnabled 并提示错误而非成功', async () => {
    platformState.isElectron = true;
    const settings = useSettingsStore();
    await settings.setUiLocale('zh-CN');
    await settings.updateAgentMcpSettings({ desktopServerEnabled: true, desktopPort: 48321 });

    const startSpy = vi.fn((cfg: { port: number; authToken: string }) =>
      Promise.resolve({ state: 'running' as const, port: cfg.port, error: null }),
    );
    const stopSpy = vi.fn(() =>
      Promise.resolve({ state: 'stopped' as const, port: null, error: null }),
    );
    const { startAgentMcpRuntime } = await import('src/services/agent-mcp/runtime');
    const runtime = await startAgentMcpRuntime({
      isElectronEnv: true,
      desktopApi: {
        start: startSpy,
        stop: stopSpy,
        updateConfig: vi.fn(() =>
          Promise.resolve({
            state: 'error' as const,
            port: null,
            error: 'Port 48322 is already in use.',
          }),
        ),
        getStatus: vi.fn(() =>
          Promise.resolve({ state: 'running' as const, port: 48321, error: null }),
        ),
        onStatus: vi.fn(() => () => undefined),
        onRequest: vi.fn(() => () => undefined),
        sendResponse: vi.fn(),
        notifyReady: vi.fn(),
      },
      onDesktopStatusChange: (s) => useAgentMcpStore().setDesktopServerStatus(s),
    });

    const { unmount, getCtx } = mountHarness();
    const ctx = getCtx();
    ctx.portDraft.value = 48322;
    await ctx.applyPort();

    expect(settings.agentMcp.desktopServerEnabled).toBe(false);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: 'Port 48322 is already in use.',
      }),
    );

    // toggleDesktopServer 开启并关闭本地 MCP 服务端，真实驱动 bridge.start / bridge.stop
    startSpy.mockClear();
    stopSpy.mockClear();
    await ctx.toggleDesktopServer(true);
    expect(settings.agentMcp.desktopServerEnabled).toBe(true);
    expect(startSpy).toHaveBeenCalledTimes(1);
    await ctx.toggleDesktopServer(false);
    expect(settings.agentMcp.desktopServerEnabled).toBe(false);
    expect(stopSpy).toHaveBeenCalledTimes(1);

    unmount();
    runtime.dispose();
  });

  it('所有工具与内置工作流在三语 i18n 资源中均有完整专属描述键', async () => {
    const { ALL_AGENT_MCP_TOOLS } = await import('src/services/agent-mcp');
    const { listAgentMcpPrompts } = await import('src/services/agent-mcp/prompts');
    const zhCN = (await import('src/i18n/zh-CN/agent-mcp-ui')).default.agentMcp;
    const zhTW = (await import('src/i18n/zh-TW/agent-mcp-ui')).default.agentMcp;
    const enUS = (await import('src/i18n/en-US/agent-mcp-ui')).default.agentMcp;

    for (const tool of ALL_AGENT_MCP_TOOLS) {
      expect((zhCN.tools as Record<string, string>)[tool.name]).toBeTruthy();
      expect((zhTW.tools as Record<string, string>)[tool.name]).toBeTruthy();
      expect((enUS.tools as Record<string, string>)[tool.name]).toBeTruthy();
    }
    for (const prompt of listAgentMcpPrompts()) {
      expect((zhCN.prompts as Record<string, string>)[prompt.name]).toBeTruthy();
      expect((zhTW.prompts as Record<string, string>)[prompt.name]).toBeTruthy();
      expect((enUS.prompts as Record<string, string>)[prompt.name]).toBeTruthy();
    }
  });
});
