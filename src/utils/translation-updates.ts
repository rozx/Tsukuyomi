/**
 * 翻译增量更新的辅助函数
 *
 * 背景：
 * - AI 在同一任务中可能会对同一段落反复“纠错/改写”（例如 review → working）
 * - 我们需要避免“重复保存相同内容”造成的性能浪费，但必须允许“内容确实变化”的覆盖更新（last-write-wins）
 */

export interface ParagraphTranslationResult {
  id: string;
  translation: string;
}

/**
 * 选择出“与上一次已应用的翻译不同”的段落翻译，并同步更新 lastAppliedMap
 *
 * - 只要翻译文本发生变化，就视为需要重新应用（允许覆盖）
 * - 翻译为空/只空白时会被过滤掉
 */
export function selectChangedParagraphTranslations(
  incoming: ParagraphTranslationResult[],
  lastAppliedMap: Map<string, string>,
): ParagraphTranslationResult[] {
  const changed: ParagraphTranslationResult[] = [];

  for (const pt of incoming) {
    if (!pt?.id) continue;
    if (typeof pt.translation !== 'string') continue;
    if (pt.translation.trim().length === 0) continue;

    const prev = lastAppliedMap.get(pt.id);
    if (prev === pt.translation) continue;

    lastAppliedMap.set(pt.id, pt.translation);
    changed.push({ id: pt.id, translation: pt.translation });
  }

  return changed;
}


