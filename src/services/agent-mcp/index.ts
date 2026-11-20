import type { RecordAgentMcpActivityInput } from 'src/models/agent-mcp';
import { createAgentMcpKernel, type AgentMcpKernel } from './kernel';
import { agentMcpBookUpdateTools } from './tools/book-updates';
import { agentMcpContextTools } from './tools/context';
import { agentMcpLibraryTools } from './tools/library';
import { agentMcpTranslationTools } from './tools/translation';
import { agentMcpWorldbuildingTools } from './tools/worldbuilding';
import type { AgentMcpToolSpec, AgentMcpWriteNotification } from './types';

export const ALL_AGENT_MCP_TOOLS: readonly AgentMcpToolSpec[] = [
  ...agentMcpContextTools,
  ...agentMcpLibraryTools,
  ...agentMcpBookUpdateTools,
  ...agentMcpTranslationTools,
  ...agentMcpWorldbuildingTools,
];

let sharedKernel: AgentMcpKernel | null = null;
let sharedNavigate: ((path: string) => Promise<void> | void) | undefined;
let sharedWriteNotify: ((info: AgentMcpWriteNotification) => void) | undefined;
let sharedRecordActivity: ((entry: RecordAgentMcpActivityInput) => void) | undefined;

export function configureAgentMcpKernelHooks(hooks: {
  navigate?: (path: string) => Promise<void> | void;
  onWriteNotify?: (info: AgentMcpWriteNotification) => void;
  onRecordActivity?: (entry: RecordAgentMcpActivityInput) => void;
}): void {
  sharedNavigate = hooks.navigate;
  sharedWriteNotify = hooks.onWriteNotify;
  sharedRecordActivity = hooks.onRecordActivity;
}

export function getAgentMcpKernel(): AgentMcpKernel {
  if (!sharedKernel) {
    sharedKernel = createAgentMcpKernel({
      tools: ALL_AGENT_MCP_TOOLS,
      navigate: (path) => sharedNavigate?.(path),
      onWriteNotify: (info) => sharedWriteNotify?.(info),
      onRecordActivity: (entry) => sharedRecordActivity?.(entry),
    });
  }
  return sharedKernel;
}
