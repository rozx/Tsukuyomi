import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveRelayLinkMonitor, startAgentMcpRuntime } from 'src/services/agent-mcp/runtime';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';

describe('AgentMcp runtime × WebMCP relay', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('浏览器端开启时先接通中继再注册工具；关闭时先注销工具再断开中继', async () => {
    const order: string[] = [];
    const relayStates: string[] = [];
    const registerTool = vi.fn(() => {
      if (!order.includes('register')) order.push('register');
    });
    const relay = {
      enable: vi.fn(() => {
        order.push('relay.enable');
        return Promise.resolve('enabled' as const);
      }),
      disable: vi.fn(() => {
        order.push('relay.disable');
      }),
      isEnabled: () => true,
    };
    const settings = useSettingsStore();
    await settings.updateAgentMcpSettings({ webMcpEnabled: true });

    const handle = await startAgentMcpRuntime({
      isElectronEnv: false,
      webMcpEnv: () => ({
        document: {
          modelContext: {
            registerTool,
            unregisterTool: () => {
              if (!order.includes('unregister')) order.push('unregister');
            },
          },
        },
        navigator: {},
      }),
      webMcpRelay: relay,
      onWebMcpRelayStateChange: (state) => relayStates.push(state),
    });
    expect(order).toEqual(['relay.enable', 'register']);
    // 中继的接通结果上报给宿主，用于界面提示
    expect(relayStates).toEqual(['enabled']);

    await settings.updateAgentMcpSettings({ webMcpEnabled: false });
    await handle.syncNow();
    expect(order.slice(2)).toEqual(['unregister', 'relay.disable']);
    expect(relayStates).toEqual(['enabled', 'idle']);

    handle.dispose();
  });

  const webMcpEnv = () => ({
    document: { modelContext: { registerTool: () => undefined, unregisterTool: () => undefined } },
    navigator: {},
  });
  const createMonitor = () => ({
    start: vi.fn(),
    stop: vi.fn(),
    checkNow: vi.fn(() => Promise.resolve(null)),
  });

  it('中继接通后开始留意本机中继是否在运行（在哪个页面都一样），关闭开关或卸载时停止', async () => {
    const monitor = createMonitor();
    const relay = {
      enable: vi.fn(() => Promise.resolve('enabled' as const)),
      disable: vi.fn(),
      isEnabled: () => true,
    };
    const settings = useSettingsStore();
    await settings.updateAgentMcpSettings({ webMcpEnabled: true });

    const handle = await startAgentMcpRuntime({
      isElectronEnv: false,
      webMcpEnv,
      webMcpRelay: relay,
      relayLinkMonitor: monitor,
    });
    expect(monitor.start).toHaveBeenCalledTimes(1);
    expect(monitor.stop).not.toHaveBeenCalled();
    // 「外部 Agent」页面的「重新检查」用的是同一个监视
    expect(getActiveRelayLinkMonitor()).toBe(monitor);

    await settings.updateAgentMcpSettings({ webMcpEnabled: false });
    await handle.syncNow();
    expect(monitor.stop).toHaveBeenCalledTimes(1);

    await settings.updateAgentMcpSettings({ webMcpEnabled: true });
    await handle.syncNow();
    expect(monitor.start).toHaveBeenCalledTimes(2);

    handle.dispose();
    expect(monitor.stop).toHaveBeenCalledTimes(2);
    expect(getActiveRelayLinkMonitor()).toBeNull();
  });

  it('中继没有接通（页面不安全、初始化失败等）时不去探测本机中继', async () => {
    const settings = useSettingsStore();
    await settings.updateAgentMcpSettings({ webMcpEnabled: true });
    for (const result of ['insecure', 'legacy-native', 'failed'] as const) {
      const monitor = createMonitor();
      const handle = await startAgentMcpRuntime({
        isElectronEnv: false,
        webMcpEnv,
        webMcpRelay: {
          enable: () => Promise.resolve(result),
          disable: () => undefined,
          isEnabled: () => false,
        },
        relayLinkMonitor: monitor,
      });
      expect(monitor.start, result).not.toHaveBeenCalled();
      handle.dispose();
    }
  });

  it('桌面端不监视中继', async () => {
    const monitor = createMonitor();
    const handle = await startAgentMcpRuntime({
      isElectronEnv: true,
      desktopApi: null,
      relayLinkMonitor: monitor,
    });
    expect(monitor.start).not.toHaveBeenCalled();
    expect(getActiveRelayLinkMonitor()).toBeNull();
    handle.dispose();
  });

  it('中继还在接通时用户关掉开关：最后工具是注销的、中继是断开的', async () => {
    const registered = new Set<string>();
    let finishEnable: (value: 'enabled') => void = () => undefined;
    let relayOn = false;
    const relay = {
      enable: vi.fn(
        () =>
          new Promise<'enabled'>((resolve) => {
            finishEnable = (value) => {
              relayOn = true;
              resolve(value);
            };
          }),
      ),
      disable: vi.fn(() => {
        relayOn = false;
      }),
      isEnabled: () => relayOn,
    };
    const relayStates: string[] = [];
    const settings = useSettingsStore();
    await settings.updateAgentMcpSettings({ webMcpEnabled: false });
    const handle = await startAgentMcpRuntime({
      isElectronEnv: false,
      webMcpEnv: () => ({
        document: {
          modelContext: {
            registerTool: (tool: { name: string }) => {
              registered.add(tool.name);
            },
            unregisterTool: (name: string) => {
              registered.delete(name);
            },
          },
        },
        navigator: {},
      }),
      webMcpRelay: relay,
      onWebMcpRelayStateChange: (state) => relayStates.push(state),
    });

    // 开启（中继接通需要时间），接通完成前又关闭；两次同步都不等待，与设置监听的调用方式一致
    await settings.updateAgentMcpSettings({ webMcpEnabled: true });
    const enabling = handle.syncNow();
    await vi.waitFor(() => expect(relay.enable).toHaveBeenCalledTimes(1));
    await settings.updateAgentMcpSettings({ webMcpEnabled: false });
    const disabling = handle.syncNow();
    finishEnable('enabled');
    await Promise.all([enabling, disabling]);

    expect(registered.size).toBe(0);
    expect(relayOn).toBe(false);
    expect(relayStates.at(-1)).toBe('idle');
    handle.dispose();
  });

  it('桌面端首次同步失败时卸下已挂载的桥接，不留下重复监听', async () => {
    const offStatus = vi.fn();
    const offRequest = vi.fn();
    const desktopApi = {
      start: vi.fn(() => Promise.reject(new Error('main process failed'))),
      stop: vi.fn(() => Promise.resolve({ state: 'stopped' })),
      getStatus: vi.fn(() => Promise.resolve({ state: 'stopped' })),
      onStatus: vi.fn(() => offStatus),
      onRequest: vi.fn(() => offRequest),
      respond: vi.fn(),
      notifyReady: vi.fn(),
    };
    await useSettingsStore().updateAgentMcpSettings({ desktopServerEnabled: true });

    await expect(
      startAgentMcpRuntime({ isElectronEnv: true, desktopApi: desktopApi as never }),
    ).rejects.toThrow('main process failed');
    expect(desktopApi.onRequest).toHaveBeenCalledTimes(1);
    expect(offRequest).toHaveBeenCalledTimes(1);
    expect(offStatus).toHaveBeenCalledTimes(1);

    await useSettingsStore().updateAgentMcpSettings({ desktopServerEnabled: false });
  });

  it('桌面端不创建中继', async () => {
    const relay = { enable: vi.fn(), disable: vi.fn(), isEnabled: () => false };
    const handle = await startAgentMcpRuntime({
      isElectronEnv: true,
      desktopApi: null,
      webMcpRelay: relay as never,
    });
    expect(relay.enable).not.toHaveBeenCalled();
    handle.dispose();
    expect(relay.disable).not.toHaveBeenCalled();
  });
});
