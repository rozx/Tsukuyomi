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

