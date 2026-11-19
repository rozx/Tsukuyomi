import { defineStore, acceptHMRUpdate } from 'pinia';
import type {
  AgentMcpActivityEntry,
  RecordAgentMcpActivityInput,
  WebMcpRuntimeStatus,
} from 'src/models/agent-mcp';
import type { DesktopMcpServerStatus } from 'src/models/desktop-mcp';

export const MAX_AGENT_MCP_ACTIVITY_ENTRIES = 200;

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
    activities: [] as AgentMcpActivityEntry[],
  }),

  actions: {
    setDesktopServerStatus(status: DesktopMcpServerStatus): void {
      this.desktopServerStatus = { ...status };
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
      };
      this.activities.unshift(entry);
      if (this.activities.length > MAX_AGENT_MCP_ACTIVITY_ENTRIES) {
        this.activities.length = MAX_AGENT_MCP_ACTIVITY_ENTRIES;
      }
      return entry;
    },

    clearActivities(): void {
      this.activities = [];
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAgentMcpStore, import.meta.hot));
}
