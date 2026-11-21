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
// 中继连接状态靠探测本机端口得到，测试里由 relayProbe 控制结果
const { relayProbe } = vi.hoisted(() => ({
  relayProbe: {
    status: { state: 'not-found', port: null } as { state: string; port: number | null },
  },
}));
vi.mock('src/services/agent-mcp/relay-link', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkRelayLink: vi.fn(() => Promise.resolve({ ...relayProbe.status })),
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
    expect(ctx.connectTabs.value).toEqual(['claude-code', 'pi', 'antigravity']);
    expect(ctx.prompts.value[0]?.displayDescription).toContain('按块拉取');
    expect(
      ctx.exposedTools.value.find((t) => t.name === 'list_books')?.displayDescription,
    ).toContain('书库');

    expect(ctx.activeSnippet.value).toContain('http://127.0.0.1:49123/mcp');
    expect(ctx.activeSnippet.value).toContain(token1);

    // 切到 Pi 标签页、展开工具分类、修改端口草稿，然后切换断点验证状态保持
    ctx.activeConnectTab.value = 'pi';
    ctx.toggleToolCategory('translation');
    ctx.portDraft.value = 49999;

    variant.value = 'mobile';
    await nextTick();

    const ctxAfterSwitch = getCtx();
    expect(ctxAfterSwitch.activeConnectTab.value).toBe('pi');
    expect(ctxAfterSwitch.expandedToolCategories.value).toEqual(['translation']);
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
    expect(ctx.connectTabs.value).toEqual(['relay-claude-code', 'relay-json']);

    const initialCount = ctx.exposedTools.value.length;
    expect(ctx.exposedTools.value.some((t) => t.name === 'submit_translations')).toBe(true);
    expect(ctx.exposedTools.value.some((t) => t.name === 'delete_book')).toBe(false);

    await ctx.requestPermissionMode('read_only');
    expect(ctx.exposedTools.value.length).toBeLessThan(initialCount);
    expect(ctx.exposedTools.value.every((t) => t.readOnlyHint)).toBe(true);

    // 完全控制允许删书：选择后先进入待确认，取消则不生效
    await ctx.requestPermissionMode('full');
    expect(ctx.pendingFullPermission.value).toBe(true);
    expect(useSettingsStore().agentMcp.permissionMode).toBe('read_only');
    ctx.cancelFullPermission();
    expect(ctx.pendingFullPermission.value).toBe(false);
    expect(useSettingsStore().agentMcp.permissionMode).toBe('read_only');

    await ctx.requestPermissionMode('full');
    await ctx.confirmFullPermission();
    expect(ctx.pendingFullPermission.value).toBe(false);
    expect(ctx.exposedTools.value.some((t) => t.name === 'delete_book')).toBe(true);

    // 各权限选项标明开放的工具数量，且逐级递增；完全控制标记为危险
    const [readOnly, translateEdit, full] = ctx.permissionOptions.value;
    expect(readOnly!.toolCount).toBeLessThan(translateEdit!.toolCount);
    expect(translateEdit!.toolCount).toBeLessThan(full!.toolCount);
    expect(full!.danger).toBe(true);
    expect(full!.toolCount).toBe(ctx.exposedTools.value.length);

    // 工具按类别分组，分组总数与已开放工具一致
    const grouped = ctx.toolGroups.value;
    expect(grouped.map((g) => g.category)).toEqual([
      'context',
      'library',
      'translation',
      'worldbuilding',
    ]);
    expect(grouped.reduce((sum, g) => sum + g.tools.length, 0)).toBe(ctx.exposedTools.value.length);

    // WebMCP 通道的快速上手指南改用 get_workflow_guide
    expect(ctx.quickStartGuide.value).toContain('get_workflow_guide');

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

  it('服务未运行时配置片段不可复制；运行后可复制，并能感知首次调用', async () => {
    platformState.isElectron = true;
    const settings = useSettingsStore();
    await settings.setUiLocale('zh-CN');
    await settings.regenerateAgentMcpAuthToken();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const store = useAgentMcpStore();
    store.setDesktopServerStatus({ state: 'stopped', port: null, error: null });

    const { unmount, getCtx } = mountHarness();
    const ctx = getCtx();

    expect(ctx.connectionReady.value).toBe(false);
    await ctx.copyActiveSnippet();
    expect(writeText).not.toHaveBeenCalled();
    expect(toastAdd).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'warn' }));

    store.setDesktopServerStatus({ state: 'running', port: 48321, error: null });
    expect(ctx.connectionReady.value).toBe(true);
    await ctx.copyActiveSnippet();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(ctx.snippetPlacementHint.value).toContain('claude mcp list');

    // 尚未有调用 -> 记录一次调用后标记为已连通
    expect(ctx.firstCallReceived.value).toBe(false);
    store.recordActivity({
      channel: 'desktop-mcp',
      toolName: 'list_books',
      argsSummary: '',
      status: 'success',
      durationMs: 3,
    });
    expect(ctx.firstCallReceived.value).toBe(true);

    unmount();
  });

  it('提供可一键复制的 Agent 快速上手指南，内容随通道与界面语言变化', async () => {
    platformState.isElectron = true;
    const settings = useSettingsStore();
    await settings.setUiLocale('zh-CN');
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { unmount, getCtx } = mountHarness();
    const ctx = getCtx();

    expect(ctx.quickStartGuide.value).toContain('tsukuyomi');
    expect(ctx.quickStartGuide.value).toContain('prompts/get');
    expect(ctx.quickStartGuide.value).toContain('check_book_updates');

    // 「手动添加 MCP」默认收起：把指南交给 Agent 就不需要它；展开状态跨断点保留
    expect(ctx.manualSetupOpen.value).toBe(false);
    ctx.toggleManualSetup();
    expect(ctx.manualSetupOpen.value).toBe(true);

    // 服务没开也可以先复制指南
    expect(ctx.connectionReady.value).toBe(false);
    await ctx.copyQuickStartGuide();
    expect(writeText).toHaveBeenCalledWith(ctx.quickStartGuide.value);

    await settings.setUiLocale('en-US');
    expect(ctx.quickStartGuide.value).toMatch(/quick start guide/i);

    unmount();
  });

  it('浏览器端通过本地中继接入：给出带本页来源限制的客户端配置，随时可复制', async () => {
    platformState.isElectron = false;
    const settings = useSettingsStore();
    await settings.setUiLocale('zh-CN');
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    const { unmount, getCtx } = mountHarness();
    const ctx = getCtx();

    expect(ctx.connectTabs.value).toEqual(['relay-claude-code', 'relay-json']);
    expect(ctx.activeConnectTab.value).toBe('relay-claude-code');
    expect(ctx.activeSnippet.value).toContain('claude mcp add');
    expect(ctx.activeSnippet.value).toContain('npx -y @mcp-b/webmcp-local-relay@latest');
    // 只允许本页来源连接中继，避免其他网站借中继暴露工具
    expect(ctx.activeSnippet.value).toContain(`--widget-origin ${window.location.origin}`);
    expect(ctx.snippetPlacementHint.value).toContain('webmcp_list_sources');

    ctx.activeConnectTab.value = 'relay-json';
    const parsed = JSON.parse(ctx.activeSnippet.value) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(parsed.mcpServers['webmcp-local-relay']!.command).toBe('npx');
    expect(parsed.mcpServers['webmcp-local-relay']!.args).toEqual([
      '-y',
      '@mcp-b/webmcp-local-relay@latest',
      '--widget-origin',
      window.location.origin,
    ]);

    // 中继配置不含令牌、不依赖本页开关，未开启时也可以先复制
    expect(ctx.connectionReady.value).toBe(false);
    await ctx.copyActiveSnippet();
    expect(writeText).toHaveBeenCalledWith(ctx.activeSnippet.value);

    // 状态只有「未开启 / 已开启」
    expect(ctx.runtimeStatusLabel.value).toBe('未开启');
    useAgentMcpStore().setWebMcpStatus({
      availability: 'native-document',
      registered: true,
      registeredToolNames: ['list_books'],
      error: null,
    });
    expect(ctx.runtimeStatusLabel.value).toBe('已开启');

    unmount();
  });

  it('中继接不上时在页面上说明原因：旧版原生接口无法替换、运行时加载失败', async () => {
    platformState.isElectron = false;
    const settings = useSettingsStore();
    await settings.setUiLocale('zh-CN');
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const store = useAgentMcpStore();
    store.setWebMcpRelayState('enabled');

    const { unmount, getCtx } = mountHarness();
    const ctx = getCtx();
    expect(ctx.webMcpRelayIssue.value).toBe('');

    store.setWebMcpRelayState('legacy-native');
    expect(ctx.webMcpRelayIssue.value).toContain('chrome://flags/#enable-webmcp-testing');

    store.setWebMcpRelayState('failed');
    expect(ctx.webMcpRelayIssue.value).toMatch(/刷新/);

    // 页面不安全的情况由单独的提示说明，这里不重复
    store.setWebMcpRelayState('insecure');
    expect(ctx.webMcpRelayIssue.value).toBe('');

    unmount();
    store.setWebMcpRelayState('idle');
  });

  it('页面不在安全上下文时 WebMCP 开关不可开启，但允许关闭', async () => {
    platformState.isElectron = false;
    const settings = useSettingsStore();
    await settings.setUiLocale('zh-CN');
    await settings.updateAgentMcpSettings({ webMcpEnabled: false });
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });

    const { unmount, getCtx } = mountHarness();
    const ctx = getCtx();

    expect(ctx.pageInsecure.value).toBe(true);
    expect(ctx.runtimeStatusLabel.value).toBe('无法开启');
    await ctx.toggleWebMcp(true);
    expect(settings.agentMcp.webMcpEnabled).toBe(false);

    await settings.updateAgentMcpSettings({ webMcpEnabled: true });
    expect(ctx.webMcpToggleOn.value).toBe(false);
    await ctx.toggleWebMcp(false);
    expect(settings.agentMcp.webMcpEnabled).toBe(false);

    unmount();
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });

  it('重新生成令牌需要二次确认，取消后令牌不变', async () => {
    platformState.isElectron = true;
    const settings = useSettingsStore();
    const before = await settings.regenerateAgentMcpAuthToken();
    const { unmount, getCtx } = mountHarness();
    const ctx = getCtx();

    ctx.requestRegenerateToken();
    expect(ctx.regenerateArmed.value).toBe(true);
    ctx.cancelRegenerateToken();
    expect(ctx.regenerateArmed.value).toBe(false);
    expect(settings.agentMcp.desktopAuthToken).toBe(before);

    ctx.requestRegenerateToken();
    const next = await ctx.regenerateToken();
    expect(next).not.toBe(before);
    expect(ctx.regenerateArmed.value).toBe(false);

    unmount();
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

  it('页面分栏：浏览器端四个分栏、桌面端多一个连接设置；选中的分栏跨断点切换保持', async () => {
    const harness = mountHarness();
    const ctx = harness.getCtx();
    expect(ctx.sections.value.map((section) => section.key)).toEqual([
      'connect',
      'activity',
      'permission',
      'tools',
    ]);
    expect(ctx.activeSection.value).toBe('connect');

    ctx.selectSection('permission');
    expect(ctx.activeSection.value).toBe('permission');
    harness.variant.value = 'mobile';
    await nextTick();
    expect(harness.getCtx().activeSection.value).toBe('permission');
    harness.unmount();

    platformState.isElectron = true;
    const desktop = mountHarness();
    expect(desktop.getCtx().sections.value.map((section) => section.key)).toEqual([
      'connect',
      'activity',
      'permission',
      'tools',
      'connection',
    ]);
    desktop.unmount();
  });

  it('两栏布局下右栏显示的分栏：选中「接入」时显示调用活动，其余跟随选中的分栏', () => {
    const harness = mountHarness();
    const ctx = harness.getCtx();
    expect(ctx.activeSection.value).toBe('connect');
    expect(ctx.secondarySection.value).toBe('activity');

    ctx.selectSection('tools');
    expect(ctx.secondarySection.value).toBe('tools');
    ctx.selectSection('activity');
    expect(ctx.secondarySection.value).toBe('activity');
    harness.unmount();
  });

  it('三栏布局的第三栏：选中权限、能力或连接时跟随选中项，否则显示权限与写回', () => {
    const harness = mountHarness();
    const ctx = harness.getCtx();
    expect(ctx.sideSection.value).toBe('permission');

    ctx.selectSection('tools');
    expect(ctx.sideSection.value).toBe('tools');
    ctx.selectSection('activity');
    expect(ctx.sideSection.value).toBe('permission');
    ctx.selectSection('connection');
    expect(ctx.sideSection.value).toBe('connection');
    ctx.selectSection('connect');
    expect(ctx.sideSection.value).toBe('permission');
    harness.unmount();
  });

  it('调用活动分栏带上本次会话的调用次数；没有调用时不显示数字', async () => {
    const harness = mountHarness();
    const ctx = harness.getCtx();
    const activity = () => ctx.sections.value.find((section) => section.key === 'activity');
    expect(activity()?.badge).toBeUndefined();

    useAgentMcpStore().recordActivity({
      channel: 'webmcp',
      toolName: 'list_books',
      argsSummary: '',
      status: 'success',
      durationMs: 3,
    });
    await nextTick();
    expect(activity()?.badge).toBe('1');
    harness.unmount();
  });

  it('页面顶部概览显示服务状态、当前权限、开放的工具数与调用次数，并随设置变化', async () => {
    const harness = mountHarness();
    const ctx = harness.getCtx();
    const values = () => ctx.summaryMetrics.value.map((item) => String(item.value));

    await useSettingsStore().updateAgentMcpSettings({
      webMcpEnabled: false,
      permissionMode: 'translate_and_edit',
    });
    await nextTick();
    expect(ctx.summaryMetrics.value).toHaveLength(4);
    expect(values()[0]).toBe(ctx.runtimeStatusLabel.value);
    expect(values()[1]).toBe(
      ctx.permissionOptions.value.find((option) => option.value === 'translate_and_edit')?.label,
    );
    expect(values()[2]).toBe(String(ctx.exposedTools.value.length));
    expect(values()[3]).toBe('0');

    const before = Number(values()[2]);
    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'read_only' });
    await nextTick();
    expect(Number(values()[2])).toBeLessThan(before);
    expect(values()[1]).toBe(
      ctx.permissionOptions.value.find((option) => option.value === 'read_only')?.label,
    );
    harness.unmount();
  });

  it('浏览器端开启后说明是否真的接上了本机中继，并给出原因与本页地址', async () => {
    const { checkRelayLink } = await import('src/services/agent-mcp/relay-link');
    vi.mocked(checkRelayLink).mockClear();
    relayProbe.status = { state: 'not-found', port: null };
    await useSettingsStore().updateSettings({ uiLocale: 'zh-CN' });
    await useSettingsStore().updateAgentMcpSettings({ webMcpEnabled: false });
    const harness = mountHarness();
    const ctx = harness.getCtx();

    // 开关没开时不检查，也不显示
    await ctx.refreshRelayLink();
    expect(checkRelayLink).not.toHaveBeenCalled();
    expect(ctx.relayLinkNotice.value).toBeNull();

    await useSettingsStore().updateAgentMcpSettings({ webMcpEnabled: true });
    await ctx.refreshRelayLink();
    expect(ctx.relayLinkNotice.value?.tone).toBe('info');
    expect(ctx.relayLinkNotice.value?.text).toMatch(/没有找到/);

    // 中继在运行但没有接受本页：提示核对允许的页面地址，并给出本页实际地址
    relayProbe.status = { state: 'not-linked', port: 9333 };
    await ctx.refreshRelayLink();
    expect(ctx.relayLinkNotice.value?.tone).toBe('warn');
    expect(ctx.relayLinkNotice.value?.text).toContain('--widget-origin');
    expect(ctx.relayLinkNotice.value?.text).toContain(window.location.origin);

    relayProbe.status = { state: 'connected', port: 9333 };
    await ctx.refreshRelayLink();
    expect(ctx.relayLinkNotice.value?.tone).toBe('ok');
    expect(ctx.relayLinkNotice.value?.text).toContain('9333');

    // 关掉开关后不再显示
    await useSettingsStore().updateAgentMcpSettings({ webMcpEnabled: false });
    await nextTick();
    expect(ctx.relayLinkNotice.value).toBeNull();
    harness.unmount();
  });

  it('桌面端不探测中继', async () => {
    platformState.isElectron = true;
    const { checkRelayLink } = await import('src/services/agent-mcp/relay-link');
    vi.mocked(checkRelayLink).mockClear();
    const harness = mountHarness();
    await harness.getCtx().refreshRelayLink();
    expect(checkRelayLink).not.toHaveBeenCalled();
    expect(harness.getCtx().relayLinkNotice.value).toBeNull();
    harness.unmount();
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
