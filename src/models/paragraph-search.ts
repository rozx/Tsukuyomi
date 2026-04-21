import type { Chapter, Paragraph, Volume } from 'src/models/novel';

/**
 * 段落搜索结果：段落本体 + 在小说中的位置坐标。
 *
 * 独立于 chapter-service / full-text-index-service，供两者共享类型，
 * 避免它们之间形成循环依赖。
 */
export interface ParagraphSearchResult {
  paragraph: Paragraph;
  paragraphIndex: number;
  chapter: Chapter;
  chapterIndex: number;
  volume: Volume;
  volumeIndex: number;
}
