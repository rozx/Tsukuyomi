import type { EffectiveModelLimits } from '../model-limits/resolve';

export function contextBudgets(limits: Pick<EffectiveModelLimits, 'contextWindow' | 'maxOutput'>): {
  reserve?: number;
  threshold?: number;
  keepRecentBudget: number;
} {
  const { contextWindow, maxOutput } = limits;
  if (!contextWindow || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return { keepRecentBudget: 20000 };
  }
  const reserve = Math.min(
    contextWindow * 0.25,
    Math.max(4096, Math.min(32768, maxOutput ?? 16384)),
  );
  return {
    reserve,
    threshold: contextWindow - reserve,
    keepRecentBudget: Math.min(20000, contextWindow * 0.25),
  };
}
