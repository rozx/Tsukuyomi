import { defineStore, acceptHMRUpdate } from 'pinia';
import type {
  AgentMcpActivityEntry,
  RecordAgentMcpActivityInput,
  WebMcpRelayState,
  WebMcpRuntimeStatus,
} from 'src/models/agent-mcp';
import type { DesktopMcpServerStatus } from 'src/models/desktop-mcp';

export const MAX_AGENT_MCP_ACTIVITY_ENTRIES = 200;

/**
 * 调用活动保存在 sessionStorage：刷新页面后仍在，关闭标签页（或退出桌面应用）才清空。
 * 不落 IndexedDB、不参与同步——它只是当前这次使用过程的观测记录。
 */
export const AGENT_MCP_ACTIVITY_STORAGE_KEY = 'tsukuyomi-agent-mcp-activities';

const ACTIVITY_STATUSES: readonly string[] = ['success', 'error', 'denied'];
const ACTIVITY_CHANNELS: readonly string[] = ['desktop-mcp', 'webmcp'];

function isActivityEntry(value: unknown): value is AgentMcpActivityEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.timestamp === 'number' &&
    typeof entry.toolName === 'string' &&
    typeof entry.argsSummary === 'string' &&
    typeof entry.durationMs === 'number' &&
    typeof entry.channel === 'string' &&
    ACTIVITY_CHANNELS.includes(entry.channel) &&
    typeof entry.status === 'string' &&
    ACTIVITY_STATUSES.includes(entry.status)
  );
}

/** 读取本标签页已保存的调用活动；存储不可用或内容损坏时从空开始 */
function loadPersistedActivities(): AgentMcpActivityEntry[] {
  try {
    const raw = sessionStorage.getItem(AGENT_MCP_ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isActivityEntry).slice(0, MAX_AGENT_MCP_ACTIVITY_ENTRIES);
  } catch {
    return [];
  }
}

function persistActivities(entries: readonly AgentMcpActivityEntry[]): void {
  try {
    if (entries.length === 0) sessionStorage.removeItem(AGENT_MCP_ACTIVITY_STORAGE_KEY);
    else sessionStorage.setItem(AGENT_MCP_ACTIVITY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 存储不可用或已满时只保留内存中的记录
  }
}

let activitySeq = 0;

export const useAgentMcpStore = defineStore('agent-mcp', {
  state: () => ({
    desktopServerStatus: {
      state: 'stopped',
      port: null,
      error: null,
    } as DesktopMcpServerStatus,
    webMcpStatus: {
      availability: 'unavailable',
      registered: false,
      registeredToolNames: [],
      error: null,
    } as WebMcpRuntimeStatus,
    /** 浏览器端本地中继的接通状态 */
    webMcpRelayState: 'idle' as WebMcpRelayState,
    activities: loadPersistedActivities(),
  }),

  actions: {
    setDesktopServerStatus(status: DesktopMcpServerStatus): void {
      this.desktopServerStatus = { ...status };
    },

    setWebMcpRelayState(state: WebMcpRelayState): void {
      this.webMcpRelayState = state;
    },

    setWebMcpStatus(status: WebMcpRuntimeStatus): void {
      this.webMcpStatus = {
        ...status,
        registeredToolNames: [...status.registeredToolNames],
      };
    },

    recordActivity(input: RecordAgentMcpActivityInput): AgentMcpActivityEntry {
      activitySeq += 1;
      const entry: AgentMcpActivityEntry = {
        id: `mcp-act-${Date.now()}-${activitySeq}`,
        timestamp: input.timestamp ?? Date.now(),
        channel: input.channel,
        toolName: input.toolName,
        argsSummary: input.argsSummary,
        status: input.status,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
        ...(input.resultSummary ? { resultSummary: input.resultSummary } : {}),
      };
      this.activities.unshift(entry);
      if (this.activities.length > MAX_AGENT_MCP_ACTIVITY_ENTRIES) {
        this.activities.length = MAX_AGENT_MCP_ACTIVITY_ENTRIES;
      }
      persistActivities(this.activities);
      return entry;
    },

    clearActivities(): void {
      this.activities = [];
      persistActivities(this.activities);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAgentMcpStore, import.meta.hot));
}
