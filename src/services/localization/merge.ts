import type { Paragraph, Translation } from 'src/models/novel';
import { normalizeParagraphLanguages } from './normalize';
import { mergeLanguageSlots } from './versioned-values';
import { compareRevision } from './revision';
import { canonicalStringify } from 'src/utils/canonical-json';
import { translationBusinessValue } from './translation-value';
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
  const translations = [...left.translations];
  for (const value of right.translations) {
    const index = translations.findIndex((t) => t.id === value.id);
    const existing = translations[index];
    if (!existing) translations.push(value);
    else if (existing.language !== value.language) throw new Error('TRANSLATION_ID_CONFLICT');
    else if (newerVersion(value, existing)) translations[index] = value;
  }
  const selectedTranslations = mergeLanguageSlots(
    left.selectedTranslations,
    right.selectedTranslations,
  );
  return {
    ...left,
    translations,
    selectedTranslations,
    selectedTranslationId: selectedTranslations['zh-CN']?.value ?? '',
  };
}
