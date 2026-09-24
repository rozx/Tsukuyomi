import type { ModelMessage, ToolCallPart } from 'ai';
import type { AIProvider } from 'src/services/ai/types/ai-model';
import type { AIToolCall, TextGenerationRequest } from 'src/services/ai/types/ai-service';
import { TOOL_CALL_PLACEHOLDER } from 'src/services/ai/tasks/utils/stream-handler';

export function normalizeBaseUrl(baseUrl?: string): string {
  const value = baseUrl?.trim() || 'https://api.openai.com/v1';
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
          { type: 'text', text: message.content?.trim() ? message.content : TOOL_CALL_PLACEHOLDER },
          ...message.tool_calls.map((call, index) => toolPart(call, index, provider)),
        ],
      });
    } else if (message.content?.trim()) {
      result.push({ role: message.role, content: message.content });
    }
  }
  return result;
}
