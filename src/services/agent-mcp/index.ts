import type { RecordAgentMcpActivityInput } from 'src/models/agent-mcp';
import { createAgentMcpKernel, type AgentMcpKernel } from './kernel';
import { ALL_AGENT_MCP_TOOLS } from './tools/all-tools';
import type { AgentMcpWriteNotification } from './types';

export { ALL_AGENT_MCP_TOOLS };

let sharedKernel: AgentMcpKernel | null = null;
let sharedNavigate: ((path: string) => Promise<void> | void) | undefined;
let sharedGetCurrentPath: (() => string | null) | undefined;
let sharedWriteNotify: ((info: AgentMcpWriteNotification) => void) | undefined;
let sharedRecordActivity: ((entry: RecordAgentMcpActivityInput) => void) | undefined;

export function configureAgentMcpKernelHooks(hooks: {
  navigate?: (path: string) => Promise<void> | void;
  getCurrentPath?: () => string | null;
  onWriteNotify?: (info: AgentMcpWriteNotification) => void;
  onRecordActivity?: (entry: RecordAgentMcpActivityInput) => void;
}): void {
  sharedNavigate = hooks.navigate;
  sharedGetCurrentPath = hooks.getCurrentPath;
  sharedWriteNotify = hooks.onWriteNotify;
  sharedRecordActivity = hooks.onRecordActivity;
}

export function getAgentMcpKernel(): AgentMcpKernel {
  if (!sharedKernel) {
    sharedKernel = createAgentMcpKernel({
      tools: ALL_AGENT_MCP_TOOLS,
      navigate: (path) => sharedNavigate?.(path),
      getCurrentPath: () => sharedGetCurrentPath?.() ?? null,
      onWriteNotify: (info) => sharedWriteNotify?.(info),
      onRecordActivity: (entry) => sharedRecordActivity?.(entry),
    });
  }
  return sharedKernel;
}
