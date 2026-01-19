import type { Paragraph } from 'src/models/novel';

/**
 * 检查段落是否为空或仅包含符号
 * 空段落：没有文本或只有空白字符
 * 仅符号段落：只包含标点符号、特殊字符，但没有实际内容（字母、数字、CJK字符等）
 * @param text 段落文本
 * @returns 如果段落为空或仅符号，返回 true
 */
export function isEmptyOrSymbolOnly(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') {
    return true;
  }

  // 去除首尾空白字符
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return true;
  }

  // 检查是否包含实际内容（字母、数字、CJK字符）
  // \p{L} 匹配任何语言的字母
  // \p{N} 匹配任何语言的数字
  // \u4e00-\u9fff 匹配汉字 (CJK Unified Ideographs)
  // \u3040-\u309f 匹配平假名 (Hiragana)
  // \u30a0-\u30ff 匹配片假名 (Katakana)
  const hasContent = /[\p{L}\p{N}\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/u.test(trimmed);

  // 如果没有实际内容，则认为是仅符号段落
  return !hasContent;
}

/**
 * 构建段落的原始翻译映射
 * @param paragraphs 段落数组
 * @returns 段落ID到原始翻译文本的映射
 */
export function buildOriginalTranslationsMap(paragraphs: Paragraph[]): Map<string, string> {
  const originalTranslations = new Map<string, string>();
  for (const paragraph of paragraphs) {
    const currentTranslation =
      paragraph.translations?.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
      paragraph.translations?.[0]?.translation ||
      '';
    if (currentTranslation) {
      originalTranslations.set(paragraph.id, currentTranslation.trim());
    }
  }
  return originalTranslations;
}

/**
 * 比较两个翻译文本是否相同（忽略空白字符差异）
 * @param original 原始翻译文本
 * @param modified 修改后的翻译文本
 * @returns 如果翻译有变化，返回 true
 */
export function hasTranslationChanged(original: string, modified: string): boolean {
  const normalizedOriginal = original.trim();
  const normalizedModified = modified.trim();
  return normalizedOriginal !== normalizedModified;
}

/**
 * 过滤出有变化的段落翻译
 * @param paragraphIds 段落ID数组
 * @param extractedTranslations 提取的翻译映射（段落ID -> 翻译文本）
 * @param originalTranslations 原始翻译映射（段落ID -> 原始翻译文本）
 * @returns 有变化的段落翻译数组
 */
export function filterChangedParagraphs(
  paragraphIds: string[],
  extractedTranslations: Map<string, string>,
  originalTranslations: Map<string, string>,
): { id: string; translation: string }[] {
  const changedParagraphs: { id: string; translation: string }[] = [];
  for (const paraId of paragraphIds) {
    const translation = extractedTranslations.get(paraId);
    if (translation) {
      const originalTranslation = originalTranslations.get(paraId) || '';
      if (hasTranslationChanged(originalTranslation, translation)) {
        changedParagraphs.push({ id: paraId, translation });
      }
    }
  }
  return changedParagraphs;
}

/**
 * CJK 字符类正则表达式字符串（中文、日文、韩文）
 */
export const CJK_CHAR_CLASS = '\\u4E00-\\u9FFF\\u3040-\\u309F\\u30A0-\\u30FF\\uAC00-\\uD7AF';

/**
 * 检查文本是否包含 CJK 字符
 * @param text 要检查的文本
 * @returns 如果包含 CJK 字符，返回 true
 */
export function hasCJK(text: string): boolean {
  return new RegExp(`[${CJK_CHAR_CLASS}]`).test(text);
}

/**
 * 检查字符是否为 CJK 字符
 * @param char 要检查的字符
 * @returns 如果是 CJK 字符，返回 true
 */
export function isCJK(char: string): boolean {
  if (!char || char.length === 0) return false;
  return hasCJK(char);
}
