import type { Chapter, Novel } from 'src/models/novel';

/** 所有章节的稳定 ID 索引，兼容未分卷或无章节的书籍。 */
export function indexBookChapters(book: Novel | undefined): Map<string, Chapter> {
  return new Map(
    (book?.volumes ?? []).flatMap((volume) =>
      (volume.chapters ?? []).map((chapter) => [chapter.id, chapter] as const),
    ),
  );
}
