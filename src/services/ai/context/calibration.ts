import { DEFAULT_TOKEN_ESTIMATION_MULTIPLIER } from 'src/utils/ai-token-utils';

const ratios = new Map<string, number>();

export function getEstimationMultiplier(modelKey: string): number {
  return ratios.get(modelKey) ?? DEFAULT_TOKEN_ESTIMATION_MULTIPLIER;
}

export function observeTokenUsage(
  modelKey: string,
  inputTokens: number,
  baseEstimate: number,
): void {
  if (
    !Number.isFinite(inputTokens) ||
    inputTokens < 0 ||
    !Number.isFinite(baseEstimate) ||
    baseEstimate <= 0
  )
    return;
  const next = getEstimationMultiplier(modelKey) * 0.7 + (inputTokens / baseEstimate) * 0.3;
  ratios.set(modelKey, Math.min(3, Math.max(0.5, next)));
}
