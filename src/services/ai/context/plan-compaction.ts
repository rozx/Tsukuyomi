import type { ChatMessage } from '../types/ai-service';
import { estimateMessagesTokenCount } from 'src/utils/ai-token-utils';

export interface CompactionPlanInput {
  history: ChatMessage[];
  keepRecentBudget: number;
  pinnedIndex: number;
  multiplier?: number;
}

/** 只选择完整轮次或本轮中已闭合的工具组；返回的消息保持原引用与顺序。 */
export function planCompaction({
  history,
  keepRecentBudget,
  pinnedIndex,
  multiplier,
}: CompactionPlanInput): {
  keep: ChatMessage[];
  summarize: ChatMessage[];
} | null {
  if (history[pinnedIndex]?.role !== 'user' || !Number.isFinite(keepRecentBudget)) return null;
  const legalCuts: number[] = [];
  const pending = new Set<string>();
  const seen = new Set<string>();
  for (let i = 0; i < history.length; i++) {
    const message = history[i]!;
    if (message.role === 'system') return null;
    if (
      !pending.size &&
      (message.role === 'user' || (i > pinnedIndex && message.role === 'assistant'))
    ) {
      legalCuts.push(i);
    }
    for (const call of message.tool_calls ?? []) {
      if (!call.id || seen.has(call.id)) return null;
      seen.add(call.id);
      pending.add(call.id);
    }
    if (message.role === 'tool' && (!message.tool_call_id || !pending.delete(message.tool_call_id)))
      return null;
  }
  if (!pending.size) legalCuts.push(history.length);

  let idealCut = history.length;
  let remaining = Math.max(0, keepRecentBudget);
  while (idealCut > 0) {
    const cost = estimateMessagesTokenCount([history[idealCut - 1]!], multiplier);
    if (cost > remaining) break;
    remaining -= cost;
    idealCut--;
  }
  const cut = legalCuts.findLast((index) => index <= idealCut);
  if (cut === undefined || cut === 0) return null;
  const keep =
    cut > pinnedIndex ? [history[pinnedIndex]!, ...history.slice(cut)] : history.slice(cut);
  const summarize = history.slice(0, cut).filter((_, index) => index !== pinnedIndex);
  return summarize.length ? { keep, summarize } : null;
}
