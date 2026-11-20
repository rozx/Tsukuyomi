import { AGENT_LOCALE } from 'src/i18n/translate';
import { getPhaseChecklist } from 'src/services/ai/tasks/utils/todo-workflow';
import { buildExternalTaskRules } from './task-rules';
import type { AgentMcpPromptDescriptor, AgentMcpPromptResult } from './types';

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

/** 站内任务对应阶段的待办清单，作为步骤下的子项；与站内用的是同一份文字 */
const checklist = (phase: Parameters<typeof getPhaseChecklist>[0]): string[] =>
  getPhaseChecklist(phase, AGENT_LOCALE, 'external').map((item) => `   - ${item}`);

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
    case 'translate-chapter': {
      const modelHint = args.model_label
        ? `提交时请在 model_label 中填入 "${args.model_label}"。`
        : '提交时建议在 model_label 中填入你当前使用的模型名称（如 claude-opus-4 / gemini-2.5-pro）。';
      return {
        description: PROMPT_DESCRIPTORS[0]!.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `请在 Tsukuyomi 中翻译 ${bookHint} 的 ${chapterHint}。严格按以下工作流执行：`,
                '1. 调用 `get_translation_chunk`（`mode: "untranslated"`）拉取第一块未翻译段落，以及打包好的前文衔接、命中术语、相关角色设定、相关记忆（可复用的翻译决定）、书/章级特殊指令和目标语言。',
                '2. 提交译文之前先做准备，与内置翻译的规划阶段相同。作品特有的新术语、新角色用 `upsert_terms` / `upsert_characters` 建好，可复用的翻译决定（称呼、术语、文风）用 `upsert_memory` 记下，剧情与世界观不要写进记忆：',
                ...checklist('planning'),
                '3. 逐段精准翻译：每个原文段落一一对应一个译文段落，严禁合并、删减或自行总结；严格遵循术语译法、角色称谓与说话风格、以及特殊指令。',
                `4. 调用 \`submit_translations\` 批量提交本块译文（若首块且章节标题未译，可同时传入 \`chapter_title_translation\`）。${modelHint}`,
                '5. 若书籍启用了原文前缀校验，每个提交项必须提供准确的 `original_text_prefix`（取对应原文开头 3~20 个字符）。',
                '6. 注意每段每种语言最多保留 5 个历史版本，不要对同一段落反复提交不同译文；若返回 `failed_items`，仅重试失败项。',
                '7. 这一块提交之后复核，与内置翻译的复核阶段相同：',
                ...checklist('review'),
                '8. 检查 `submit_translations` 返回的 `remaining_untranslated_count`，只要大于 0 就继续调用 `get_translation_chunk` 取下一块，直至整章翻译完成。之后的每一块只需简短准备，然后同样翻译、提交、复核：',
                ...checklist('brief'),
                '',
                RULES_HEADING,
                buildExternalTaskRules(['translation']),
              ].join('\n'),
            },
          },
        ],
      };
    }

    case 'polish-chapter': {
      const writeMode = args.write_mode === 'overwrite' ? 'overwrite' : 'append';
      return {
        description: PROMPT_DESCRIPTORS[1]!.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `请在 Tsukuyomi 中润色与校对 ${bookHint} 的 ${chapterHint}。按以下工作流执行：`,
                '1. 调用 `get_translation_chunk`（`mode: "all"`、`task_type: "polish"`，校对时用 `task_type: "proofreading"`）分块读取原文、现有译文以及命中的术语/角色/记忆与对应任务的特殊指令；不写 `task_type` 时拿到的是翻译用的特殊指令。',
                '2. 修改之前先做准备，与内置润色、校对的规划阶段相同（润色与校对没有复核阶段）：',
                ...checklist('planning'),
                '3. 核对译文是否存在漏译、错译、术语不统一、角色语气漂移或翻译腔问题，仅针对需要改进的段落生成润色后译文。',
                `4. 调用 \`submit_translations\`（\`write_mode: "${writeMode}"\`）提交改进后的段落，避免无改动段落重复写入。`,
                '5. 如校对过程中发现需要统一的术语或角色译法，调用 `upsert_terms` / `upsert_characters` 同步更新设定。',
                '6. 按返回的 `next_cursor` 顺序推进，直至整章校对完毕并汇报主要改动点。',
                '',
                RULES_HEADING,
                buildExternalTaskRules(['polish', 'proofreading']),
              ].join('\n'),
            },
          },
        ],
      };
    }

    case 'import-and-translate': {
      const sourceHint = args.source ? `来源：${args.source}` : '用户指定的 URL 或本地文本/文件';
      const langHint = args.target_language
        ? `目标翻译语言：${args.target_language}`
        : '目标翻译语言默认 zh-CN（可按用户要求指定 zh-TW / en-US）';
      return {
        description: PROMPT_DESCRIPTORS[2]!.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `请先将小说导入 Tsukuyomi 再开始翻译（${sourceHint}；${langHint}）：`,
                '1. 若来源为内置支持的小说站点 URL，优先调用 `import_book_from_url` 直接抓取导入（单次默认最多抓取 20 章，可通过 `max_chapters` 指定 1~50）；若返回的 `pending_chapter_count > 0`（`has_more: true`），可再次调用 `import_book_from_url` 续抓剩余章节，或先翻译已就绪的章节。',
                '2. 若站点不受支持、遇到浏览器跨域限制或来源是本地文件/纯文本，先自行读取并整理书名、作者、卷章结构，再调用 `create_book` 创建书籍，并用 `add_chapters` 批量写入章节原文。',
                '3. 导入完成后调用 `get_book` 确认 `book_id` 与章节列表，再按 `translate-chapter` 工作流（`get_translation_chunk` → `submit_translations` → 设定维护）逐章翻译。',
              ].join('\n'),
            },
          },
        ],
      };
    }

    default:
      return null;
  }
}
