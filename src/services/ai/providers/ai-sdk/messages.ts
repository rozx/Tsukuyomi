import type { AssistantContent, ModelMessage, ToolCallPart } from 'ai';
import type { AIProvider } from 'src/services/ai/types/ai-model';
import type {
  AIToolCall,
  ChatMessage,
  TextGenerationRequest,
} from 'src/services/ai/types/ai-service';
import { TOOL_CALL_PLACEHOLDER } from 'src/services/ai/tasks/utils/stream-handler';
import { ANTHROPIC_CONTINUE_PROMPT } from 'src/services/ai/providers/ai-sdk/anthropic';

export function normalizeBaseUrl(baseUrl?: string, fallback = 'https://api.openai.com/v1'): string {
  const value = baseUrl?.trim() || fallback;
  if (value.startsWith('/api/ai/')) {
    const origin = typeof window === 'undefined' ? 'http://localhost:9000' : window.location.origin;
    return `${origin}${value}`.replace(/\/+$/, '');
  }
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, '') || '/v1';
    return url.toString();
  } catch {
    return value;
  }
}

function toolPart(call: AIToolCall, index: number, provider: AIProvider): ToolCallPart {
  let input: unknown;
  try {
    input = JSON.parse(call.function.arguments);
  } catch {
    input = call.function.arguments;
  }
  const metadata = { ...call.providerMetadata };
  if (provider === 'gemini' && index === 0 && !metadata.google?.thoughtSignature) {
    metadata.google = { ...metadata.google, thoughtSignature: 'skip_thought_signature_validator' };
  }
  return {
    type: 'tool-call',
    toolCallId: call.id,
    toolName: call.function.name,
    input,
    // provider 元数据来自 JSON 响应，原样回传，不解释厂商私有字段。
    ...(Object.keys(metadata).length
      ? { providerOptions: metadata as NonNullable<ToolCallPart['providerOptions']> }
      : {}),
  };
}

type ReasoningPart = Extract<Exclude<AssistantContent, string>[number], { type: 'reasoning' }>;

/** Anthropic 只认带签名或 redacted 数据的思考块；按原顺序回放，其它厂商的元数据丢弃。 */
function anthropicReasoning(message: ChatMessage, provider: AIProvider): ReasoningPart[] {
  if (provider !== 'anthropic') return [];
  return (message.reasoning_parts ?? [])
    .filter(({ providerMetadata }) => {
      const metadata = providerMetadata?.anthropic;
      return !!metadata && (!!metadata.signature || !!metadata.redactedData);
    })
    .map(({ text, providerMetadata }) => ({
      type: 'reasoning',
      text,
      providerOptions: { anthropic: providerMetadata!.anthropic! } as NonNullable<
        ReasoningPart['providerOptions']
      >,
    }));
}

export function toModelMessages(
  request: TextGenerationRequest,
  provider: AIProvider,
): ModelMessage[] {
  const history = request.messages?.length
    ? request.messages
    : [{ role: 'user' as const, content: request.prompt ?? '' }];
  const names = new Map(
    history.flatMap(
      (message) => message.tool_calls?.map((call) => [call.id, call.function.name] as const) ?? [],
    ),
  );
  const result: ModelMessage[] = [];
  for (const message of history) {
    if (message.role === 'tool') {
      result.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: message.tool_call_id ?? '',
            toolName: message.name ?? names.get(message.tool_call_id ?? '') ?? '',
            output: {
              type: 'text',
              value: message.content?.trim() ? message.content : '（工具返回为空）',
            },
          },
        ],
      });
    } else if (message.role === 'assistant' && message.tool_calls?.length) {
      result.push({
        role: 'assistant',
        content: [
          // 开启思考时带 tool_use 的 assistant 消息必须以原样的 thinking 块开头
          ...anthropicReasoning(message, provider),
          { type: 'text', text: message.content?.trim() ? message.content : TOOL_CALL_PLACEHOLDER },
          ...message.tool_calls.map((call, index) => toolPart(call, index, provider)),
        ],
      });
    } else if (message.role === 'assistant' && anthropicReasoning(message, provider).length) {
      result.push({
        role: 'assistant',
        content: [
          ...anthropicReasoning(message, provider),
          ...(message.content?.trim() ? [{ type: 'text' as const, text: message.content }] : []),
        ],
      });
    } else if (message.content?.trim()) {
      result.push({ role: message.role, content: message.content });
    }
  }
  if (provider === 'anthropic' && result.at(-1)?.role === 'assistant')
    result.push({ role: 'user', content: ANTHROPIC_CONTINUE_PROMPT });
  return result;
}
