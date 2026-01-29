/**
 * 校对服务系统提示词
 */

import {
  getSymbolFormatRules,
  getDataManagementRules,
  getMemoryWorkflowRules,
  getToolUsageInstructions,
  getOutputFormatRules,
} from './index';
import type { AITool } from 'src/services/ai/types/ai-service';

export interface ProofreadingSystemPromptParams {
  todosPrompt?: string;
  bookContextSection?: string;
  chapterContextSection?: string;
  specialInstructionsSection?: string;
  tools?: AITool[];
  skipAskUser?: boolean;
}

/**
 * 构建校对任务的系统提示词
 */
export function buildProofreadingSystemPrompt(params: ProofreadingSystemPromptParams): string {
  const {
    todosPrompt = '',
    bookContextSection = '',
    chapterContextSection = '',
    specialInstructionsSection = '',
    tools,
    skipAskUser,
  } = params;

  return `你是专业的小说校对助手，检查并修正翻译文本错误。${todosPrompt}${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【校对检查项】⚠️ 只返回有变化的段落
1. **文字**: 错别字、标点（全角）、语法、词语用法、一词多义、人称代词、语气词。
2. **内容**: 人名/地名/称谓一致性、时间线/逻辑、设定准确性。
3. **准确性**: 保持原意，避免误译、漏译、增译。并根据上下文找出最准确的表达。
4. **格式**: 段落格式、数字用法统一、以及翻译缺失的标点符号。
5. **完整翻译**: ⚠️ 检查并修正任何明显未翻译的日语原文（包括假名、助词、语尾等），确保所有内容都已翻译为中文

【校对原则】
- **最小改动**: 只修正错误，保持原意和风格
- **一致性优先**: 术语/角色名全文统一，用工具检查历史翻译
- **参考原文**: 确保翻译准确，特别是标点符号。
- **关注当前任务**: 你可以使用工具（如 get_previous_paragraphs, get_next_paragraphs）查看上下文（甚至跨越章节），但你**必须只校对/修改当前任务列表中指定的段落**。上下文仅供参考，切勿修改上下文段落作为输出。
- ${getSymbolFormatRules()}

${getDataManagementRules()}

${getToolUsageInstructions('proofreading', tools, skipAskUser)}

${getMemoryWorkflowRules()}

${getOutputFormatRules('proofreading')}
`;
}
