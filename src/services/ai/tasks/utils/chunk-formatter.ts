import type { Paragraph } from 'src/models/novel';

/**
 * 默认分块大小（与翻译任务保持一致）
 * [警告] 修改此值会影响 translation/polish/proofreading 三类任务的分块行为
 */
export const DEFAULT_TASK_CHUNK_SIZE = 8000;

/**
 * 构建格式化的块数据（用于校对或润色）
 * @param paragraphs 段落列表
 * @param chunkSize 块大小限制
 * @returns 格式化后的块列表
 */
export function buildFormattedChunks(
  paragraphs: Paragraph[],
  chunkSize: number,
): Array<{ text: string; paragraphIds: string[] }> {
  const chunks: Array<{ text: string; paragraphIds: string[] }> = [];
  let currentChunkText = '';
  let currentChunkParagraphIds: string[] = [];

  for (const paragraph of paragraphs) {
    // 获取段落的当前翻译
    const currentTranslation =
      paragraph.translations?.find((t) => t.id === paragraph.selectedTranslationId)?.translation ||
      paragraph.translations?.[0]?.translation ||
      '';

    // 格式化段落：[{index}] [ID: {id}] 原文: {原文}\n翻译: {当前翻译}
    let index = currentChunkParagraphIds.length;
    let paragraphText = `[${index}] [ID: ${paragraph.id}] 原文: ${paragraph.text}\n翻译: ${currentTranslation}\n\n`;

    // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
    if (currentChunkText.length + paragraphText.length > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        text: currentChunkText,
        paragraphIds: currentChunkParagraphIds,
      });
      currentChunkText = '';
      currentChunkParagraphIds = [];
      // 这里的 index 重置为 0，并重新生成 paragraphText
      index = 0;
      paragraphText = `[${index}] [ID: ${paragraph.id}] 原文: ${paragraph.text}\n翻译: ${currentTranslation}\n\n`;
    }
    currentChunkText += paragraphText;
    currentChunkParagraphIds.push(paragraph.id);
  }

  // 添加最后一个块
  if (currentChunkText.length > 0) {
    chunks.push({
      text: currentChunkText,
      paragraphIds: currentChunkParagraphIds,
    });
  }

  return chunks;
}

/**
 * 段落格式化函数类型（带 chunk 内索引）
 * @param item 段落对象
 * @param indexInChunk 段落在当前 chunk 内的 0-based 索引
 */
export type ParagraphFormatter<T> = (item: T, indexInChunk: number) => string;

/**
 * 文本块结构
 */
export interface TextChunk {
  text: string;
  paragraphIds: string[];
}

/**
 * 构建文本块
 * 将段落列表按大小分割成多个文本块
 * @param content 段落列表
 * @param chunkSize 每个块的最大字符数
 * @param formatParagraph 段落格式化函数（第二个参数为 chunk 内的 0-based 索引）
 * @param filterParagraph 段落过滤函数（可选，默认过滤空段落）
 * @returns 文本块数组
 */
export function buildChunks<T extends { id: string; text?: string }>(
  content: T[],
  chunkSize: number,
  formatParagraph: ParagraphFormatter<T>,
  filterParagraph?: (item: T) => boolean,
): TextChunk[] {
  const chunks: TextChunk[] = [];

  // 默认过滤空段落
  const shouldInclude = filterParagraph || ((item: T) => !!item.text?.trim());

  let currentChunkText = '';
  let currentChunkParagraphIds: string[] = [];

  for (const paragraph of content) {
    // 应用过滤条件
    if (!shouldInclude(paragraph)) {
      continue;
    }

    // 格式化段落（传入 chunk 内索引）
    const indexInChunk = currentChunkParagraphIds.length;
    const paragraphText = formatParagraph(paragraph, indexInChunk);

    // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
    if (currentChunkText.length + paragraphText.length > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        text: currentChunkText,
        paragraphIds: [...currentChunkParagraphIds],
      });
      currentChunkText = '';
      currentChunkParagraphIds = [];
      // 重新格式化（新 chunk 的索引为 0）
      const newIndexInChunk = 0;
      const newParagraphText = formatParagraph(paragraph, newIndexInChunk);
      currentChunkText += newParagraphText;
    } else {
      currentChunkText += paragraphText;
    }
    currentChunkParagraphIds.push(paragraph.id);
  }

  // 添加最后一个块
  if (currentChunkText.length > 0) {
    chunks.push({
      text: currentChunkText,
      paragraphIds: currentChunkParagraphIds,
    });
  }

  return chunks;
}

/**
 * 检查文本是否只包含符号（不是真正的文本内容）
 * @param text 要检查的文本
 * @returns 如果只包含符号，返回 true
 */
export function isOnlySymbols(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return true;
  }

  // 移除所有空白字符
  const trimmed = text.trim();

  // 检查是否只包含标点符号、数字、特殊符号等
  // 允许的字符：日文假名、汉字、英文字母
  const hasContent =
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u20000-\u2A6DFa-zA-Z]/.test(trimmed);

  return !hasContent;
}

/**
 * 通用的 chunk 接口（所有 chunk 类型都必须有 text 和 paragraphIds）
 */
export interface BaseChunk {
  text: string;
  paragraphIds?: string[];
}

/**
 * 过滤并处理 chunk，排除已处理的段落
 * @param chunk 当前 chunk
 * @param processedParagraphIds 已处理的段落 ID 集合
 * @param logLabel 日志标签（用于输出日志）
 * @param chunkIndex 当前 chunk 索引
 * @param totalChunks 总 chunk 数
 * @returns 如果所有段落都已处理，返回 null；否则返回过滤后的未处理段落 ID 列表
 */
export function filterProcessedParagraphs(
  chunk: BaseChunk,
  processedParagraphIds: Set<string>,
  logLabel: string,
  chunkIndex: number,
  totalChunks: number,
): string[] | null {
  const unprocessedParagraphIds = (chunk.paragraphIds || []).filter(
    (id) => !processedParagraphIds.has(id),
  );

  if (unprocessedParagraphIds.length === 0) {
    console.log(`[${logLabel}] ⚠️ 块 ${chunkIndex + 1}/${totalChunks} 的所有段落都已被处理，跳过`);
    return null;
  }

  return unprocessedParagraphIds;
}

/**
 * 标记已处理的段落
 * @param paragraphs 段落翻译数组
 * @param processedParagraphIds 已处理的段落 ID 集合
 */
export function markProcessedParagraphs(
  paragraphs: { id: string; translation: string }[],
  processedParagraphIds: Set<string>,
): void {
  for (const para of paragraphs) {
    if (para.id) {
      processedParagraphIds.add(para.id);
    }
  }
}

/**
 * 从段落翻译 Map 中标记已处理的段落
 * @param paragraphMap 段落翻译 Map
 * @param processedParagraphIds 已处理的段落 ID 集合
 */
export function markProcessedParagraphsFromMap(
  paragraphMap: Map<string, string>,
  processedParagraphIds: Set<string>,
): void {
  for (const [paraId] of paragraphMap) {
    processedParagraphIds.add(paraId);
  }
}
