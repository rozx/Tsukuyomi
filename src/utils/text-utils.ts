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
 * 去除原文中多余的空行——**减一行**，保留原始相对间距。
 *
 * 规则：
 * - 每段连续空行减少一行：1 个空行 → 0、2 个 → 1、6 个 → 5 …（大段空行按比例保留，
 *   不会被压扁到单空行）。
 * - 文本首尾的空行整段去掉。
 * - 正文行原样保留（不改动行首全角缩进 / 行尾空格）；保留下来的空行规范化为真正的空字符串。
 *
 * 注意本函数**不是幂等的**（再跑一次会继续减一行）。“连按两次不再误删”的保护放在
 * 调用方（编辑框记住上次格式化结果 + 原生撤销），不在这个纯函数里，以免破坏相对间距。
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

  const result: string[] = [];
  let i = 0;

  // 跳过开头的空行
  while (i < lines.length && isBlank(lines[i]!)) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i]!;
    if (!isBlank(line)) {
      result.push(line);
      i++;
      continue;
    }

    // 统计这一段连续空行的长度
    let runEnd = i;
    while (runEnd < lines.length && isBlank(lines[runEnd]!)) {
      runEnd++;
    }

    // 结尾的空行整段丢弃；中间的空行段减少一行（规范化为空字符串）
    if (runEnd < lines.length) {
      const keep = runEnd - i - 1;
      for (let k = 0; k < keep; k++) {
        result.push('');
      }
    }
    i = runEnd;
  }

  return result.join('\n');
}

/**
 * 归一化「输入名称以确认」类对话框的文本，用于比较用户输入与目标名称。
 *
 * 爬取来的书名 / 章节名常带用户无法凭肉眼察觉、也无法用键盘敲出来的字符，
 * 直接做字符串相等比较会让确认框永远无法通过。归一化处理：
 * - Unicode NFC：剪贴板与部分 IME（尤其 macOS 日文输入）会产出 NFD 分解形式，
 *   例如「で」= て(U+3066) + 浊音符号(U+3099)，视觉相同但码位不同
 * - 剥离零宽字符（BOM / ZWSP / ZWNJ / ZWJ）：网页抓取的标题里常见，键盘敲不出来
 * - 全角空格 U+3000 → 半角空格：用户手打时几乎只会打出半角空格
 * - 首尾 trim
 *
 * 注意：**必须对输入和目标名称同时调用**，只归一化一侧会让带空白的名称永远匹配不上。
 *
 * @param text 待归一化的文本
 * @returns 归一化后的文本；null / undefined 归一化为空字符串
 */
export function normalizeConfirmationText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .trim();
}

/**
 * 判断确认框输入是否与目标名称一致（经 {@link normalizeConfirmationText} 归一化后比较）。
 *
 * 目标名称为空时一律返回 false —— 避免名称缺失的条目被一个空输入直接删掉。
 *
 * @param input 用户在确认框中输入的文本
 * @param expected 目标名称（书名 / 章节名等）
 * @returns 一致返回 true
 */
export function isConfirmationTextMatch(
  input: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const normalizedExpected = normalizeConfirmationText(expected);
  if (!normalizedExpected) return false;
  return normalizeConfirmationText(input) === normalizedExpected;
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
