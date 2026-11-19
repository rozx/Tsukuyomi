import './setup';
import { describe, expect, it } from 'vitest';
import { MAX_AGENT_MCP_ACTIVITY_ENTRIES, useAgentMcpStore } from 'src/stores/agent-mcp';

describe('useAgentMcpStore', () => {
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
