/**
 * 浏览器端 WebMCP 本地中继的接通状态。
 * - `idle`：未开启；`enabled`：已接通运行时并注入中继
 * - `insecure`：页面不在安全上下文；`legacy-native`：浏览器自带旧版 WebMCP 且无法替换
 * - `failed`：运行时加载或初始化失败
 */
export type WebMcpRelayState = 'idle' | 'enabled' | 'insecure' | 'legacy-native' | 'failed';

/**
 * 本页与本机中继的连接情况（由页面自己探测）。
 * - `connected`：中继在运行，并且接受过本页
 * - `not-linked`：中继在运行，但本页没有被接受：多半是中继只允许的页面地址与本页不一致
 * - `not-found`：没有找到中继：Agent 客户端还没有启动它
 */
export type WebMcpRelayLinkState = 'connected' | 'not-linked' | 'not-found';

export interface WebMcpRelayLinkStatus {
  state: WebMcpRelayLinkState;
  port: number | null;
}

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
  /** 成功调用返回结果的一行摘要；没有返回值时缺省 */
  resultSummary?: string;
}

export interface RecordAgentMcpActivityInput extends AgentMcpActivityPayload {
  timestamp?: number;
}

export interface AgentMcpActivityEntry extends AgentMcpActivityPayload {
  id: string;
  timestamp: number;
}
