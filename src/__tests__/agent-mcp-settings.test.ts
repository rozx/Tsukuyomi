import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from 'src/stores/settings';
import { stripAppSettingsLocalFields } from 'src/utils/sync-strip';
import { DEFAULT_AGENT_MCP_PORT, DEFAULT_AGENT_MCP_SETTINGS } from 'src/models/settings';
import { SettingsService } from 'src/services/settings-service';
import { useSettingsImportExport } from 'src/composables/settings/useSettingsImportExport';
import * as electronSettings from 'src/composables/useElectronSettings';

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: toastAdd }),
}));

describe('agentMcp 本机配置与同步隔离', () => {
  beforeEach(async () => {
    toastAdd.mockClear();
    await useSettingsStore().loadSettings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('提供安全的默认配置（默认关闭、48321、translate_and_edit、append、开启写提示）', () => {
    const store = useSettingsStore();
    expect(store.agentMcp).toEqual(DEFAULT_AGENT_MCP_SETTINGS);
    expect(store.agentMcp.desktopServerEnabled).toBe(false);
    expect(store.agentMcp.desktopPort).toBe(DEFAULT_AGENT_MCP_PORT);
    expect(store.agentMcp.desktopPort).toBe(48321);
    expect(store.agentMcp.webMcpEnabled).toBe(false);
    expect(store.agentMcp.permissionMode).toBe('translate_and_edit');
    expect(store.agentMcp.defaultWriteMode).toBe('append');
    expect(store.agentMcp.notifyOnWrite).toBe(true);
  });

  it('生成并轮换高熵 32 字节 hex Bearer Token，且端口越界会被钳制在有效范围', async () => {
    const store = useSettingsStore();
    const token1 = await store.ensureAgentMcpAuthToken();
    expect(token1).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.ensureAgentMcpAuthToken()).toBe(token1);

    const token2 = await store.regenerateAgentMcpAuthToken();
    expect(token2).toMatch(/^[0-9a-f]{64}$/);
    expect(token2).not.toBe(token1);
    expect(store.agentMcp.desktopAuthToken).toBe(token2);

    await store.updateAgentMcpSettings({ desktopPort: 80 });
    expect(store.agentMcp.desktopPort).toBe(1024);

    await store.updateAgentMcpSettings({ desktopPort: 70000 });
    expect(store.agentMcp.desktopPort).toBe(65535);

    // 清空端口（null / 空字符串）应回退为当前已保存端口，而不是把 Number(null)=0 钳成 1024
    await store.updateAgentMcpSettings({ desktopPort: 48500 });
    await store.updateAgentMcpSettings({ desktopPort: null as unknown as number });
    expect(store.agentMcp.desktopPort).toBe(48500);
    await store.updateAgentMcpSettings({ desktopPort: '' as unknown as number });
    expect(store.agentMcp.desktopPort).toBe(48500);
  });

  it('上一次保存还没完成时再改另一项：两项修改都保留，后一次不会把前一次改回去', async () => {
    const store = useSettingsStore();
    await store.updateAgentMcpSettings({
      permissionMode: 'translate_and_edit',
      notifyOnWrite: true,
    });

    // 两次修改都不等待完成，与界面上连续操作的调用方式一致
    const first = store.updateAgentMcpSettings({ permissionMode: 'read_only' });
    const second = store.updateAgentMcpSettings({ notifyOnWrite: false });
    await Promise.all([first, second]);

    expect(store.agentMcp.permissionMode).toBe('read_only');
    expect(store.agentMcp.notifyOnWrite).toBe(false);
    // 每次调用返回的是它自己合并之后的结果
    expect((await second).permissionMode).toBe('read_only');
  });

  it('仅修改本机 MCP 配置不改变同步剥离后的设置内容（不触发待同步变更）', async () => {
    const store = useSettingsStore();
    const beforeStripped = JSON.stringify(stripAppSettingsLocalFields(store.getAllSettings()));

    await store.updateAgentMcpSettings({
      desktopServerEnabled: true,
      desktopPort: 49999,
      webMcpEnabled: true,
      permissionMode: 'full',
      defaultWriteMode: 'overwrite',
      notifyOnWrite: false,
    });
    await store.regenerateAgentMcpAuthToken();

    const afterStrippedObj = stripAppSettingsLocalFields(store.getAllSettings());
    expect('agentMcp' in afterStrippedObj).toBe(false);
    expect(JSON.stringify(afterStrippedObj)).toBe(beforeStripped);
  });

  it('Gist 下载合并（importSettings）与恢复修订（replaceSettingsFromSyncSnapshot）均保留本机 MCP 配置', async () => {
    const store = useSettingsStore();
    const localToken = await store.regenerateAgentMcpAuthToken();
    await store.updateAgentMcpSettings({
      desktopServerEnabled: true,
      desktopPort: 48400,
      permissionMode: 'read_only',
    });

    await store.importSettings({
      scraperConcurrencyLimit: 5,
      agentMcp: {
        ...DEFAULT_AGENT_MCP_SETTINGS,
        desktopServerEnabled: false,
        desktopPort: 41111,
        desktopAuthToken: 'remote-leaked-token',
        permissionMode: 'full',
      },
    });

    expect(store.settings.scraperConcurrencyLimit).toBe(5);
    expect(store.agentMcp.desktopServerEnabled).toBe(true);
    expect(store.agentMcp.desktopPort).toBe(48400);
    expect(store.agentMcp.desktopAuthToken).toBe(localToken);
    expect(store.agentMcp.permissionMode).toBe('read_only');

    await store.replaceSettingsFromSyncSnapshot({
      scraperConcurrencyLimit: 2,
      agentMcp: {
        ...DEFAULT_AGENT_MCP_SETTINGS,
        desktopServerEnabled: false,
        desktopPort: 42222,
        desktopAuthToken: 'snapshot-token',
      },
    });

    expect(store.settings.scraperConcurrencyLimit).toBe(2);
    expect(store.agentMcp.desktopServerEnabled).toBe(true);
    expect(store.agentMcp.desktopPort).toBe(48400);
    expect(store.agentMcp.desktopAuthToken).toBe(localToken);
    expect(store.agentMcp.permissionMode).toBe('read_only');
  });

  it('导出备份文件剥离 agentMcp，导入他机备份不修改本机 MCP 配置', async () => {
    const store = useSettingsStore();
    const localToken = await store.regenerateAgentMcpAuthToken();
    await store.updateAgentMcpSettings({
      desktopServerEnabled: true,
      desktopPort: 48555,
      permissionMode: 'full',
    });

    vi.spyOn(electronSettings, 'loadBooksWithContentAndMemories').mockResolvedValue({
      novelsWithContent: [],
      memories: [],
    });
    const exportSpy = vi.spyOn(SettingsService, 'exportSettings').mockReturnValue({
      success: true,
      message: 'ok',
    });

    const transfer = useSettingsImportExport();
    await transfer.exportSettings();

    expect(exportSpy).toHaveBeenCalledTimes(1);
    const exportedPayload = exportSpy.mock.calls[0]![0];
    expect(exportedPayload.appSettings).toBeDefined();
    expect('agentMcp' in (exportedPayload.appSettings ?? {})).toBe(false);
    expect(JSON.stringify(exportedPayload)).not.toContain(localToken);

    // 模拟导入含 agentMcp 的他机备份
    await store.importSettings({
      booksSortOption: 'title',
      agentMcp: {
        ...DEFAULT_AGENT_MCP_SETTINGS,
        desktopServerEnabled: false,
        desktopPort: 49111,
        desktopAuthToken: 'other-machine-token',
      },
    });

    expect(store.settings.booksSortOption).toBe('title');
    expect(store.agentMcp.desktopServerEnabled).toBe(true);
    expect(store.agentMcp.desktopPort).toBe(48555);
    expect(store.agentMcp.desktopAuthToken).toBe(localToken);
    expect(store.agentMcp.permissionMode).toBe('full');
  });
});
