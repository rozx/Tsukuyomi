import { AGENT_LOCALE, translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import { buildExternalTaskRules } from './task-rules';
import type { AgentMcpPromptDescriptor, AgentMcpPromptResult } from './types';
import { AGENT_GENERAL_RULE_KEYS, renderWorkflowSteps, type AgentWorkflowId } from './workflows';

export type AgentMcpPromptName = 'translate-chapter' | 'polish-chapter' | 'import-and-translate';

const PROMPT_DESCRIPTORS: readonly AgentMcpPromptDescriptor[] = [
  {
    name: 'translate-chapter',
    description:
      'Translate a novel chapter chunk-by-chunk using Tsukuyomi terms, character settings, memories, and batch writeback.',
    arguments: [
      { name: 'book_id', description: 'Target book ID (optional if a book is currently open).' },
      { name: 'chapter_id', description: 'Target chapter ID to translate.', required: true },
      {
        name: 'model_label',
        description: 'Optional source model label stored with submitted translations.',
      },
    ],
  },
  {
    name: 'polish-chapter',
    description:
      'Review and polish an already translated chapter for terminology consistency, character voice, and natural prose.',
    arguments: [
      { name: 'book_id', description: 'Target book ID (optional if a book is currently open).' },
      { name: 'chapter_id', description: 'Target chapter ID to polish.', required: true },
      {
        name: 'write_mode',
        description: 'append (default, adds a new version) or overwrite (revises current version).',
      },
    ],
  },
  {
    name: 'import-and-translate',
    description:
      'Import a novel from URL or local text into Tsukuyomi and immediately begin translating chapters.',
    arguments: [
      { name: 'source', description: 'Source URL, local file path, or book title to import.' },
      {
        name: 'target_language',
        description: 'Target translation locale: zh-CN, zh-TW, or en-US.',
      },
    ],
  },
];

/** 模板后面附上的规则与站内翻译 / 润色 / 校对任务是同一份文字（见 task-rules.ts） */
const RULES_HEADING = '翻译时必须遵守以下规则（与 Tsukuyomi 内置翻译相同）：';

export function listAgentMcpPrompts(): AgentMcpPromptDescriptor[] {
  return PROMPT_DESCRIPTORS.map((item) => ({
    ...item,
    arguments: item.arguments.map((arg) => ({ ...arg })),
  }));
}

/** 模板是给模型读的，与站内提示词一样固定用简体中文 */
const steps = (id: AgentWorkflowId): string[] => renderWorkflowSteps(id, AGENT_LOCALE);
const generalRules = (): string[] =>
  AGENT_GENERAL_RULE_KEYS.map((key) => `- ${translateText(AGENT_LOCALE, key)}`);
const workflowTitle = (key: MessageKey): string => translateText(AGENT_LOCALE, key);

const message = (description: string, lines: string[]): AgentMcpPromptResult => ({
  description,
  messages: [{ role: 'user', content: { type: 'text', text: lines.join('\n') } }],
});

/**
 * 工作流模板。步骤取自 workflows.ts，与快速上手指南里的是同一份文字；
 * 这里只加上本次任务的参数（哪本书、哪一章、模型名称、写入方式）和要遵守的规则。
 */
export function getAgentMcpPrompt(
  name: string,
  args: Record<string, string | undefined> = {},
): AgentMcpPromptResult | null {
  const bookHint = args.book_id
    ? `book_id="${args.book_id}"`
    : '当前打开的书籍（或先调用 list_books 确认 book_id）';
  const chapterHint = args.chapter_id
    ? `chapter_id="${args.chapter_id}"`
    : '目标章节（先调用 get_book 获取 chapter_id）';

  switch (name) {
    case 'translate-chapter':
      return message(PROMPT_DESCRIPTORS[0]!.description, [
        `请在 Tsukuyomi 中翻译 ${bookHint} 的 ${chapterHint}。按以下工作流执行：`,
        ...steps('translate-chapter'),
        '',
        args.model_label
          ? `提交时请在 model_label 中填入 "${args.model_label}"。`
          : '提交时建议在 model_label 中填入你当前使用的模型名称。',
        ...generalRules(),
        '',
        RULES_HEADING,
        buildExternalTaskRules(['translation']),
      ]);

    case 'polish-chapter':
      return message(PROMPT_DESCRIPTORS[1]!.description, [
        `请在 Tsukuyomi 中润色与校对 ${bookHint} 的 ${chapterHint}。按以下工作流执行：`,
        ...steps('polish-chapter'),
        '',
        `本次提交使用 write_mode: "${args.write_mode === 'overwrite' ? 'overwrite' : 'append'}"。完成后汇报主要改动点。`,
        ...generalRules(),
        '',
        RULES_HEADING,
        buildExternalTaskRules(['polish', 'proofreading']),
      ]);

    case 'import-and-translate':
      return message(PROMPT_DESCRIPTORS[2]!.description, [
        `请先将小说导入 Tsukuyomi 再开始翻译（${
          args.source ? `来源：${args.source}` : '用户指定的 URL 或本地文本/文件'
        }；${
          args.target_language
            ? `目标翻译语言：${args.target_language}`
            : '目标翻译语言默认 zh-CN（可按用户要求指定 zh-TW / en-US）'
        }）。`,
        '',
        `【${workflowTitle('agentMcp.guide.wfImportTitle')}】`,
        ...steps('import-book'),
        '',
        `【${workflowTitle('agentMcp.guide.wfTranslateTitle')}】导入完成后用 get_book 确认章节列表，再逐章执行：`,
        ...steps('translate-chapter'),
        '',
        ...generalRules(),
        '',
        RULES_HEADING,
        buildExternalTaskRules(['translation']),
      ]);

    default:
      return null;
  }
}
