import type { LanguageModelUsage, TextStreamPart, ToolSet } from 'ai';
import type {
  AIReasoningPart,
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
  const outputDetails = (raw.completion_tokens_details ?? raw.output_tokens_details) as
    | Record<string, unknown>
    | undefined;
  // SDK 将缺失细项归零；用原始字段确认存在性，不能把缺省误报为实测零。
  // Anthropic 的 input_tokens 不含缓存读写，总输入取 SDK 汇总值。
  const values = {
    inputTokens:
      raw.prompt_tokens ??
      raw.promptTokenCount ??
      (typeof raw.input_tokens === 'number' ? usage.inputTokens : undefined),
    outputTokens:
      typeof (raw.completion_tokens ?? raw.candidatesTokenCount ?? raw.output_tokens) === 'number'
        ? usage.outputTokens
        : undefined,
    reasoningTokens:
      outputDetails?.reasoning_tokens ?? outputDetails?.thinking_tokens ?? raw.thoughtsTokenCount,
    cachedInputTokens:
      inputDetails?.cached_tokens ?? raw.cachedContentTokenCount ?? raw.cache_read_input_tokens,
  };
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

/** 按思考块收集文字与元数据（签名随 delta 到达，redacted 数据随 start 到达）。 */
function createReasoningCollector() {
  let text = '';
  const parts = new Map<string, AIReasoningPart>();
  const entry = (id: string, metadata?: AIReasoningPart['providerMetadata']) => {
    let part = parts.get(id);
    if (!part) parts.set(id, (part = { text: '' }));
    if (metadata) {
      const merged = { ...part.providerMetadata };
      for (const [provider, values] of Object.entries(metadata))
        merged[provider] = { ...merged[provider], ...values };
      part.providerMetadata = merged;
    }
    return part;
  };
  return {
    /** 返回本次思考文字增量；不是思考事件时返回 undefined */
    accept(part: TextStreamPart<ToolSet>): string | undefined {
      if (part.type === 'reasoning-start' || part.type === 'reasoning-end') {
        entry(part.id, part.providerMetadata);
        return '';
      }
      if (part.type !== 'reasoning-delta') return undefined;
      entry(part.id, part.providerMetadata).text += part.text;
      text += part.text;
      return part.text;
    },
    text: () => text.trim(),
    /** 没有厂商元数据的思考无法回传，只保留可原样重放的片段 */
    replayable: () => [...parts.values()].filter((part) => part.providerMetadata),
  };
}

/** 按调用 ID 拼接工具参数；有原始增量时以原始文本为准，并保留厂商元数据。 */
function createToolCallCollector() {
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
  return {
    /** 处理工具调用相关事件；其它事件返回 false */
    accept(part: TextStreamPart<ToolSet>): boolean {
      if (part.type === 'tool-input-start') {
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
      } else return false;
      return true;
    },
    /** 丢弃无名调用，并按厂商报告的顺序排列 */
    calls(order?: string[]): AIToolCall[] {
      const toolCalls = [...calls.values()]
        .map(({ call }) => call)
        .filter((call) => call.function.name.trim());
      if (order?.length) {
        const index = new Map(order.map((id, position) => [id, position]));
        toolCalls.sort((a, b) => (index.get(a.id) ?? Infinity) - (index.get(b.id) ?? Infinity));
      }
      return toolCalls;
    },
  };
}

/** 只收集原始参数；SDK 的工具校验结果不决定应用是否执行工具。 */
export async function collectStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  responseMetadata: { modelId: string; toolCallOrder?: string[] },
  onChunk?: TextGenerationStreamCallback,
  signal?: AbortSignal,
): Promise<TextGenerationResult> {
  let text = '';
  const reasoning = createReasoningCollector();
  let usage: TextGenerationResult['usage'];
  const tools = createToolCallCollector();
  for await (const part of stream) {
    signal?.throwIfAborted();
    const model = responseMetadata.modelId;
    if (part.type === 'error') throw part.error;
    if (part.type === 'abort') throw new DOMException('请求已取消', 'AbortError');
    const reasoningDelta = reasoning.accept(part);
    if (reasoningDelta !== undefined) {
      if (reasoningDelta)
        await onChunk?.({ text: '', reasoningContent: reasoningDelta, done: false, model });
      continue;
    }
    if (tools.accept(part)) continue;
    if (part.type === 'text-delta') {
      text += part.text;
      await onChunk?.({ text: part.text, done: false, model });
    } else if (part.type === 'finish-step') {
      responseMetadata.modelId = part.response.modelId || model;
      usage = reportedUsage(part.usage);
    }
  }
  signal?.throwIfAborted();
  const toolCalls = tools.calls(responseMetadata.toolCallOrder);
  text = text.trim();
  if (!text && !toolCalls.length) throw new AIEmptyResponseError();
  const model = responseMetadata.modelId;
  const reasoningText = reasoning.text();
  const reasoningParts = reasoning.replayable();
  await onChunk?.({ text: '', done: true, model, ...(toolCalls.length ? { toolCalls } : {}) });
  return {
    text,
    model,
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(reasoningText ? { reasoningContent: reasoningText } : {}),
    ...(reasoningParts.length ? { reasoningParts } : {}),
    ...(usage ? { usage } : {}),
  };
}
