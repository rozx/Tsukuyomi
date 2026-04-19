import { ChapterService } from 'src/services/chapter-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetail, ActionDetailsContext } from './types';
import { preview } from './types';

/**
 * 批量替换翻译的详情字段。
 */
function appendBatchReplaceTranslationDetails(
  details: ActionDetail[],
  action: MessageAction,
): void {
  if (action.replaced_paragraph_count !== undefined) {
    details.push({ label: '替换段落数', value: `${action.replaced_paragraph_count} 个` });
  }
  if (action.replaced_translation_count !== undefined) {
    details.push({
      label: '替换翻译版本数',
      value: `${action.replaced_translation_count} 个`,
    });
  }
  if (action.replacement_text) {
    details.push({ label: '替换文本', value: preview(action.replacement_text, 50) });
  }
  if (action.keywords && action.keywords.length > 0) {
    details.push({ label: '翻译关键词', value: action.keywords.join('、') });
  }
  if (action.original_keywords && action.original_keywords.length > 0) {
    details.push({ label: '原文关键词', value: action.original_keywords.join('、') });
  }
  if (action.replace_all_translations !== undefined) {
    details.push({
      label: '替换所有版本',
      value: action.replace_all_translations ? '是' : '否',
    });
  }
}

/**
 * 单段落翻译操作的详情字段（含从当前书籍定位段落并生成预览）。
 */
function appendSingleTranslationDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  if (action.paragraph_id) {
    details.push({ label: '段落 ID', value: action.paragraph_id });
    appendParagraphContextByBook(details, action, context);
  }

  if (action.translation_id) {
    details.push({ label: '翻译 ID', value: action.translation_id });
  }

  if (action.old_translation && action.new_translation) {
    details.push({ label: '旧翻译', value: preview(action.old_translation, 100) });
    details.push({ label: '新翻译', value: preview(action.new_translation, 100) });
  }
}

/**
 * 基于 paragraph_id 从当前书籍找到所在章节与段落原文预览，并可选给出译文预览。
 */
function appendParagraphContextByBook(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  const currentBookId = context.getCurrentBookId();
  if (!currentBookId || !action.paragraph_id) return;

  const book = context.getBookById(currentBookId);
  if (!book) return;

  const location = ChapterService.findParagraphLocation(book, action.paragraph_id);
  if (!location) return;

  const { paragraph, chapter } = location;
  details.push({ label: '章节', value: getChapterDisplayTitle(chapter) });

  if (paragraph.text) {
    details.push({ label: '原文预览', value: preview(paragraph.text, 50) });
  }

  if (action.translation_id) {
    const translation = paragraph.translations?.find((t) => t.id === action.translation_id);
    if (translation?.translation) {
      details.push({ label: '翻译预览', value: preview(translation.translation, 50) });
    }
  }
}

export function appendTranslationDetails(
  details: ActionDetail[],
  action: MessageAction,
  context: ActionDetailsContext,
): void {
  if (action.tool_name === 'batch_replace_translations') {
    appendBatchReplaceTranslationDetails(details, action);
    return;
  }
  appendSingleTranslationDetails(details, action, context);
}
