import type { Paragraph } from 'src/models/novel';

/**
 * 检查段落是否为空或仅包含符号
 * 空段落：没有文本或只有空白字符
 * 仅符号段落：只包含标点符号、特殊字符，但没有实际内容（字母、数字、CJK字符等）
 * @param text 段落文本
 * @returns 如果段落为空或仅符号，返回 true
 */
/**
 * 检查段落是否为空
 * 空段落：没有文本或只有空白字符
 * @param text 段落文本
 * @returns 如果段落为空，返回 true
 */
export function isEmptyParagraph(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') {
    return true;
  }
  return text.trim().length === 0;
}

/**
 * 检查段落是否为空或仅包含符号
 * @param text 段落文本
 * @returns 如果段落为空或仅符号（不包含字母、数字或CJK字符），返回 true
 */
export function isEmptyOrSymbolOnly(text: string | null | undefined): boolean {
  if (isEmptyParagraph(text)) {
    return true;
  }
  // 如果不包含任何字母、数字或 CJK 字符，则视为仅包含符号
  // 使用 CJK_CHAR_CLASS 常量
  const hasContent = new RegExp(`[a-zA-Z0-9${CJK_CHAR_CLASS}]`).test(text!);
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

/**
 * 重组 Chunk 文本
 * 逻辑：遍历段落 ID，优先使用新翻译，如果新翻译不存在则回退到原始翻译
 * @param paragraphIds 当前 chunk 的段落 ID 列表
 * @param newTranslations 新翻译映射 (Map<id, translation>)
 * @param originalTranslations 原始翻译映射 (Map<id, translation>)
 * @returns 重组后的完整文本
 */
export function reconstructChunkText(
  paragraphIds: string[],
  newTranslations: Map<string, string>,
  originalTranslations: Map<string, string>,
): string {
  const orderedSegments: string[] = [];
  for (const paraId of paragraphIds) {
    const newTranslation = newTranslations.get(paraId);
    if (newTranslation !== undefined) {
      orderedSegments.push(newTranslation);
    } else {
      // 回退到原始翻译
      orderedSegments.push(originalTranslations.get(paraId) || '');
    }
  }
  return orderedSegments.join('\n\n');
}
