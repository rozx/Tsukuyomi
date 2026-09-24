/** 窗口未知时仅显示 token 数；没有实测锚点的计数明确标注近似值。 */
export function formatContextUsage(
  measurement: { tokens: number; estimated: boolean },
  window?: number,
) {
  const tokenLabel = `${measurement.estimated ? '≈' : ''}${measurement.tokens.toLocaleString('en-US')}`;
  const known = window !== undefined && Number.isFinite(window) && window > 0;
  const percentage = known ? Math.round((measurement.tokens / window) * 100) : undefined;
  return {
    tokenLabel,
    percentage,
    label: known
      ? `${percentage}% · ${tokenLabel} / ${window.toLocaleString('en-US')}`
      : `${tokenLabel} Tokens`,
  };
}
