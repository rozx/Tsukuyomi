/**
 * 浏览器端 WebMCP 本地中继的接通状态。
 * - `idle`：未开启；`enabled`：已接通运行时并注入中继
 * - `insecure`：页面不在安全上下文；`legacy-native`：浏览器自带旧版 WebMCP 且无法替换
 * - `failed`：运行时加载或初始化失败
 */
export type WebMcpRelayState = 'idle' | 'enabled' | 'insecure' | 'legacy-native' | 'failed';

export type ExternalAgentChannel = 'desktop-mcp' | 'webmcp';

export type WebMcpAvailability = 'native-document' | 'native-navigator' | 'unavailable';

export interface WebMcpRuntimeStatus {
  availability: WebMcpAvailability;
  registered: boolean;
  registeredToolNames: string[];
  error: string | null;
}

export type AgentMcpActivityStatus = 'success' | 'error' | 'denied';

export interface AgentMcpActivityPayload {
  channel: ExternalAgentChannel;
  toolName: string;
  argsSummary: string;
  status: AgentMcpActivityStatus;
  durationMs: number;
  errorMessage?: string;
}

export interface RecordAgentMcpActivityInput extends AgentMcpActivityPayload {
  timestamp?: number;
}

export interface AgentMcpActivityEntry extends AgentMcpActivityPayload {
  id: string;
  timestamp: number;
}
