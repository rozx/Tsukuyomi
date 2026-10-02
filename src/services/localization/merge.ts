import type { Paragraph, Translation } from 'src/models/novel';
import { normalizeParagraphLanguages } from './normalize';
import { mergeLanguageSlots } from './versioned-values';
import { compareRevision } from './revision';
import { canonicalStringify } from 'src/utils/canonical-json';
import { translationBusinessValue } from './translation-value';
import { mergeTranslationDeletions, settleTranslationDeletions } from './translation-deletions';
export { mergeLanguageSlots } from './versioned-values';

/**
 * 同 ID 的两份译文副本：revision 较新者胜；都没有 revision（未被原地修改过）时保留主方，
 * 与旧行为一致。revision 相同而内容不同说明数据损坏，拒绝合并。
 */
function newerVersion(candidate: Translation, current: Translation): boolean {
  if (!candidate.revision) return false;
  if (!current.revision) return true;
  const order = compareRevision(candidate.revision, current.revision);
  if (
    order === 0 &&
    canonicalStringify(translationBusinessValue(candidate)) !==
      canonicalStringify(translationBusinessValue(current))
  )
    throw new Error('SYNC_REVISION_CONFLICT');
  return order > 0;
}

/** 调用方先裁决原文/结构；这里只合并同原文段落的译文与各语言选用。 */
export function mergeParagraphLanguageState(primary: Paragraph, secondary: Paragraph): Paragraph {
  const left = normalizeParagraphLanguages(primary);
  const right = normalizeParagraphLanguages(secondary);
  // 同 ID 先裁决内容（较新 revision 胜，否则保留主方）
  const resolved = new Map(left.translations.map((value) => [value.id, value]));
  for (const value of right.translations) {
    const existing = resolved.get(value.id);
    if (!existing) resolved.set(value.id, value);
    else if (existing.language !== value.language) throw new Error('TRANSLATION_ID_CONFLICT');
    else if (newerVersion(value, existing)) resolved.set(value.id, value);
  }
  // 顺序与主方无关：以 ID 序列较小的一侧为基（保留其时间顺序），另一侧独有版本追加在后，
  // 否则两端各自以本地为主方合并会得到顺序不同、哈希不同的结果，同步时反复互相上传
  const ids = (paragraph: Paragraph) => canonicalStringify(paragraph.translations.map((t) => t.id));
  const [first, second] = ids(left) <= ids(right) ? [left, right] : [right, left];
  const order = [...first.translations, ...second.translations].map((value) => value.id);
  const translations = [...new Set(order)].map((id) => resolved.get(id)!);
  const selectedTranslations = mergeLanguageSlots(
    left.selectedTranslations,
    right.selectedTranslations,
  );
  // 删除记录压过不比它新的副本；两侧记录先按 revision 合并，再统一裁决
  return settleTranslationDeletions({
    ...left,
    translations,
    selectedTranslations,
    selectedTranslationId: selectedTranslations['zh-CN']?.value ?? '',
    deletedTranslations: mergeTranslationDeletions(
      left.deletedTranslations,
      right.deletedTranslations,
    ),
  });
}
