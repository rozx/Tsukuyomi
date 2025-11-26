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

