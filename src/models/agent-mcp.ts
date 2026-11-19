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
