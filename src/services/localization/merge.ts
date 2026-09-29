import type { Paragraph } from 'src/models/novel';
import { normalizeParagraphLanguages } from './normalize';
import { mergeLanguageSlots } from './versioned-values';
export { mergeLanguageSlots } from './versioned-values';

/** 调用方先裁决原文/结构；这里只合并同原文段落的译文与各语言选用。 */
export function mergeParagraphLanguageState(primary: Paragraph, secondary: Paragraph): Paragraph {
  const left = normalizeParagraphLanguages(primary);
  const right = normalizeParagraphLanguages(secondary);
  const translations = [...left.translations];
  for (const value of right.translations) {
    const existing = translations.find((t) => t.id === value.id);
    if (!existing) translations.push(value);
    else if (existing.language !== value.language) throw new Error('TRANSLATION_ID_CONFLICT');
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
