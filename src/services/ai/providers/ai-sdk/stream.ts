import type { LanguageModelUsage, TextStreamPart, ToolSet } from 'ai';
import type {
  AIToolCall,
  TextGenerationResult,
  TextGenerationStreamCallback,
} from 'src/services/ai/types/ai-service';
import { AIEmptyResponseError } from 'src/services/ai/core/errors';

function reportedUsage(usage: LanguageModelUsage): TextGenerationResult['usage'] {
  const result: NonNullable<TextGenerationResult['usage']> = {};
  const raw = usage.raw;
  if (!raw) return undefined;
  const inputDetails = raw.prompt_tokens_details as Record<string, unknown> | undefined;
  const outputDetails = raw.completion_tokens_details as Record<string, unknown> | undefined;
  // SDK 将缺失细项归零；用原始字段确认存在性，不能把缺省误报为实测零。
  const values = {
    inputTokens: raw.prompt_tokens ?? raw.promptTokenCount,
    outputTokens:
      typeof (raw.completion_tokens ?? raw.candidatesTokenCount) === 'number'
        ? usage.outputTokens
        : undefined,
    reasoningTokens: outputDetails?.reasoning_tokens ?? raw.thoughtsTokenCount,
    cachedInputTokens: inputDetails?.cached_tokens ?? raw.cachedContentTokenCount,
  };
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

/** 只收集原始参数；SDK 的工具校验结果不决定应用是否执行工具。 */
export async function collectStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  responseMetadata: { modelId: string; toolCallOrder?: string[] },
  onChunk?: TextGenerationStreamCallback,
  signal?: AbortSignal,
): Promise<TextGenerationResult> {
  let text = '';
  let reasoning = '';
  let usage: TextGenerationResult['usage'];
  const calls = new Map<string, { call: AIToolCall; hasRaw: boolean }>();
  const ensureCall = (id: string, name: string) => {
    let entry = calls.get(id);
    if (!entry) {
      entry = {
        call: {
          id: id || crypto.randomUUID(),
          type: 'function',
          function: { name, arguments: '' },
        },
        hasRaw: false,
      };
      calls.set(id, entry);
    } else if (name) entry.call.function.name = name;
    return entry;
  };
  for await (const part of stream) {
    signal?.throwIfAborted();
    const model = responseMetadata.modelId;
    if (part.type === 'error') throw part.error;
    if (part.type === 'abort') throw new DOMException('请求已取消', 'AbortError');
    if (part.type === 'text-delta') {
      text += part.text;
      await onChunk?.({ text: part.text, done: false, model });
    } else if (part.type === 'reasoning-delta') {
      reasoning += part.text;
      await onChunk?.({ text: '', reasoningContent: part.text, done: false, model });
    } else if (part.type === 'tool-input-start') {
      const entry = ensureCall(part.id, part.toolName);
      if (part.providerMetadata) entry.call.providerMetadata = part.providerMetadata;
    } else if (part.type === 'tool-input-delta') {
      const entry = ensureCall(part.id, '');
      entry.call.function.arguments += part.delta;
      entry.hasRaw = true;
    } else if (part.type === 'tool-call') {
      const entry = ensureCall(part.toolCallId, part.toolName);
      if (!entry.hasRaw) entry.call.function.arguments = JSON.stringify(part.input) ?? '';
      if (part.providerMetadata) entry.call.providerMetadata = part.providerMetadata;
    } else if (part.type === 'finish-step') {
      responseMetadata.modelId = part.response.modelId || model;
      usage = reportedUsage(part.usage);
    }
  }
  signal?.throwIfAborted();
  const toolCalls = [...calls.values()]
    .map(({ call }) => call)
    .filter((call) => call.function.name.trim());
  if (responseMetadata.toolCallOrder?.length) {
    const order = new Map(responseMetadata.toolCallOrder.map((id, index) => [id, index]));
    toolCalls.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  }
  text = text.trim();
  if (!text && !toolCalls.length) throw new AIEmptyResponseError();
  const model = responseMetadata.modelId;
  await onChunk?.({ text: '', done: true, model, ...(toolCalls.length ? { toolCalls } : {}) });
  return {
    text,
    model,
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(reasoning ? { reasoningContent: reasoning.trim() } : {}),
    ...(usage ? { usage } : {}),
  };
}
