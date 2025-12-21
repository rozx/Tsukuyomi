import type { Novel, Chapter } from 'src/models/novel';
import { normalizeTranslationSymbols } from './translation-normalizer';

/**
 * 根据 preserveIndents 设置过滤翻译文本中的行首空格
 * 这是一个过滤器，用于在显示和导出时移除行首空格（如果设置要求）
 * 
 * @param translation 翻译文本
 * @param book 书籍对象（可选，用于获取书籍级别的设置）
 * @param chapter 章节对象（可选，用于获取章节级别的设置，优先级高于书籍级别）
 * @returns 过滤后的翻译文本
 */
export function filterIndents(
  translation: string,
  book?: Novel,
  chapter?: Chapter,
): string {
  if (!translation || typeof translation !== 'string') {
    return translation;
  }

  // 获取 preserveIndents 设置（章节级别优先，否则使用书籍级别）
  // 注意：preserveIndents === false 表示要移除缩进（过滤掉）
  // preserveIndents === true 或 undefined 表示保留缩进
  const preserveIndents = chapter?.preserveIndents ?? book?.preserveIndents ?? true;

  if (preserveIndents) {
    // 保留所有内容，包括行首空格
    return translation;
  } else {
    // 移除每行的行首空格（缩进），但保留其他内容
    return translation
      .split('\n')
      .map((line) => line.replace(/^\s+/, ''))
      .join('\n');
  }
}

/**
 * 统一的“显示/导出层”翻译格式化入口
 * - 根据 preserveIndents 决定是否过滤缩进
 * - 根据 normalizeSymbolsOnDisplay 决定是否规范化符号
 * 注意：该函数不会写回翻译内容，只用于显示与导出
 */
export function formatTranslationForDisplay(
  translation: string,
  book?: Novel,
  chapter?: Chapter,
): string {
  if (!translation || typeof translation !== 'string') {
    return translation;
  }

  let result = filterIndents(translation, book, chapter);

  const normalize = book?.normalizeSymbolsOnDisplay ?? false;
  if (normalize) {
    result = normalizeTranslationSymbols(result);
  }

  return result;
}

