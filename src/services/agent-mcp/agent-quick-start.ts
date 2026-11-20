import { translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import type { ExternalAgentChannel } from 'src/models/agent-mcp';
import type { AppLocale } from 'src/models/locale';

export interface AgentQuickStartOptions {
  locale: AppLocale;
  channel: ExternalAgentChannel;
}

const OVERVIEW_KEYS: readonly MessageKey[] = [
  'agentMcp.guide.overviewContext',
  'agentMcp.guide.overviewLibrary',
];

const TASK_KEYS: readonly MessageKey[] = [
  'agentMcp.guide.taskTranslate',
  'agentMcp.guide.taskPolish',
  'agentMcp.guide.taskImport',
  'agentMcp.guide.taskUpdate',
  'agentMcp.guide.taskConsistency',
];

const RULE_KEYS: readonly MessageKey[] = [
  'agentMcp.guide.ruleIds',
  'agentMcp.guide.ruleNoRepeat',
  'agentMcp.guide.ruleConfirm',
  'agentMcp.guide.ruleAsk',
];

/**
 * 生成给外部 Agent 的快速上手指南（Markdown）：说明已连接的服务、如何了解现状、
 * 各类常见任务用哪些工具，以及必须遵守的规则。它是通用说明而不是某个具体任务，
 * 可以直接粘贴到对话里，也可以放进 Agent 的项目说明文件。
 * 桌面 MCP 通道引用 Prompt，WebMCP 通道改用工作流指南工具。
 */
export function buildAgentQuickStartGuide(options: AgentQuickStartOptions): string {
  const { locale, channel } = options;
  const isWeb = channel === 'webmcp';
  const text = (key: MessageKey): string => translateText(locale, key);
  const bullets = (keys: readonly MessageKey[]): string[] => keys.map((key) => `- ${text(key)}`);

  return [
    `# ${text('agentMcp.guide.title')}`,
    '',
    text(isWeb ? 'agentMcp.guide.introWeb' : 'agentMcp.guide.intro'),
    '',
    `## ${text('agentMcp.guide.overviewTitle')}`,
    ...bullets(OVERVIEW_KEYS),
    `- ${text(isWeb ? 'agentMcp.guide.overviewWorkflowsWeb' : 'agentMcp.guide.overviewWorkflows')}`,
    '',
    `## ${text('agentMcp.guide.tasksTitle')}`,
    ...bullets(TASK_KEYS),
    '',
    `## ${text('agentMcp.guide.rulesTitle')}`,
    ...bullets(RULE_KEYS),
  ].join('\n');
}
