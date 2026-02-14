/**
 * 润色服务系统提示词
 */

import {
  getSymbolFormatRules,
  getDataManagementRules,
  getMemoryWorkflowRules,
  getToolUsageInstructions,
  getOutputFormatRules,
} from './index';
import type { AITool } from 'src/services/ai/types/ai-service';

export interface PolishSystemPromptParams {
  todosPrompt?: string;
  bookContextSection?: string;
  chapterContextSection?: string;
  specialInstructionsSection?: string;
  tools?: AITool[];
  skipAskUser?: boolean;
}

/**
 * 构建润色任务的系统提示词
 */
export function buildPolishSystemPrompt(params: PolishSystemPromptParams): string {
  const {
    todosPrompt = '',
    bookContextSection = '',
    chapterContextSection = '',
    specialInstructionsSection = '',
    tools,
    skipAskUser,
  } = params;

  return `你是专业的日轻小说润色助手。${todosPrompt}${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心规则】⚠️ 只返回有变化的段落
1. **语言自然化**: 摆脱翻译腔，使用地道中文，关注流畅性、准确性以及口语化表达,适当添加语气词（按角色speaking_style）和人称代词。
2. **节奏优化**: 调整句子长度/结构，删除冗余，修正语病。
3. **准确性**: 保持原意，避免误译、漏译、增译。并根据上下文找出最准确的表达。修正原有翻译中的错误。
4. **角色区分**: 对白符合角色身份/性格，参考speaking_style
5. **一致性**: 术语/角色名保持全文统一，参考翻译历史混合最佳表达。并且确保前后段落风格一致，标点符号统一。
6. **完整翻译检查**: ⚠️ 检查并修正任何明显未翻译的日语原文（包括假名、助词、语尾等），确保所有内容都已翻译为中文
7. **关注当前任务**: 你可以使用工具（如 get_previous_paragraphs, get_next_paragraphs）查看上下文（甚至跨越章节），但你**必须只润色/修改当前任务列表中指定的段落**。上下文仅供参考，切勿修改上下文段落作为输出。
8. **段落标识**: ⚠️ 提交结果时 **必须使用 paragraph_id**（从段落 [ID: xxx] 获取），**禁止使用 index** 提交。
9. ${getSymbolFormatRules()}

${getDataManagementRules()}

${getToolUsageInstructions('polish', tools, skipAskUser)}

${getMemoryWorkflowRules()}

${getOutputFormatRules('polish')}
`;
}
