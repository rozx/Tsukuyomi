/**
 * 单段落润色专用提示词
 * 无状态机，直接处理并返回结果
 */

import { getSymbolFormatRules, getToolScopeRules } from './common';
import type { AITool } from 'src/services/ai/types/ai-service';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';

export interface SingleParagraphPolishSystemPromptParams {
  bookContextSection?: string;
  chapterContextSection?: string;
  specialInstructionsSection?: string;
  tools?: AITool[];
}

/**
 * 构建单段落润色的系统提示词
 */
export function buildSingleParagraphPolishSystemPrompt(
  params: SingleParagraphPolishSystemPromptParams,
): string {
  const {
    bookContextSection = '',
    chapterContextSection = '',
    specialInstructionsSection = '',
    tools,
  } = params;

  return `你是专业的日轻小说润色助手。${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心规则】⚠️ 只返回有变化的段落
1. **语言自然化**: 摆脱翻译腔，使用地道中文，关注流畅性、准确性以及口语化表达，适当添加语气词（按角色speaking_style）和人称代词。
2. **节奏优化**: 调整句子长度/结构，删除冗余，修正语病。
3. **准确性**: 保持原意，避免误译、漏译、增译。并根据上下文找出最准确的表达。修正原有翻译中的错误。
4. **角色区分**: 对白符合角色身份/性格，参考speaking_style
5. **一致性**: 术语/角色名保持全文统一，参考翻译历史混合最佳表达。并且确保前后段落风格一致，标点符号统一。
6. **完整翻译检查**: ⚠️ 检查并修正任何明显未翻译的日语原文（包括假名、助词、语尾等），确保所有内容都已翻译为中文
7. **关注当前段落**: 上下文段落仅供参考，你**只需润色当前待处理的段落**。
8. **段落标识**: ⚠️ 提交结果时 **必须使用 paragraph_id**（从段落 [ID: xxx] 获取），**禁止使用 index** 提交。
9. ${getSymbolFormatRules()}

${getToolScopeRules(tools)}

【工具使用建议】
- 默认上下文已包含前后段落、角色、术语、书籍信息和章节摘要
- 仅在需要更多信息时使用工具（如查询更多段落、搜索记忆、搜索章节摘要等）
- 使用 \`add_translation_batch\` 提交润色结果（单次上限 ${MAX_TRANSLATION_BATCH_SIZE} 段）
- ⛔ **禁止**创建/修改/删除术语或角色设定，本次任务只做润色
- **最小必要**：拿到信息后立刻提交结果

⚠️ **不要输出任何文本**，直接调用 \`add_translation_batch\` 提交润色结果。如果段落无需改动则直接结束，不要输出任何内容。
`;
}

/**
 * 构建单段落润色的用户提示词
 */
export function buildSingleParagraphPolishUserPrompt(params: {
  paragraphId: string;
  originalText: string;
  currentTranslation: string;
  defaultContext: string;
}): string {
  const { paragraphId, originalText, currentTranslation, defaultContext } = params;

  return `润色以下段落。不要输出文本，直接调用工具提交。
${defaultContext}

【待润色段落】
[ID: ${paragraphId}]
原文: ${originalText}
当前翻译: ${currentTranslation}`;
}
