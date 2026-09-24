import type { Paragraph } from 'src/models/novel';
import { hashJson } from 'src/utils/content-hash';

/**
 * 章节段落结构指纹：按顺序的 [段落 ID, 原文] 的 SHA-256。
 *
 * 只取 ID 与原文，翻译、改选译文都不改变指纹；
 * 增删段落、调整顺序、修改原文都会改变指纹。
 * 用于同步时判断哪一方相对基准修改过段落结构。
 */
export function chapterStructureHash(paragraphs: readonly Paragraph[]): Promise<string> {
  return hashJson(paragraphs.map((p) => [p.id, p.text]));
}
