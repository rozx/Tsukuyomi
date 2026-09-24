import type { ChatMessage, AITool } from 'src/services/ai/types/ai-service';
import { countTokens as gptCountTokens } from 'gpt-tokenizer';

/**
 * 尚无厂商实测用量时的保守估算系数。
 */
export const DEFAULT_TOKEN_ESTIMATION_MULTIPLIER = 1.6;

/**
 * 将 ChatMessage 数组转换为纯文本用于 token 计算
 *
 * 用内容、角色和工具标识计算本地 tokenizer 基线。厂商的分词和封装方式不同，
 * 该计数仍是估算，需要结合实测 usage 自校准。
 */
const messagesToText = (messages: ChatMessage[]): string => {
  return messages
    .map((msg) => {
      const parts: string[] = [];

      // 角色标记（模拟 OpenAI 的 token 开销）
      parts.push(`<|${msg.role}|>`);

      // 主要内容
      if (msg.content) {
        parts.push(msg.content);
      }

      // 工具调用（assistant 消息可能包含）
      if ('tool_calls' in msg && msg.tool_calls) {
        try {
          parts.push(JSON.stringify(msg.tool_calls));
        } catch (error) {
          console.warn('Token count serialization error:', error);
          parts.push('tool_calls_placeholder');
        }
      }

      // 工具调用 ID（tool 消息包含）
      if ('tool_call_id' in msg && msg.tool_call_id) {
        parts.push(msg.tool_call_id);
      }

      // 函数名称（tool 消息包含）
      if ('name' in msg && msg.name) {
        parts.push(msg.name);
      }

      // 思考内容（reasoning_content）
      if ('reasoning_content' in msg && msg.reasoning_content) {
        parts.push(msg.reasoning_content);
      }

      return parts.join('\n');
    })
    .join('\n');
};

/**
 * 使用 gpt-tokenizer 计算消息的基础估算
 *
 * 适用于 OpenAI 模型（GPT-3.5、GPT-4、GPT-4o 等）
 * 使用 o200k_base 编码（GPT-4o 默认编码）
 *
 * @param messages 消息数组
 * @returns token 数量
 */
const countMessagesTokens = (messages: ChatMessage[]): number => {
  if (!messages || messages.length === 0) return 0;

  const text = messagesToText(messages);
  return gptCountTokens(text);
};

/**
 * 估算消息的 token 数量
 *
 * @param messages 消息数组
 * @param multiplier 模型校准系数；传 1 获取未经校准的基础估算
 * @returns token 数量
 */
export const estimateMessagesTokenCount = (
  messages: ChatMessage[],
  multiplier: number = DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
): number => {
  return Math.ceil(countMessagesTokens(messages) * multiplier);
};

/**
 * 估算 API tools 参数（工具 JSON schemas）的 token 数量。
 *
 * API 提供商会将 tools 参数中的完整 JSON schema 计入上下文窗口，
 * 但 estimateMessagesTokenCount 仅统计消息内容，不包含 tools 参数。
 * 此函数用于补充这部分 token 开销。
 *
 * @param tools 传递给 API 的工具定义数组
 * @returns token 数量（tools 为空时返回 0）
 */
export const estimateToolSchemaTokens = (tools: AITool[], multiplier = 1): number => {
  if (!tools || tools.length === 0) return 0;
  try {
    const toolSchemaText = JSON.stringify(tools);
    return Math.ceil(gptCountTokens(toolSchemaText) * multiplier);
  } catch {
    return 0;
  }
};
