import { buildModelServiceConfig } from '../core/model-config';
import type { AIModel } from '../types/ai-model';
import type { ChatMessage } from '../types/ai-service';
import { AIServiceFactory } from '../ai-service-factory';
import { resolveModelLimits } from '../model-limits/resolve';
import { getStructuredSummaryPrompt } from '../tasks/prompts/assistant';
import { estimateMessagesTokenCount } from 'src/utils/ai-token-utils';
import { formatSummaryMessages } from './summary-input';
import { getEstimationMultiplier } from './calibration';
import { modelContextKey } from './measure';

export interface SummarizeInput {
  previousSummary?: string | undefined;
  messages: ChatMessage[];
  model: AIModel;
  signal?: AbortSignal | undefined;
}

function summaryRequest(previous: string, segment: string): ChatMessage[] {
  return [{ role: 'user', content: getStructuredSummaryPrompt(previous, segment) }];
}

/** 每次按更新后的摘要重新计算输入预算；超长普通消息也分段，不能跳过尾部。 */
function segmentLength(text: string, previous: string, budget: number, multiplier: number): number {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (
      estimateMessagesTokenCount(summaryRequest(previous, text.slice(0, mid)), multiplier) <= budget
    )
      low = mid;
    else high = mid - 1;
  }
  // 不把 UTF-16 代理对拆开。
  if (low < text.length && low > 0 && /[\uD800-\uDBFF]/.test(text[low - 1]!)) low--;
  if (!low) throw new Error('摘要输入超出模型可用窗口，无法安全压缩；请更换更大窗口的模型。');
  return low;
}

export async function summarizeInto({
  previousSummary = '',
  messages,
  model,
  signal,
}: SummarizeInput): Promise<string> {
  signal?.throwIfAborted();
  const limits = await resolveModelLimits(model);
  const budget = limits.contextWindow ? Math.floor(limits.contextWindow * 0.6) : 24000;
  const maxOutputTokens = Math.min(2048, limits.maxOutput ?? 2048);
  const multiplier = getEstimationMultiplier(modelContextKey(model));
  const text = formatSummaryMessages(messages)
    .map((message) => `[${message.role}] ${message.content}`)
    .join('\n\n');
  if (!text) throw new Error('没有可以生成摘要的内容');
  const service = AIServiceFactory.getService(model.provider);
  let summary = previousSummary;
  let offset = 0;
  while (offset < text.length) {
    signal?.throwIfAborted();
    const rest = text.slice(offset);
    const length = segmentLength(rest, summary, budget, multiplier);
    const requestMessages = summaryRequest(summary, rest.slice(0, length));
    const result = await service.generateText(
      buildModelServiceConfig(model, {
        temperature: 0.3,
        maxInputTokens: limits.contextWindow,
        maxOutputTokens,
        signal,
      }),
      { messages: requestMessages, temperature: 0.3, maxOutputTokens },
    );
    signal?.throwIfAborted();
    const candidate = result.text.trim();
    if (candidate.length < 20) throw new Error('摘要生成失败：内容为空或过短，原始历史已保留。');
    summary = candidate;
    offset += length;
  }
  return summary;
}
