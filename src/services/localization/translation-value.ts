/** 本地记忆打分诊断不属于译文业务值，不参与逻辑版本与冲突比较。 */
export function translationBusinessValue<T>(value: T): T {
  if (
    !value ||
    typeof value !== 'object' ||
    !('translation' in value) ||
    !('aiModelId' in value) ||
    !('id' in value)
  )
    return value;
  const { memoryScoreBreakdown: _diagnostics, ...business } = value as Record<string, unknown>;
  return business as T;
}
