import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAgentMcpRuntime } from 'src/services/agent-mcp/runtime';
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
    });
    expect(order).toEqual(['relay.enable', 'register']);

    await settings.updateAgentMcpSettings({ webMcpEnabled: false });
    await handle.syncNow();
    expect(order.slice(2)).toEqual(['unregister', 'relay.disable']);

    handle.dispose();
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
