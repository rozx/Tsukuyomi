import type { ChatMessage } from 'src/services/ai/types/ai-service';

export const DEFAULT_TOKEN_ESTIMATION_MULTIPLIER = 1.6;

export const estimateMessagesTokenCount = (
  messages: ChatMessage[],
  multiplier: number = DEFAULT_TOKEN_ESTIMATION_MULTIPLIER,
): number => {
  if (!messages || messages.length === 0) return 0;
  const totalContent = messages
    .map((msg) => {
      const parts: string[] = [];
      if (msg.content) {
        parts.push(msg.content);
      }
      if ('tool_calls' in msg && msg.tool_calls) {
        try {
          parts.push(JSON.stringify(msg.tool_calls));
        } catch (error) {
          console.warn('Token count serialization error:', error);
          // 避免循环引用导致序列化失败
          parts.push('tool_calls_placeholder');
        }
      }
      if ('tool_call_id' in msg && msg.tool_call_id) {
        parts.push(msg.tool_call_id);
      }
      if ('name' in msg && msg.name) {
        parts.push(msg.name);
      }
      return parts.join('\n');
    })
    .join('\n');
  return Math.ceil(totalContent.length * multiplier);
};
