import type { Paragraph } from 'src/models/novel';
import { getSelectedTranslation } from 'src/utils';

/**
 * 默认分块大小（与翻译任务保持一致）
 * [警告] 修改此值会影响 translation/polish/proofreading 三类任务的分块行为
 */
export const DEFAULT_TASK_CHUNK_SIZE = 8000;
export const MIN_TASK_CHUNK_SIZE = 1000;
export const MAX_TASK_CHUNK_SIZE = 50000;

/**
 * 规范化任务分块大小（用于用户配置/持久化值）
 * - 非数字/无效值：回退到默认值
 * - 超出范围：钳制到允许区间 [MIN_TASK_CHUNK_SIZE, MAX_TASK_CHUNK_SIZE]
 * - 小数：向下取整，避免意外放大
 *
 * 适用场景：书籍设置保存、UI 输入规范化
 */
export function resolveTaskChunkSize(chunkSize?: number): number {
  if (chunkSize == null) {
    return DEFAULT_TASK_CHUNK_SIZE;
  }

  const normalized = Number(chunkSize);

  if (!Number.isFinite(normalized)) {
    return DEFAULT_TASK_CHUNK_SIZE;
  }

  const integerValue = Math.floor(normalized);
  if (integerValue < MIN_TASK_CHUNK_SIZE) {
    return MIN_TASK_CHUNK_SIZE;
  }
  if (integerValue > MAX_TASK_CHUNK_SIZE) {
    return MAX_TASK_CHUNK_SIZE;
  }

  return integerValue;
}

/**
 * 解析运行时任务分块大小（兼容显式小分块参数，用于任务调用）
 * - 非数字/无效值：回退到默认值
 * - 小于 1：钳制到 1，避免异常输入
 * - 大于最大值：钳制到最大值
 * - 小数：向下取整
 *
 * 与 resolveTaskChunkSize 的区别：
 * - resolveTaskChunkSize 用于持久化配置，最小值为 MIN_TASK_CHUNK_SIZE (1000)
 * - resolveRuntimeTaskChunkSize 用于运行时参数，允许小于 1000 的值（最小 1）
 *
 * 适用场景：翻译/润色/校对任务调用时传入的临时 chunkSize 参数
 */
export function resolveRuntimeTaskChunkSize(chunkSize?: number): number {
  if (chunkSize == null) {
    return DEFAULT_TASK_CHUNK_SIZE;
  }

  const normalized = Number(chunkSize);

  if (!Number.isFinite(normalized)) {
    return DEFAULT_TASK_CHUNK_SIZE;
  }

  const integerValue = Math.floor(normalized);
  if (integerValue < 1) {
    return 1;
  }
  if (integerValue > MAX_TASK_CHUNK_SIZE) {
    return MAX_TASK_CHUNK_SIZE;
  }

  return integerValue;
}

/**
 * 构建格式化的块数据（用于校对或润色）
 * @param paragraphs 段落列表（已过滤空段落，但保留原始索引信息）
 * @param chunkSize 块大小限制
 * @param originalIndices 可选的原始索引映射（paragraph.id -> 章节原始索引），如果不提供则使用数组索引
 * @returns 格式化后的块列表
 */
export function buildFormattedChunks(
  paragraphs: Paragraph[],
  chunkSize: number,
  originalIndices?: Map<string, number>,
): Array<{ text: string; paragraphIds: string[] }> {
  const chunks: Array<{ text: string; paragraphIds: string[] }> = [];
  let currentChunkText = '';
  let currentChunkParagraphIds: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    if (!paragraph) continue;

    // 获取段落的当前翻译
    const currentTranslation = getSelectedTranslation(paragraph);

    // 使用原始索引（如果提供），否则使用数组索引
    const originalIndex = originalIndices?.get(paragraph.id) ?? i;
    // 格式化段落：[{originalIndex}] [ID: {id}] 原文: {原文}\n翻译: {当前翻译}
    const paragraphText = `[${originalIndex}] [ID: ${paragraph.id}] 原文: ${paragraph.text}\n翻译: ${currentTranslation}\n\n`;

    // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
    if (currentChunkText.length + paragraphText.length > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        text: currentChunkText,
        paragraphIds: currentChunkParagraphIds,
      });
      currentChunkText = '';
      currentChunkParagraphIds = [];
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
 * 段落格式化函数类型（带原始索引）
 * @param item 段落对象
 * @param originalIndex 段落在章节中的原始 0-based 索引（包含空段落计数）
 */
export type ParagraphFormatter<T> = (item: T, originalIndex: number) => string;

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
 * @param content 段落列表（章节原始段落数组，可能包含空段落）
 * @param chunkSize 每个块的最大字符数
 * @param formatParagraph 段落格式化函数（第二个参数为章节原始索引，包含空段落计数）
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

  //遍历原始段落列表，保留原始索引
  for (let originalIndex = 0; originalIndex < content.length; originalIndex++) {
    const paragraph = content[originalIndex];
    if (!paragraph) continue;

    // 应用过滤条件（空段落不进入 chunk，但索引仍按原始位置计数）
    if (!shouldInclude(paragraph)) {
      continue;
    }

    // 格式化段落（传入章节原始索引）
    const paragraphText = formatParagraph(paragraph, originalIndex);

    // 如果当前块加上新段落超过限制，且当前块不为空，则先保存当前块
    if (currentChunkText.length + paragraphText.length > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        text: currentChunkText,
        paragraphIds: [...currentChunkParagraphIds],
      });
      currentChunkText = '';
      currentChunkParagraphIds = [];
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
