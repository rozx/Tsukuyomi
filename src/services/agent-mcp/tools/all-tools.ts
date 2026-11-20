import type { AgentMcpToolSpec } from '../types';
import { agentMcpBookUpdateTools } from './book-updates';
import { agentMcpContextTools } from './context';
import { agentMcpHelpTools } from './help-docs';
import { agentMcpLibraryTools } from './library';
import { agentMcpSearchTools } from './search';
import { agentMcpTranslationTools } from './translation';
import { agentMcpWorldbuildingTools } from './worldbuilding';

/**
 * 对外开放的全部工具，内核注册与快速上手指南共用这一份清单。
 * 单独成文件而不放在 ../index，是为了让指南生成不必依赖内核入口。
 */
export const ALL_AGENT_MCP_TOOLS: readonly AgentMcpToolSpec[] = [
  ...agentMcpContextTools,
  ...agentMcpHelpTools,
  ...agentMcpLibraryTools,
  ...agentMcpBookUpdateTools,
  ...agentMcpTranslationTools,
  ...agentMcpSearchTools,
  ...agentMcpWorldbuildingTools,
];
