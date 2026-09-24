import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type {
  CatalogEntry,
  SyncNewChapter,
  SyncUpdatedChapter,
  SyncVolumeTarget,
} from 'src/models/book-sync';
import { matchImportParagraphs } from 'src/services/import/import-paragraph-matching';
import { UniqueIdGenerator } from 'src/utils/id-generator';

export function sameChapterText(chapter: Chapter, content: Paragraph[], remote: string[]): boolean {
  return (
    (chapter.originalContent ?? content.map((p) => p.text).join('\n')).trim() ===
    remote.join('\n').trim()
  );
}

export async function compareChapter(
  chapter: Chapter,
  content: Paragraph[],
  remote: string[],
  entry: CatalogEntry,
): Promise<SyncUpdatedChapter | undefined> {
  if (sameChapterText(chapter, content, remote)) return undefined;
  const ids = new UniqueIdGenerator(content.map((p) => p.id));
  const matched = await matchImportParagraphs({
    scopeId: chapter.id,
    old: content.map((paragraph) => ({ chapterId: chapter.id, paragraph })),
    next: remote.map((text, i) => ({
      key: String(i),
      chapterId: chapter.id,
      text,
      newId: ids.generate(),
    })),
  });
  return {
    ...entry,
    chapterId: chapter.id,
    paragraphs: matched.paragraphs.map((p) => p.paragraph),
    changes: matched.changes,
    revised: matched.changes.filter((c) => c.kind === 'revise').length,
    inserted: matched.changes.filter((c) => c.kind === 'insert').length,
    removed: matched.changes.filter((c) => c.kind === 'remove').length,
    clearedVersions: matched.changes.reduce((sum, c) => sum + c.clearedVersions, 0),
  };
}

export function inferNewChapters(
  book: Novel | undefined,
  entries: CatalogEntry[],
  skipped: string[],
): SyncNewChapter[] {
  const known = new Map(
    (book?.volumes ?? []).flatMap((volume) =>
      (volume.chapters ?? []).flatMap((chapter) =>
        chapter.webUrl ? [[chapter.webUrl, volume.id] as const] : [],
      ),
    ),
  );
  // 分组是否已有章节取决于整个目录，不能只看扫描到当前位置的章节。
  const existingGroups = new Set(
    entries.filter((entry) => known.has(entry.url)).map((entry) => entry.group),
  );
  const ignored = new Set(skipped);
  let anchor: string | undefined;
  let previous = '';
  let segment = 0;
  const result: SyncNewChapter[] = [];
  for (const entry of entries) {
    const volume = known.get(entry.url);
    if (volume) {
      anchor = volume;
      previous = '';
      continue;
    }
    if (ignored.has(entry.url)) {
      previous = '';
      continue;
    }
    const target: SyncVolumeTarget =
      entry.group && !existingGroups.has(entry.group)
        ? { newTitle: entry.group }
        : anchor || book?.volumes?.at(-1)?.id
          ? { volumeId: (anchor ?? book?.volumes?.at(-1)?.id)! }
          : { newTitle: '正文' };
    const key = JSON.stringify(target);
    if (key !== previous) segment++;
    previous = key;
    result.push({ ...entry, target, groupKey: `${segment}:${key}` });
  }
  return result;
}
