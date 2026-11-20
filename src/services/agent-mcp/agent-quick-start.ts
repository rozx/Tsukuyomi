import { translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import type { ExternalAgentChannel } from 'src/models/agent-mcp';
import type { AppLocale } from 'src/models/locale';
import {
  buildDesktopClaudeCommand,
  buildRelayClaudeCommand,
  buildRelayJsonConfig,
  TOKEN_PLACEHOLDER,
} from './client-config';
import { APP_VERSION } from 'src/constants/version';
import { buildExternalTaskRules } from './task-rules';
import type { AgentMcpToolCategory, AgentMcpToolSpec } from './types';
import { AGENT_GENERAL_RULE_KEYS, AGENT_WORKFLOWS, renderWorkflowSteps } from './workflows';

/** 指南里「如何添加 MCP」一节需要的连接信息 */
export type AgentQuickStartConnection =
  | { kind: 'desktop'; endpointUrl: string; token: string }
  | { kind: 'relay'; pageOrigin: string };

export interface AgentQuickStartOptions {
  locale: AppLocale;
  channel: ExternalAgentChannel;
  connection: AgentQuickStartConnection;
  /** 指南的工具一览列出这些工具；界面与内核传入的都是已注册的全部工具 */
  tools: readonly AgentMcpToolSpec[];
}

const CATEGORY_ORDER: ReadonlyArray<{ category: AgentMcpToolCategory; labelKey: MessageKey }> = [
  { category: 'context', labelKey: 'agentMcp.catalog.categoryContext' },
  { category: 'library', labelKey: 'agentMcp.catalog.categoryLibrary' },
  { category: 'translation', labelKey: 'agentMcp.catalog.categoryTranslation' },
  { category: 'worldbuilding', labelKey: 'agentMcp.catalog.categoryWorldbuilding' },
];

const CONCEPT_KEYS: readonly MessageKey[] = [
  'agentMcp.guide.conceptStructure',
  'agentMcp.guide.conceptVersions',
  'agentMcp.guide.conceptWorld',
  'agentMcp.guide.conceptIds',
];

const OVERVIEW_KEYS: readonly MessageKey[] = [
  'agentMcp.guide.overviewContext',
  'agentMcp.guide.overviewLibrary',
  'agentMcp.guide.overviewSearch',
  'agentMcp.guide.overviewHelp',
];

const ERROR_KEYS: readonly MessageKey[] = [
  'agentMcp.guide.errPermission',
  'agentMcp.guide.errNotReady',
  'agentMcp.guide.errBookRequired',
  'agentMcp.guide.errNotFound',
  'agentMcp.guide.errSource',
  'agentMcp.guide.errOther',
];

function codeBlock(language: string, code: string): string[] {
  return ['```' + language, code, '```'];
}

/**
 * 生成给外部 Agent 的快速上手指南（Markdown）。开头的「首次设置」让 Agent 替用户建好项目
 * 文件夹、在其中配置 MCP、把指南存为该文件夹里的 AGENTS.md，之后用户不用再粘贴；随后
 * 依次是数据模型、如何了解现状、全部工具、分步工作流、规则与出错处理。
 * 它是通用说明而不是某个具体任务。
 *
 * 桌面通道直连本地 MCP 服务并引用 Prompt；浏览器通道经 webmcp-local-relay 连接，
 * 改用工作流指南工具，并说明中继自带的管理工具。工具一览直接由已注册的工具生成。
 */
export function buildAgentQuickStartGuide(options: AgentQuickStartOptions): string {
  const { locale, channel, connection } = options;
  const isWeb = channel === 'webmcp';
  const text = (key: MessageKey): string => translateText(locale, key);
  const bullets = (keys: readonly MessageKey[]): string[] => keys.map((key) => `- ${text(key)}`);
  // 首次设置：让 Agent 替用户建好项目文件夹、在其中配置 MCP、把本指南存为 AGENTS.md
  // 列表项内的续行与代码块缩进三格；多行内容逐行缩进
  const indent = (lines: string[]): string[] =>
    lines.flatMap((entry) => entry.split('\n')).map((line) => (line ? `   ${line}` : line));
  const mcpSetup =
    connection.kind === 'desktop'
      ? [
          ...codeBlock(
            'bash',
            buildDesktopClaudeCommand(connection.endpointUrl, connection.token, {
              projectScope: true,
            }),
          ),
          translateText(locale, 'agentMcp.guide.setupMcpOtherDesktop', {
            url: connection.endpointUrl,
            token: connection.token || TOKEN_PLACEHOLDER,
          }),
        ]
      : [
          ...codeBlock(
            'bash',
            buildRelayClaudeCommand(connection.pageOrigin, { projectScope: true }),
          ),
          text('agentMcp.guide.setupMcpOtherRelay'),
          ...codeBlock('json', buildRelayJsonConfig(connection.pageOrigin)),
        ];
  const setup = [
    text('agentMcp.guide.setupIntro'),
    '',
    `1. ${text('agentMcp.guide.setupFolder')}`,
    `2. ${text('agentMcp.guide.setupMcp')}`,
    ...indent(mcpSetup),
    `3. ${text('agentMcp.guide.setupSave')}`,
    `4. ${text('agentMcp.guide.setupFinish')}`,
    '',
    text(
      connection.kind === 'desktop'
        ? 'agentMcp.guide.setupPrereqDesktop'
        : 'agentMcp.guide.setupPrereqWeb',
    ),
    // 桌面端的连接命令里带有访问令牌
    ...(connection.kind === 'desktop' ? ['', text('agentMcp.guide.setupTokenWarning')] : []),
  ];

  // 工具一览：按类别列出该通道的全部工具，说明取自界面文案，标出写入与危险工具
  const channelTools = options.tools.filter((tool) => !tool.webMcpOnly || isWeb);
  const toolReference = CATEGORY_ORDER.flatMap(({ category, labelKey }) => {
    const tools = channelTools.filter((tool) => tool.category === category);
    if (tools.length === 0) return [];
    return [
      '',
      `**${text(labelKey)}**`,
      ...tools.map((tool) => {
        const mark =
          tool.permission === 'full'
            ? text('agentMcp.guide.toolDangerMark')
            : tool.readOnlyHint
              ? ''
              : text('agentMcp.guide.toolWriteMark');
        const description = translateText(locale, `agentMcp.tools.${tool.name}` as MessageKey);
        return `- \`${tool.name}\`${mark}${text('agentMcp.guide.toolSeparator')}${description}`;
      }),
    ];
  });

  // 步骤与 MCP 工作流模板共用 workflows.ts 里的同一份
  const workflows = AGENT_WORKFLOWS.flatMap(({ id, titleKey }) => [
    '',
    `### ${text(titleKey)}`,
    ...renderWorkflowSteps(id, locale),
  ]);

  return [
    `# ${text('agentMcp.guide.title')}`,
    '',
    text(isWeb ? 'agentMcp.guide.introWeb' : 'agentMcp.guide.intro'),
    '',
    // 保存下来的指南不会随应用更新：带上版本，Agent 才能发现手里的是旧版
    translateText(locale, 'agentMcp.guide.versionNote', { version: APP_VERSION }),
    '',
    `## ${text('agentMcp.guide.setupTitle')}`,
    ...setup,
    '',
    `## ${text('agentMcp.guide.conceptsTitle')}`,
    ...bullets(CONCEPT_KEYS),
    '',
    `## ${text('agentMcp.guide.overviewTitle')}`,
    // 经本地中继连接时，先确认页面已连上，并说明看不到工具时的调用方式
    ...(isWeb ? bullets(['agentMcp.guide.overviewRelay']) : []),
    ...bullets(OVERVIEW_KEYS),
    `- ${text(isWeb ? 'agentMcp.guide.overviewWorkflowsWeb' : 'agentMcp.guide.overviewWorkflows')}`,
    `- ${text('agentMcp.guide.overviewVersion')}`,
    '',
    `## ${text('agentMcp.guide.toolsTitle')}`,
    text('agentMcp.guide.toolsNote'),
    ...toolReference,
    '',
    `## ${text('agentMcp.guide.workflowsTitle')}`,
    text('agentMcp.guide.workflowsNote'),
    ...workflows,
    '',
    `## ${text('agentMcp.guide.translationRulesTitle')}`,
    text('agentMcp.guide.translationRulesNote'),
    '',
    // 与站内翻译 / 润色 / 校对任务的系统提示词是同一份文字；给模型读的规则固定用简体中文
    buildExternalTaskRules(['translation', 'polish', 'proofreading']),
    '',
    `## ${text('agentMcp.guide.rulesTitle')}`,
    ...bullets(AGENT_GENERAL_RULE_KEYS),
    '',
    `## ${text('agentMcp.guide.errorsTitle')}`,
    ...bullets(ERROR_KEYS),
    ...(isWeb ? bullets(['agentMcp.guide.errRelay']) : []),
  ].join('\n');
}
