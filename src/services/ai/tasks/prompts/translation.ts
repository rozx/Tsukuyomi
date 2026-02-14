/**
 * 翻译服务系统提示词
 */

import {
  getSymbolFormatRules,
  getDataManagementRules,
  getMemoryWorkflowRules,
  getToolUsageInstructions,
  getOutputFormatRules,
} from './index';
import type { AITool } from 'src/services/ai/types/ai-service';

export interface TranslationSystemPromptParams {
  todosPrompt?: string;
  bookContextSection?: string;
  chapterContextSection?: string;
  previousChapterSection?: string;
  specialInstructionsSection?: string;
  tools?: AITool[];
  skipAskUser?: boolean;
  /**
   * 是否在提示词中包含章节标题翻译指令（默认 true）
   * 仅第一个 chunk 需要翻译标题，后续 chunk 应设为 false
   */
  includeChapterTitle?: boolean;
}

/**
 * 构建翻译任务的系统提示词
 */
export function buildTranslationSystemPrompt(params: TranslationSystemPromptParams): string {
  const {
    todosPrompt = '',
    bookContextSection = '',
    chapterContextSection = '',
    previousChapterSection = '',
    specialInstructionsSection = '',
    tools,
    skipAskUser,
    includeChapterTitle = true,
  } = params;

  return `你是专业的日轻小说翻译助手，将日语翻译为自然流畅的简体中文。${todosPrompt}${bookContextSection}${chapterContextSection}${previousChapterSection}${specialInstructionsSection}

【核心规则】
1. **核心要求**: 重点关注**流畅性、准确性以及口语化表达**
2. **1:1对应**: 一个原文段落=一个翻译段落，禁止合并/拆分
3. **术语一致**: 使用术语表、角色表、记忆确保全文一致，及时更新术语表和角色表。及时更新角色全名，将姓/名分别添加进别名中。
4. **自然流畅**: 符合轻小说风格，适当添加语气词（按角色speaking_style）和人称代词。
5. **前后一致**: 必须参考前文翻译的段落、标题和相关记忆，保持标题/人名/术语/风格/称呼一致。翻译前使用工具获取相关信息。
6. **保持原意**: 避免误译、漏译、增译。根据上下文找出最准确的表达。
7. **完整翻译**: ⚠️ 必须翻译所有单词和短语，禁止在翻译结果中保留明显未翻译的日语原文（尤其是假名、助词、语尾等）
8. **关注当前任务**: 你可以使用工具（如 get_previous_paragraphs, get_next_paragraphs）查看上下文（甚至跨越章节），但你**必须只翻译/修改当前任务列表中指定的段落**。上下文仅供参考，切勿翻译上下文段落作为输出。
9. **段落标识**: ⚠️ 提交翻译时 **必须使用 paragraph_id**（从段落 [ID: xxx] 获取），**禁止使用 index** 提交。
10. ${getSymbolFormatRules()}

${getDataManagementRules()}

${getToolUsageInstructions('translation', tools, skipAskUser)}

${getMemoryWorkflowRules()}

${getOutputFormatRules('translation', { includeChapterTitle })}
`;
}
