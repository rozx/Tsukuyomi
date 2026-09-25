import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type {
  CatalogEntry,
  SyncNewChapter,
  SyncUpdatedChapter,
  SyncVolumeTarget,
} from 'src/models/book-sync';
import { matchImportParagraphs } from 'src/services/import/import-paragraph-matching';
import { UniqueIdGenerator } from 'src/utils/id-generator';

/** 去掉空白行后比较：站点改版插入 / 删除空行不算正文修订 */
function withoutBlankLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .join('\n')
    .trim();
}

const isBlank = (text: string | undefined) => !text?.trim();

export function sameChapterText(chapter: Chapter, content: Paragraph[], remote: string[]): boolean {
  return (
    withoutBlankLines(chapter.originalContent ?? content.map((p) => p.text).join('\n')) ===
    withoutBlankLines(remote.join('\n'))
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
    // 计数只反映有文字的段落，空白段落的增删不计
    revised: matched.changes.filter((c) => c.kind === 'revise').length,
    inserted: matched.changes.filter((c) => c.kind === 'insert' && !isBlank(c.after)).length,
    removed: matched.changes.filter((c) => c.kind === 'remove' && !isBlank(c.before)).length,
    clearedVersions: matched.changes.reduce((sum, c) => sum + c.clearedVersions, 0),
  };
}

function normalizeTitle(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function chapterTitleText(chapter: Chapter): string {
  return typeof chapter.title === 'string' ? chapter.title : (chapter.title?.original ?? '');
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k) groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}

/**
 * 为手动添加（没有网址）的本地章节推断对应的目录条目：
 * 1. 标题（NFKC、空白归一）在未占用条目与未关联章节中都唯一时按标题关联；
 * 2. 仍未关联的连续章节夹在两个已关联章节之间，且区间内未占用条目数与章节数相同时按顺序关联。
 * 无法确定时不关联（保持为新章节），绝不猜测。
 */
export function linkManualChapters(
  chapters: Chapter[],
  entries: Pick<CatalogEntry, 'url' | 'title'>[],
): { chapterId: string; url: string }[] {
  const assigned = new Map<string, string>();
  const claimed = new Set(chapters.flatMap((c) => (c.webUrl ? [c.webUrl] : [])));
  const links: { chapterId: string; url: string }[] = [];
  const link = (chapterId: string, url: string) => {
    assigned.set(chapterId, url);
    claimed.add(url);
    links.push({ chapterId, url });
  };

  const unlinked = chapters.filter((c) => !c.webUrl);
  const entryGroups = groupBy(
    entries.filter((e) => !claimed.has(e.url)),
    (e) => normalizeTitle(e.title),
  );
  const chapterGroups = groupBy(unlinked, (c) => normalizeTitle(chapterTitleText(c)));
  for (const chapter of unlinked) {
    const title = normalizeTitle(chapterTitleText(chapter));
    const candidates = entryGroups.get(title);
    if (candidates?.length === 1 && chapterGroups.get(title)?.length === 1) {
      link(chapter.id, candidates[0]!.url);
    }
  }

  const urlOf = (c: Chapter) => c.webUrl ?? assigned.get(c.id);
  const position = new Map(entries.map((e, i) => [e.url, i]));
  for (let i = 0; i < chapters.length; i++) {
    if (urlOf(chapters[i]!)) continue;
    let end = i;
    while (end < chapters.length && !urlOf(chapters[end]!)) end++;
    const before = i > 0 ? position.get(urlOf(chapters[i - 1]!)!) : undefined;
    const after = end < chapters.length ? position.get(urlOf(chapters[end]!)!) : undefined;
    if (before !== undefined && after !== undefined && after > before) {
      const free = entries.slice(before + 1, after).filter((e) => !claimed.has(e.url));
      if (free.length === end - i) free.forEach((e, k) => link(chapters[i + k]!.id, e.url));
    }
    i = end;
  }
  return links;
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
