import type { ChatMessage } from 'src/services/ai/types/ai-service';
import { countTokens as gptCountTokens } from 'gpt-tokenizer';

/**
 * 已弃用：旧的估算乘数，保留用于向后兼容
 * @deprecated 使用 countMessagesTokens 替代 estimateMessagesTokenCount
 */
export const DEFAULT_TOKEN_ESTIMATION_MULTIPLIER = 1.6;

/**
 * 将 ChatMessage 数组转换为纯文本用于 token 计算
 *
 * 注意：gpt-tokenizer 的 countTokens 在传入消息数组时需要 model 参数，
 * 但不同模型的 token 计算结果差异很小（使用相同的 tokenizer）。
 * 为了简化，我们将消息转换为纯文本进行计算。
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
 * 使用 gpt-tokenizer 精确计算消息的 token 数量
 *
 * 适用于 OpenAI 模型（GPT-3.5、GPT-4、GPT-4o 等）
 * 使用 o200k_base 编码（GPT-4o 默认编码）
 *
 * @param messages 消息数组
 * @returns token 数量
 */
export const countMessagesTokens = (messages: ChatMessage[]): number => {
  if (!messages || messages.length === 0) return 0;

  const text = messagesToText(messages);
  return gptCountTokens(text);
};

/**
 * 使用 gpt-tokenizer 精确计算文本的 token 数量
 *
 * @param text 要计算的文本
 * @returns token 数量
 */
export const countTextTokens = (text: string): number => {
  if (!text) return 0;
  return gptCountTokens(text);
};

/**
 * 估算消息的 token 数量
 *
 * 注意：此函数现在使用 gpt-tokenizer 进行精确计算
 * multiplier 参数已被忽略，保留仅为向后兼容
 *
 * @param messages 消息数组
 * @param _multiplier 已弃用，保留用于向后兼容
 * @returns token 数量
 */
export const estimateMessagesTokenCount = (
  messages: ChatMessage[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _multiplier: number = DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
): number => {
  return countMessagesTokens(messages);
};
