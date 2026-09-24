import type { ChatMessage } from '../types/ai-service';
import { TOOL_CALL_PLACEHOLDER_VARIANTS } from 'src/constants/chat';

const clip = (text: string, length: number): string =>
  text.length <= length ? text : `${text.slice(0, length - 3)}...`;
const isQuestion = (name: string): boolean => name === 'ask_user' || name === 'ask_user_batch';

/** 问答保留全文；普通工具内容裁剪，但保留名称、调用 id 与参数开头的资源标识。 */
export function formatSummaryMessages(
  messages: ChatMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  const callNames = new Map(
    messages.flatMap((message) =>
      (message.tool_calls ?? []).map((call) => [call.id, call.function.name] as const),
    ),
  );
  const output: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'tool') {
      const name = message.name || callNames.get(message.tool_call_id ?? '') || 'unknown_tool';
      const content = message.content ?? '';
      output.push({
        role: 'assistant',
        content: `工具结果 ${name} (${message.tool_call_id ?? ''}): ${isQuestion(name) ? content : clip(content, 1200)}`,
      });
      continue;
    }
    const content = message.content?.trim();
    if (content && !(TOOL_CALL_PLACEHOLDER_VARIANTS as readonly string[]).includes(content)) {
      output.push({ role: message.role, content });
    }
    for (const call of message.tool_calls ?? []) {
      const args = call.function.arguments || '{}';
      output.push({
        role: 'assistant',
        content: `工具调用 ${call.function.name} (${call.id}): ${isQuestion(call.function.name) ? args : clip(args, 240)}`,
      });
    }
  }
  return output;
}
