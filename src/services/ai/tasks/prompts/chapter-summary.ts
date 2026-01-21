/**
 * 章节摘要服务提示词
 */

/**
 * 构建章节摘要任务的系统提示词
 */
export function buildChapterSummarySystemPrompt(): string {
  return `你是一位专业的轻小说编辑。请阅读以下章节内容（可能是日语原文），并用简体中文生成一个简洁的章节摘要。
要求：
1. 概括主要剧情发展。
2. 提及登场的关键角色。
3. 语言通顺流畅，字数控制在 200 字以内。
4.【重要】相关角色以及术语已提供。
5.【重要】最终只返回摘要内容，不要包含任何其他解释或前言。
`;
}

export interface ChapterSummaryUserPromptParams {
  chapterTitle?: string | undefined;
  contextInfo?: string | undefined;
  content: string;
}

/**
 * 构建章节摘要任务的用户提示词
 */
export function buildChapterSummaryUserPrompt(params: ChapterSummaryUserPromptParams): string {
  const { chapterTitle, contextInfo = '', content } = params;
  return `章节标题：${chapterTitle || '未知'}${contextInfo}\n\n内容：\n${content}`;
}
