import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import { useAgentMcpStore } from 'src/stores/agent-mcp';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpContextTools } from 'src/services/agent-mcp/tools/context';
import { agentMcpLibraryTools } from 'src/services/agent-mcp/tools/library';
import {
  createWebMcpAdapter,
  detectWebMcpHost,
  type WebMcpModelContext,
  type WebMcpRegisteredToolDef,
} from 'src/services/agent-mcp/webmcp-adapter';

function createMockModelContext(options?: {
  supportSignal?: boolean;
  supportUnregister?: boolean;
}) {
  const registered = new Map<string, WebMcpRegisteredToolDef>();
  const registerTool = vi.fn((tool: WebMcpRegisteredToolDef, opts?: { signal?: AbortSignal }) => {
    if (registered.has(tool.name)) {
      throw new Error(`Duplicate tool: ${tool.name}`);
    }
    registered.set(tool.name, tool);
    if (options?.supportSignal !== false && opts?.signal) {
      opts.signal.addEventListener('abort', () => {
        registered.delete(tool.name);
      });
    }
  });
  const unregisterTool =
    options?.supportUnregister !== false
      ? vi.fn((name: string) => {
          registered.delete(name);
        })
      : undefined;

  const host: WebMcpModelContext = {
    registerTool,
    ...(unregisterTool ? { unregisterTool } : {}),
  };
  return { host, registered, registerTool, unregisterTool };
}

describe('WebMCP Adapter', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useAgentMcpStore().clearActivities();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('按 document.modelContext -> navigator.modelContext -> unavailable 顺序探测环境并静默降级', () => {
    const docHost = createMockModelContext().host;
    const navHost = createMockModelContext().host;

    expect(
      detectWebMcpHost({
        document: { modelContext: docHost },
        navigator: { modelContext: navHost },
      }),
    ).toEqual({
      availability: 'native-document',
      context: docHost,
    });

    expect(detectWebMcpHost({ document: {}, navigator: { modelContext: navHost } })).toEqual({
      availability: 'native-navigator',
      context: navHost,
    });

    expect(detectWebMcpHost({ document: {}, navigator: {} })).toEqual({
      availability: 'unavailable',
      context: null,
    });
  });

  it('开启后注册允许的工具（含 get_workflow_guide），切换权限时先注销再重注册，关闭时完全清理', async () => {
    const { host, registered, registerTool } = createMockModelContext({
      supportSignal: true,
      supportUnregister: false,
    });
    const kernel = createAgentMcpKernel({
      tools: [...agentMcpContextTools, ...agentMcpLibraryTools],
      onRecordActivity: (entry) => {
        useAgentMcpStore().recordActivity(entry);
      },
    });
    const adapter = createWebMcpAdapter({
      kernel,
      env: () => ({ document: { modelContext: host }, navigator: {} }),
      onStatusChange: (status) => useAgentMcpStore().setWebMcpStatus(status),
    });

    // 开启（默认 translate_and_edit）
    await adapter.sync(true);
    expect(registered.has('list_books')).toBe(true);
    expect(registered.get('list_books')?.annotations.readOnlyHint).toBe(true);
    expect(registered.has('create_book')).toBe(true);
    expect(registered.get('create_book')?.annotations.readOnlyHint).toBe(false);
    expect(registered.has('get_workflow_guide')).toBe(true);
    expect(registered.has('delete_book')).toBe(false);
    expect(useAgentMcpStore().webMcpStatus.registered).toBe(true);
    expect(useAgentMcpStore().webMcpStatus.availability).toBe('native-document');

    // 通过注册的 execute 回调执行工具并校验活动记录通道为 webmcp
    const guideTool = registered.get('get_workflow_guide')!;
    const guideRes = await guideTool.execute({ workflow: 'translate-chapter', chapter_id: 'ch-3' });
    expect(JSON.stringify(guideRes)).toContain('ch-3');
    expect(useAgentMcpStore().activities[0]?.channel).toBe('webmcp');

    // 切换为 read_only 后先注销再重注册（不会因同名抛错），且移除写类工具
    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'read_only' });
    await adapter.sync(true);
    expect(registered.has('list_books')).toBe(true);
    expect(registered.has('create_book')).toBe(false);
    expect(registerTool).toHaveBeenCalled();

    // 关闭开关清空所有已注册工具
    await adapter.sync(false);
    expect(registered.size).toBe(0);
    expect(useAgentMcpStore().webMcpStatus.registered).toBe(false);
  });

  it('在仅提供 unregisterTool 而不处理 signal 的旧环境中也能正确清理，且不支持环境不抛错', async () => {
    const { host, registered, unregisterTool } = createMockModelContext({
      supportSignal: false,
      supportUnregister: true,
    });
    const kernel = createAgentMcpKernel({ tools: agentMcpContextTools });
    const adapter = createWebMcpAdapter({
      kernel,
      env: () => ({ document: {}, navigator: { modelContext: host } }),
      onStatusChange: (status) => useAgentMcpStore().setWebMcpStatus(status),
    });

    await adapter.sync(true);
    expect(registered.size).toBeGreaterThan(0);
    expect(useAgentMcpStore().webMcpStatus.availability).toBe('native-navigator');

    await adapter.sync(false);
    expect(unregisterTool).toHaveBeenCalled();
    expect(registered.size).toBe(0);

    // 不支持环境静默降级
    const unavailableAdapter = createWebMcpAdapter({
      kernel,
      env: () => ({ document: {}, navigator: {} }),
      onStatusChange: (status) => useAgentMcpStore().setWebMcpStatus(status),
    });
    await expect(unavailableAdapter.sync(true)).resolves.toBeUndefined();
    expect(useAgentMcpStore().webMcpStatus.availability).toBe('unavailable');
    expect(useAgentMcpStore().webMcpStatus.registered).toBe(false);
  });

  it('并发异步 sync(true) 串行执行且幂等，不会交叠注册触发同名报错', async () => {
    const registered = new Map<string, WebMcpRegisteredToolDef>();
    const registerTool = vi.fn(
      async (tool: WebMcpRegisteredToolDef, opts?: { signal?: AbortSignal }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (registered.has(tool.name)) {
          throw new Error(`Duplicate tool: ${tool.name}`);
        }
        registered.set(tool.name, tool);
        opts?.signal?.addEventListener('abort', () => {
          registered.delete(tool.name);
        });
      },
    );
    const host: WebMcpModelContext = { registerTool };
    const kernel = createAgentMcpKernel({ tools: agentMcpContextTools });
    const statuses: Array<{ registered: boolean; error: string | null }> = [];
    const adapter = createWebMcpAdapter({
      kernel,
      env: () => ({ document: { modelContext: host }, navigator: {} }),
      onStatusChange: (s) => statuses.push({ registered: s.registered, error: s.error }),
    });

    await Promise.all([adapter.sync(true), adapter.sync(true)]);
    expect(statuses.every((s) => s.error === null)).toBe(true);
    expect(registered.size).toBe(kernel.listTools('webmcp').length);
    // 第二次同状态 sync 幂等跳过，不应重复调用 registerTool
    expect(registerTool).toHaveBeenCalledTimes(kernel.listTools('webmcp').length);
  });
});
