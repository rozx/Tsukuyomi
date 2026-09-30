import type { ImportPlan } from 'src/models/import';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { languageName, translateText } from 'src/i18n/translate';

export interface ImportApplyConfirmation {
  header: string;
  message: string;
  acceptLabel: string;
  rejectLabel: string;
  /** 新书采用确认时的界面语言；更新已有书沿用该书的目标语言。 */
  targetLanguage: AppLocale;
}

/**
 * 最终确认导入的说明：目标书、章节数、译文目标语言、译文清空、部分导入与配方写入。
 * 语言名按界面语言显示，但目标语言本身由书籍决定（新书为确认时的界面语言）。
 */
export function importApplyConfirmation(
  plan: ImportPlan,
  uiLocale: AppLocale,
): ImportApplyConfirmation {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translateText(uiLocale, key, values);
  const summary = plan.summary;
  const targetLanguage =
    plan.targetKind === 'new' ? uiLocale : (plan.book.targetLanguage ?? 'zh-CN');
  const title = plan.book.title || t('importUi.common.untitled');
  const sentences = [
    t('importUi.confirm.target', {
      target: t(
        plan.targetKind === 'new' ? 'importUi.common.newBook' : 'importUi.common.updateBook',
        { title },
      ),
      count: summary?.selectedChapters ?? plan.chapters.length,
    }),
    t('import.confirmTargetLanguage', { language: languageName(uiLocale, targetLanguage) }),
    summary?.clearedVersions
      ? t('importUi.confirm.cleared', {
          paragraphs: summary.clearedParagraphs,
          versions: summary.clearedVersions,
        })
      : t('importUi.confirm.noCleared'),
    summary?.partial ? t('importUi.confirm.partial') : '',
    ['add', 'replace'].includes(plan.recipeChange?.kind ?? '') ? t('importUi.confirm.recipe') : '',
    t('importUi.confirm.final'),
  ];
  return {
    header: t('importUi.confirm.header'),
    message: sentences.filter(Boolean).join(t('importUi.confirm.sentenceGap')),
    acceptLabel: t('importUi.planHero.apply'),
    rejectLabel: t('importUi.confirm.reject'),
    targetLanguage,
  };
}
