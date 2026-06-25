import type { Paragraph } from 'src/models/novel';

/**
 * CJK 字符类正则表达式字符串（中文、日文、韩文）
 */
export const CJK_CHAR_CLASS = '\\u4E00-\\u9FFF\\u3040-\\u309F\\u30A0-\\u30FF\\uAC00-\\uD7AF';

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
 * 去除原文中多余的空行——**幂等**：对结果再次格式化不会再变化。
 *
 * 规则：
 * - 首尾的空行整段去掉。
 * - 以“是否像原始稿”区分单空行的含义：若正文之间存在 ≥2 连续空行（典型的双空行
 *   场景分隔，说明这是“每段都空一行”的原始稿），则按原始稿压缩——段内单空行 → 0、
 *   多空行（≥2）→ 1；否则（已是单空行间隔/紧凑的文本）保持单空行不动。
 * - 正文行原样保留（不改动行首全角缩进 / 行尾空格）；保留下来的空行规范化为真正的空字符串。
 *
 * 这样：含双空行的原始稿 → 一次压缩到“段内紧凑、场景单空行”的规范形态；该形态再次
 * 格式化时（不含双空行、无首尾空行）保持不变，避免连按两次把场景空行也吃掉。
 *
 * “空行”指 `line.trim()` 为空的行——`trim()` 会吃掉全角空格（U+3000），
 * 因此仅含全角空格的行也算空行。
 *
 * @param text 原始文本（以 `\n` 分行）
 * @returns 去除多余空行后的文本
 */
export function removeExtraBlankLines(text: string): string {
  const lines = text.split('\n');
  const isBlank = (line: string): boolean => line.trim().length === 0;

  // 去掉首尾空行，得到首尾均为正文行的“核心”区间 [start, end)
  let start = 0;
  while (start < lines.length && isBlank(lines[start]!)) {
    start++;
  }
  let end = lines.length;
  while (end > start && isBlank(lines[end - 1]!)) {
    end--;
  }
  if (start >= end) {
    return '';
  }

  // 判断是否为“原始稿”：核心区间内是否存在 ≥2 连续空行
  let isRaw = false;
  for (let i = start; i < end - 1; i++) {
    if (isBlank(lines[i]!) && isBlank(lines[i + 1]!)) {
      isRaw = true;
      break;
    }
  }

  const result: string[] = [];
  let i = start;
  while (i < end) {
    if (!isBlank(lines[i]!)) {
      result.push(lines[i]!);
      i++;
      continue;
    }

    // 统计这一段连续空行的长度（均为正文之间的内部空行）
    let runEnd = i;
    while (runEnd < end && isBlank(lines[runEnd]!)) {
      runEnd++;
    }
    const runLength = runEnd - i;
    // 原始稿：段内单空行删除、多空行折叠为单空行；非原始稿：单空行原样保留
    const blanksToEmit = isRaw ? (runLength >= 2 ? 1 : 0) : 1;
    for (let k = 0; k < blanksToEmit; k++) {
      result.push('');
    }
    i = runEnd;
  }

  return result.join('\n');
}

/**
 * 判断段落是否至少有一条非空翻译。
 * 过滤 `onlyWithTranslation` 查询、进度统计等场景共用，避免每处手写
 * `translations?.some(t => t.translation?.trim().length > 0)` 的三层判空。
 */
export function hasNonEmptyTranslation(paragraph: Paragraph): boolean {
  return (
    !!paragraph.translations &&
    paragraph.translations.length > 0 &&
    paragraph.translations.some((t) => !!t.translation && t.translation.trim().length > 0)
  );
}

/**
 * 检查文本是否仅包含符号（不包含字母、数字或CJK字符）
 * @param text 文本
 * @returns 如果仅包含符号，返回 true
 */
export function isSymbolOnly(text: string): boolean {
  const hasContent = new RegExp(`[a-zA-Z0-9${CJK_CHAR_CLASS}]`).test(text);
  return !hasContent;
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
  return isSymbolOnly(text!);
}

/**
 * 获取段落当前选中的翻译文本
 * @param paragraph 段落对象
 * @returns 当前选中的翻译文本，不存在则返回空字符串
 */
export function getSelectedTranslation(paragraph: Paragraph): string {
  if (!paragraph.selectedTranslationId || !paragraph.translations?.length) {
    return '';
  }

  const selectedTranslation = paragraph.translations.find(
    (translation) => translation.id === paragraph.selectedTranslationId,
  );

  return selectedTranslation?.translation || '';
}

/**
 * 构建段落的原始翻译映射
 * @param paragraphs 段落数组
 * @returns 段落ID到原始翻译文本的映射
 */
export function buildOriginalTranslationsMap(paragraphs: Paragraph[]): Map<string, string> {
  const originalTranslations = new Map<string, string>();
  for (const paragraph of paragraphs) {
    const currentTranslation = getSelectedTranslation(paragraph);
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
function hasTranslationChanged(original: string, modified: string): boolean {
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
