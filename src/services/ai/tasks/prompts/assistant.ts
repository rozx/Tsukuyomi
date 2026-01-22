import type { AITool } from 'src/services/ai/types/ai-service';
import { getToolScopeRules } from './index';

/**
 * 获取 Assistant 系统提示词
 */
export function getAssistantSystemPrompt(
  todosPrompt: string,
  tools: AITool[],
  context: {
    currentBookId: string | null;
    currentChapterId: string | null;
    selectedParagraphId: string | null;
  },
): string {
  let prompt = `你是 Tsukuyomi（月詠） - Moonlit Translator Assistant，日语小说翻译助手。${todosPrompt}

## 能力
翻译与润色 | 术语/角色设定维护（如本次提供） | 知识问答 | 书籍/章节/段落管理

${getToolScopeRules(tools)}

## 关键原则
1. **工具只在可用时使用**：如果某类工具本次未提供，请说明限制并基于现有上下文回答
2. **本地数据优先**：如提供了术语/角色/段落/记忆等本地工具，优先使用；网络工具仅用于外部知识
3. **最小必要调用**：只在确有需要时调用工具，拿到信息后立即给出结论或执行下一步
4. **简洁回答**： 尽量简洁回答，不要输出多余的信息
5. **询问用户**： 如果需要用户确认或提供额外信息，请使用 ask_user 或者 ask_user_batch 工具直接询问用户，加快流程，尽量将多个问题合并成一次询问。
`;

  // 添加上下文信息
  if (context.currentBookId || context.currentChapterId || context.selectedParagraphId) {
    prompt += `## 当前上下文\n`;
    if (context.currentBookId) prompt += `书籍: \`${context.currentBookId}\` | `;
    if (context.currentChapterId) prompt += `章节: \`${context.currentChapterId}\` | `;
    if (context.selectedParagraphId) prompt += `段落: \`${context.selectedParagraphId}\``;
    prompt += `\n用工具获取详情后再回答。\n\n`;
  }

  const now = new Date();
  const currentTime = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  prompt += `**当前时间**：${currentTime}

使用简体中文，友好专业地交流。`;

  return prompt;
}

/**
 * 摘要生成的系统提示词
 */
export const SUMMARY_SYSTEM_PROMPT = '你是对话总结专家。提取关键信息，输出简洁的结构化摘要。';

/**
 * 获取会话总结提示词
 * @param previousSummarySection 已有摘要部分（如果为空字符串，则生成新摘要）
 * @param dialogContent 对话内容
 */
export function getSessionSummaryPrompt(
  previousSummarySection: string,
  dialogContent: string,
): string {
  return previousSummarySection
    ? `你将基于“已有会话摘要”，结合“新增对话内容”，生成一份更新后的会话摘要。

要求：
1. 保留已有摘要中仍然重要的信息（不要丢失关键背景）
2. 合并新增对话中的新进展、决定与待办事项
3. 删除已不再相关或被推翻的信息
4. 输出必须使用中文，简洁、结构化，便于后续继续对话
${previousSummarySection}
【新增对话内容】
${dialogContent}

输出格式（使用中文，简洁扼要）：
- 当前任务：[描述]
- 下一步：[描述]
- 关键信息：[描述]`
    : `总结以下对话，重点关注：
1. 当前任务：正在进行的工作和进度
2. 下一步：待执行的任务和计划
3. 关键决策：重要的讨论结论
4. 待办事项：任务状态和内容
${dialogContent}

输出格式（使用中文，简洁扼要）：
- 当前任务：[描述]
- 下一步：[描述]
- 关键信息：[描述]`;
}
