import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { AppLocale } from 'src/models/locale';
import type { ActionDetail, ActionDetailsContext } from './types';
import { detailText, joinList, preview } from './types';

/**
 * 批量替换翻译的详情字段。
 */
function appendBatchReplaceTranslationDetails(
  details: ActionDetail[],
  action: MessageAction,
  locale: AppLocale,
): void {
  const push = (label: Parameters<typeof detailText>[1], value: string) =>
    details.push({ label: detailText(locale, label), value });
  if (action.replaced_paragraph_count !== undefined) {
    push(
      'replacedParagraphs',
      detailText(locale, 'countValue', { count: action.replaced_paragraph_count }),
    );
  }
  if (action.replaced_translation_count !== undefined) {
    push(
      'replacedVersions',
      detailText(locale, 'countValue', { count: action.replaced_translation_count }),
    );
  }
  if (action.replacement_text) {
    push('replacementText', preview(action.replacement_text, 50));
  }
  if (action.keywords && action.keywords.length > 0) {
    push('translationKeywords', joinList(locale, action.keywords));
  }
  if (action.original_keywords && action.original_keywords.length > 0) {
    push('originalKeywords', joinList(locale, action.original_keywords));
  }
  if (action.replace_all_translations !== undefined) {
    push('replaceAll', detailText(locale, action.replace_all_translations ? 'yes' : 'no'));
  }
}

/**
 * 单段落翻译操作的详情字段（含从当前书籍定位段落并生成预览）。
 */
function appendSingleTranslationDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale,
): void {
  if (action.paragraph_id) {
    details.push({ label: detailText(locale, 'paragraphId'), value: action.paragraph_id });
    appendParagraphContextByBook(details, action, context, locale);
  }

  if (action.translation_id) {
    details.push({ label: detailText(locale, 'translationId'), value: action.translation_id });
  }

  if (action.old_translation && action.new_translation) {
    details.push({
      label: detailText(locale, 'oldTranslation'),
      value: preview(action.old_translation, 100),
    });
    details.push({
      label: detailText(locale, 'newTranslation'),
      value: preview(action.new_translation, 100),
    });
  }
}

/**
 * 基于 paragraph_id 从当前书籍找到所在章节与段落原文预览，并可选给出译文预览。
 */
function appendParagraphContextByBook(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale,
): void {
  const currentBookId = context.getCurrentBookId();
  if (!currentBookId || !action.paragraph_id) return;

  const book = context.getBookById(currentBookId);
  if (!book) return;

  const location = ChapterService.findParagraphLocation(book, action.paragraph_id);
  if (!location) return;

  const { paragraph, chapter } = location;
  details.push({
    label: detailText(locale, 'chapter'),
    value: getChapterDisplayTitle(chapter, book, action.language),
  });

  if (paragraph.text) {
    details.push({
      label: detailText(locale, 'sourcePreview'),
      value: preview(paragraph.text, 50),
    });
  }

  if (action.translation_id) {
    const translation = paragraph.translations?.find((t) => t.id === action.translation_id);
    if (translation?.translation) {
      details.push({
        label: detailText(locale, 'translationPreview'),
        value: preview(translation.translation, 50),
      });
    }
  }
}

export function appendTranslationDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
  locale: AppLocale = 'zh-CN',
): void {
  if (action.tool_name === 'batch_replace_translations') {
    appendBatchReplaceTranslationDetails(details, action, locale);
    return;
  }
  appendSingleTranslationDetails(details, action, context, locale);
}
