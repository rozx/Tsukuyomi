import type { ChapterGroupPayload, GistManifest } from 'src/models/manifest';
import {
  chapterGroupEntryKey,
  novelEntryKey,
  parseChapterGroupEntryKey,
} from 'src/models/manifest';
import type { Novel } from 'src/models/novel';
import { normalizeBookLanguages, normalizeChapterLanguages } from './localization/normalize';
import { stripNovelLocalFields } from 'src/utils/sync-strip';
import type { EntryValue } from './gist-sync-incremental';

/** v6 协议固定 16 组；不得随章数改变，否则会导致全书重新分组。 */
export function chapterGroupId(chapterId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < chapterId.length; i++) {
    hash = Math.imul(hash ^ chapterId.charCodeAt(i), 16777619);
  }
  return (hash & 15).toString(16);
}

/** 统一生成哈希与上传载荷，章节目录保序，正文小组按稳定 ID 排序。 */
export function splitBookForSync(book: Novel): Map<string, Novel | ChapterGroupPayload> {
  const normalized = stripNovelLocalFields(normalizeBookLanguages(book));
  const groups = new Map<string, ChapterGroupPayload>();
  const ids = new Set<string>();
  const metadata: Novel = {
    ...normalized,
    ...(normalized.volumes
      ? {
          volumes: normalized.volumes.map((volume) => ({
            ...volume,
            ...(volume.chapters
              ? {
                  chapters: volume.chapters.map((chapter) => {
                    if (!chapter.id || ids.has(chapter.id)) throw new Error('DUPLICATE_CHAPTER_ID');
                    ids.add(chapter.id);
                    const { content, originalContent, contentLoaded: _loaded, ...meta } = chapter;
                    const groupId = chapterGroupId(chapter.id);
                    const group = groups.get(groupId) ?? { bookId: book.id, groupId, chapters: [] };
                    group.chapters.push({
                      id: chapter.id,
                      ...(content !== undefined ? { content } : {}),
                      ...(originalContent !== undefined ? { originalContent } : {}),
                    });
                    groups.set(groupId, group);
                    return meta;
                  }),
                }
              : {}),
          })),
        }
      : {}),
  };
  const entries = new Map<string, Novel | ChapterGroupPayload>([
    [novelEntryKey(book.id), metadata],
  ]);
  for (const [groupId, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    group.chapters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    entries.set(chapterGroupEntryKey(book.id, groupId), group);
  }
  return entries;
}

/** 除哈希外还校验正文身份与结构，拒绝跨书/跨组或重复章节。 */
export function validateChapterGroup(
  value: ChapterGroupPayload,
  bookId: string,
  groupId: string,
): void {
  if (
    !value ||
    value.bookId !== bookId ||
    value.groupId !== groupId ||
    !Array.isArray(value.chapters)
  )
    throw new Error('INVALID_CHAPTER_GROUP');
  const ids = new Set<string>();
  for (const chapter of value.chapters) {
    if (
      !chapter ||
      typeof chapter.id !== 'string' ||
      !chapter.id ||
      ids.has(chapter.id) ||
      chapterGroupId(chapter.id) !== groupId
    )
      throw new Error('INVALID_CHAPTER_GROUP_MEMBER');
    ids.add(chapter.id);
    if (chapter.content !== undefined) normalizeChapterLanguages(chapter.content);
    if (chapter.originalContent !== undefined && typeof chapter.originalContent !== 'string')
      throw new Error('INVALID_CHAPTER_ORIGINAL_CONTENT');
  }
}

/** 已知远端哈希不代表本地章节仍存在；目录涉及的缺失章节必须补读正文组。 */
export function missingLocalChapterGroups(
  entries: Record<string, EntryValue>,
  localBooks: readonly Novel[],
): string[] {
  const localIds = new Map(
    localBooks.map((book) => [
      book.id,
      new Set(
        (book.volumes ?? []).flatMap((volume) =>
          (volume.chapters ?? []).map((chapter) => chapter.id),
        ),
      ),
    ]),
  );
  const missing = new Set<string>();
  for (const entry of Object.values(entries)) {
    if (entry.kind !== 'novel') continue;
    const ids = localIds.get(entry.bookId);
    for (const volume of entry.value.volumes ?? []) {
      for (const chapter of volume.chapters ?? []) {
        const key = chapterGroupEntryKey(entry.bookId, chapterGroupId(chapter.id));
        if (!ids?.has(chapter.id) && !entries[key]) missing.add(key);
      }
    }
  }
  return [...missing];
}

/** 先验证完整依赖，再组装；未下载组必须已知且哈希一致，恢复时不允许省略。 */
export function assembleChapterGroups(
  entries: Record<string, EntryValue>,
  manifest: GistManifest,
  knownHashes: Record<string, string> = {},
): Record<string, EntryValue> {
  const result: Record<string, EntryValue> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (entry.kind === 'chapters') {
      if (entries[novelEntryKey(entry.bookId)]?.kind !== 'novel')
        throw new Error('CHAPTER_GROUP_BOOK_MISSING');
      continue;
    }
    if (entry.kind !== 'novel') {
      result[key] = entry;
      continue;
    }
    const expectedIds = new Set<string>();
    const readIds = new Set<string>();
    const bodies = new Map<string, ChapterGroupPayload['chapters'][number]>();
    for (const [groupKey, groupEntry] of Object.entries(entries)) {
      if (groupEntry.kind !== 'chapters' || groupEntry.bookId !== entry.bookId) continue;
      const identity = parseChapterGroupEntryKey(groupKey);
      if (!identity) throw new Error('INVALID_CHAPTER_GROUP_KEY');
      validateChapterGroup(groupEntry.value, identity.bookId, identity.groupId);
      for (const body of groupEntry.value.chapters) {
        bodies.set(body.id, body);
        readIds.add(body.id);
      }
    }
    const unchangedChapterIds: string[] = [];
    const value: Novel = {
      ...entry.value,
      ...(entry.value.volumes
        ? {
            volumes: entry.value.volumes.map((volume) => ({
              ...volume,
              ...(volume.chapters
                ? {
                    chapters: volume.chapters.map((chapter) => {
                      if (!chapter.id || expectedIds.has(chapter.id))
                        throw new Error('DUPLICATE_CHAPTER_ID');
                      expectedIds.add(chapter.id);
                      const groupKey = chapterGroupEntryKey(
                        entry.bookId,
                        chapterGroupId(chapter.id),
                      );
                      const group = manifest.entries[groupKey];
                      if (!group) throw new Error('CHAPTER_GROUP_MISSING');
                      const body = bodies.get(chapter.id);
                      if (body) return { ...chapter, ...body };
                      if (entries[groupKey] || knownHashes[groupKey] !== group.hash)
                        throw new Error('CHAPTER_BODY_MISSING');
                      unchangedChapterIds.push(chapter.id);
                      return chapter;
                    }),
                  }
                : {}),
            })),
          }
        : {}),
    };
    if ([...readIds].some((id) => !expectedIds.has(id))) throw new Error('ORPHAN_CHAPTER_BODY');
    // 声明了正文组但目录没有任何成员，同样是不完整/损坏的布局。
    const expectedGroups = new Set([...expectedIds].map(chapterGroupId));
    for (const manifestKey of Object.keys(manifest.entries)) {
      const identity = parseChapterGroupEntryKey(manifestKey);
      if (identity?.bookId === entry.bookId && !expectedGroups.has(identity.groupId))
        throw new Error('ORPHAN_CHAPTER_GROUP');
    }
    result[key] = { ...entry, value, unchangedChapterIds };
  }
  return result;
}
