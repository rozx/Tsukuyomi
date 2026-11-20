import {
  AGENT_MCP_PERMISSION_MODES,
  AGENT_MCP_WRITE_MODES,
  DEFAULT_AGENT_MCP_PORT,
  DEFAULT_AGENT_MCP_SETTINGS,
  type AgentMcpPermissionMode,
  type AgentMcpSettings,
  type AgentMcpWriteMode,
} from 'src/models/settings';

function clampAgentMcpPort(port: unknown, fallback = DEFAULT_AGENT_MCP_PORT): number {
  if (port === null || port === undefined || (typeof port === 'string' && port.trim() === '')) {
    return fallback;
  }
  const num = typeof port === 'number' ? port : Number(port);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(65535, Math.max(1024, Math.trunc(num)));
}

export function normalizeAgentMcpSettings(
  raw: Partial<AgentMcpSettings> | undefined,
  base: AgentMcpSettings = DEFAULT_AGENT_MCP_SETTINGS,
): AgentMcpSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...base };
  }
  const permissionMode = AGENT_MCP_PERMISSION_MODES.includes(
    raw.permissionMode as AgentMcpPermissionMode,
  )
    ? (raw.permissionMode as AgentMcpPermissionMode)
    : base.permissionMode;
  const defaultWriteMode = AGENT_MCP_WRITE_MODES.includes(raw.defaultWriteMode as AgentMcpWriteMode)
    ? (raw.defaultWriteMode as AgentMcpWriteMode)
    : base.defaultWriteMode;
  return {
    desktopServerEnabled:
      typeof raw.desktopServerEnabled === 'boolean'
        ? raw.desktopServerEnabled
        : base.desktopServerEnabled,
    desktopPort:
      raw.desktopPort !== undefined
        ? clampAgentMcpPort(raw.desktopPort, base.desktopPort)
        : base.desktopPort,
    desktopAuthToken:
      typeof raw.desktopAuthToken === 'string'
        ? raw.desktopAuthToken.trim()
        : base.desktopAuthToken,
    webMcpEnabled: typeof raw.webMcpEnabled === 'boolean' ? raw.webMcpEnabled : base.webMcpEnabled,
    permissionMode,
    defaultWriteMode,
    notifyOnWrite: typeof raw.notifyOnWrite === 'boolean' ? raw.notifyOnWrite : base.notifyOnWrite,
  };
}

export function generateAgentMcpToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
