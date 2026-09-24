import type { CompactionPlanInput } from './plan-compaction';
import { planCompaction } from './plan-compaction';
import type { SummarizeInput } from './summarize';
import { summarizeInto } from './summarize';
import { getEstimationMultiplier } from './calibration';
import { modelContextKey } from './measure';

/** 只产生候选状态；持久化与历史替换由各调用方在成功后完成。 */
export async function compactHistory(
  input: Omit<CompactionPlanInput, 'multiplier'> & Omit<SummarizeInput, 'messages'>,
  onStart?: () => void | Promise<void>,
) {
  input.signal?.throwIfAborted();
  const plan = planCompaction({
    ...input,
    multiplier: getEstimationMultiplier(modelContextKey(input.model)),
  });
  if (!plan) return null;
  await onStart?.();
  const summary = await summarizeInto({ ...input, messages: plan.summarize });
  return { summary, keep: plan.keep };
}
