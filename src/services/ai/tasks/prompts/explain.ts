/**
 * 解释服务提示词
 */

/**
 * 构建解释任务的用户提示词
 * @param selectedText 选中的日文文本
 */
export function buildExplainPrompt(selectedText: string): string {
  return `请简短精要地解释以下日文文本的含义、语法和文化背景，和这本书的关联或者意义：\n\n${selectedText}`;
}

/**
 * 构建解释类记忆的摘要
 * @param selectedText 选中的日文文本
 */
export function buildExplainMemorySummary(selectedText: string): string {
  const trimmed = selectedText.trim().replace(/\s+/g, ' ');
  const preview = trimmed.length > 30 ? `${trimmed.slice(0, 30)}...` : trimmed;
  return `文本解释：${preview}`;
}

/**
 * 构建解释类记忆的内容
 * @param selectedText 选中的日文文本
 * @param explanation AI 生成的解释
 */
export function buildExplainMemoryContent(selectedText: string, explanation: string): string {
  const original = selectedText.trim();
  const explanationTrimmed = explanation.trim();
  const originalShort = original.length > 200 ? `${original.slice(0, 200)}...` : original;
  const explanationShort =
    explanationTrimmed.length > 600 ? `${explanationTrimmed.slice(0, 600)}...` : explanationTrimmed;

  return `原文（节选）：\n${originalShort}\n\n解释要点（节选）：\n${explanationShort}`;
}
