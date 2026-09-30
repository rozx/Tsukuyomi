import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
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
  uiLocale?: AppLocale;
  previousSummary?: string | undefined;
  messages: ChatMessage[];
  model: AIModel;
  signal?: AbortSignal | undefined;
}

function summaryRequest(previous: string, segment: string, uiLocale: AppLocale): ChatMessage[] {
  return [{ role: 'user', content: getStructuredSummaryPrompt(previous, segment, uiLocale) }];
}

/** 每次按更新后的摘要重新计算输入预算；超长普通消息也分段，不能跳过尾部。 */
function segmentLength(
  text: string,
  previous: string,
  budget: number,
  multiplier: number,
  uiLocale: AppLocale,
): number {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (
      estimateMessagesTokenCount(
        summaryRequest(previous, text.slice(0, mid), uiLocale),
        multiplier,
      ) <= budget
    )
      low = mid;
    else high = mid - 1;
  }
  // 不把 UTF-16 代理对拆开。
  if (low < text.length && low > 0 && /[\uD800-\uDBFF]/.test(text[low - 1]!)) low--;
  if (!low) throw new Error(translateText(uiLocale, 'aiAssistant.summaryWindow'));
  return low;
}

export async function summarizeInto({
  uiLocale = 'zh-CN',
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
  const text = formatSummaryMessages(messages, uiLocale)
    .map((message) => `[${message.role}] ${message.content}`)
    .join('\n\n');
  if (!text) throw new Error(translateText(uiLocale, 'aiAssistant.summaryEmpty'));
  const service = AIServiceFactory.getService(model.provider);
  let summary = previousSummary;
  let offset = 0;
  while (offset < text.length) {
    signal?.throwIfAborted();
    const rest = text.slice(offset);
    const length = segmentLength(rest, summary, budget, multiplier, uiLocale);
    const requestMessages = summaryRequest(summary, rest.slice(0, length), uiLocale);
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
    if (candidate.length < 20)
      throw new Error(translateText(uiLocale, 'aiAssistant.summaryFailed'));
    summary = candidate;
    offset += length;
  }
  return summary;
}
