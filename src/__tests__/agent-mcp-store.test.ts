import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  AGENT_MCP_ACTIVITY_STORAGE_KEY,
  MAX_AGENT_MCP_ACTIVITY_ENTRIES,
  useAgentMcpStore,
} from 'src/stores/agent-mcp';

describe('useAgentMcpStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  const sample = (toolName: string) => ({
    channel: 'desktop-mcp' as const,
    toolName,
    argsSummary: 'book_id=b1',
    resultSummary: 'books=[2]',
    status: 'success' as const,
    durationMs: 5,
  });

  it('调用活动在刷新页面后仍然保留，直到关闭标签页（sessionStorage）', () => {
    const store = useAgentMcpStore();
    store.recordActivity(sample('list_books'));
    store.recordActivity(sample('get_book'));

    // 模拟刷新：新的 Pinia 实例从同一个标签页的会话存储恢复
    setActivePinia(createPinia());
    const reloaded = useAgentMcpStore();
    expect(reloaded.activities.map((entry) => entry.toolName)).toEqual(['get_book', 'list_books']);
    expect(reloaded.activities[0]?.resultSummary).toBe('books=[2]');

    // 恢复后继续追加，仍然是最新优先，且 ID 不与已恢复的记录冲突
    const added = reloaded.recordActivity(sample('submit_translations'));
    expect(reloaded.activities[0]?.toolName).toBe('submit_translations');
    expect(new Set(reloaded.activities.map((entry) => entry.id)).size).toBe(3);
    expect(added.id).toBe(reloaded.activities[0]?.id);
  });

  it('清空日志会同时清掉会话存储，刷新后不再出现', () => {
    const store = useAgentMcpStore();
    store.recordActivity(sample('list_books'));
    store.clearActivities();
    expect(sessionStorage.getItem(AGENT_MCP_ACTIVITY_STORAGE_KEY)).toBeNull();

    setActivePinia(createPinia());
    expect(useAgentMcpStore().activities).toHaveLength(0);
  });

  it('会话存储里的内容损坏或格式不对时忽略并从空开始，保存的条数不超过上限', () => {
    sessionStorage.setItem(AGENT_MCP_ACTIVITY_STORAGE_KEY, '{not json');
    expect(useAgentMcpStore().activities).toHaveLength(0);

    sessionStorage.setItem(
      AGENT_MCP_ACTIVITY_STORAGE_KEY,
      JSON.stringify([{ id: 'ok', timestamp: 1, ...sample('list_books') }, { bogus: true }, 'x']),
    );
    setActivePinia(createPinia());
    expect(useAgentMcpStore().activities.map((entry) => entry.id)).toEqual(['ok']);

    setActivePinia(createPinia());
    const store = useAgentMcpStore();
    for (let i = 0; i < MAX_AGENT_MCP_ACTIVITY_ENTRIES + 5; i++)
      store.recordActivity(sample(`t_${i}`));
    const saved = JSON.parse(sessionStorage.getItem(AGENT_MCP_ACTIVITY_STORAGE_KEY)!) as unknown[];
    expect(saved).toHaveLength(MAX_AGENT_MCP_ACTIVITY_ENTRIES);
  });

  it('只有服务状态不随刷新保留：中继与服务端状态每次从默认值开始', () => {
    const store = useAgentMcpStore();
    store.setWebMcpRelayState('enabled');
    store.setWebMcpRelayLink({ state: 'connected', port: 9333 });
    expect(store.webMcpRelayLink).toEqual({ state: 'connected', port: 9333 });
    setActivePinia(createPinia());
    expect(useAgentMcpStore().webMcpRelayState).toBe('idle');
    expect(useAgentMcpStore().webMcpRelayLink).toBeNull();
  });

  it('按最新优先记录调用活动，并在超过上限时自动截断旧记录', () => {
    const store = useAgentMcpStore();
    expect(store.activities).toHaveLength(0);

    for (let i = 0; i < MAX_AGENT_MCP_ACTIVITY_ENTRIES + 25; i++) {
      store.recordActivity({
        channel: i % 2 === 0 ? 'desktop-mcp' : 'webmcp',
        toolName: `tool_${i}`,
        argsSummary: `arg=${i}`,
        status: 'success',
        durationMs: i,
      });
    }

    expect(store.activities).toHaveLength(MAX_AGENT_MCP_ACTIVITY_ENTRIES);
    expect(store.activities[0]?.toolName).toBe(`tool_${MAX_AGENT_MCP_ACTIVITY_ENTRIES + 24}`);
    expect(store.activities[MAX_AGENT_MCP_ACTIVITY_ENTRIES - 1]?.toolName).toBe('tool_25');

    store.clearActivities();
    expect(store.activities).toHaveLength(0);
  });

  it('正确更新桌面服务端状态、WebMCP 检测状态与已注册工具清单', () => {
    const store = useAgentMcpStore();
    store.setDesktopServerStatus({
      state: 'running',
      port: 48321,
      error: null,
    });
    expect(store.desktopServerStatus).toEqual({
      state: 'running',
      port: 48321,
      error: null,
    });

    store.setWebMcpStatus({
      availability: 'native-document',
      registered: true,
      registeredToolNames: ['list_books', 'get_translation_chunk'],
      error: null,
    });
    expect(store.webMcpStatus.availability).toBe('native-document');
    expect(store.webMcpStatus.registeredToolNames).toEqual(['list_books', 'get_translation_chunk']);
  });
});
