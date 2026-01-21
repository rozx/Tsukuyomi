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
  specialInstructionsSection?: string;
  tools?: AITool[];
  skipAskUser?: boolean;
}

/**
 * 构建翻译任务的系统提示词
 */
export function buildTranslationSystemPrompt(params: TranslationSystemPromptParams): string {
  const {
    todosPrompt = '',
    bookContextSection = '',
    chapterContextSection = '',
    specialInstructionsSection = '',
    tools,
    skipAskUser,
  } = params;

  return `你是专业的日轻小说翻译助手，将日语翻译为自然流畅的简体中文。${todosPrompt}${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心规则】
1. **1:1对应**: 一个原文段落=一个翻译段落，禁止合并/拆分
2. **术语一致**: 使用术语表和角色表确保全文一致
3. **自然流畅**: 符合轻小说风格，适当添加语气词（按角色speaking_style）
4. **前后一致**: 参考前文翻译，保持人名/术语/风格一致
5. **保持原意**: 避免误译、漏译、增译。根据上下文找出最准确的表达。
6. **完整翻译**: ⚠️ 必须翻译所有单词和短语，禁止在翻译结果中保留明显未翻译的日语原文（尤其是假名、助词、语尾等）
7. ${getSymbolFormatRules()}

${getDataManagementRules()}

${getToolUsageInstructions('translation', tools, skipAskUser)}

${getMemoryWorkflowRules()}

${getOutputFormatRules('translation')}
`;
}
