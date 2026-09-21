import type { Chapter } from 'src/models/novel';
import type { ImportDraftChapter, ImportPlan, ImportSource } from 'src/models/import';
import type { ImportPlanContext } from './import-plan-context';

export interface ImportChapterMatch {
  draft: ImportDraftChapter;
  oldIds: string[];
  candidates: string[];
  urls: string[];
}

export function importChapterOrigins(match: ImportChapterMatch): string[] {
  return [
    ...new Set([
      ...match.oldIds,
      ...match.draft.content.flatMap((ref) => (ref.kind === 'existing' ? [ref.chapterId] : [])),
    ]),
  ];
}
function original(title: Chapter['title']): string {
  return typeof title === 'string' ? title : title.original;
}

export function importSourceUrls(
  source: ImportSource | undefined,
  sources: Map<string, ImportSource>,
): string[] {
  if (!source) return [];
  if (source.replacesSourceId)
    return importSourceUrls(
      sources.get(source.replacesSourceId),
      new Map([...sources].filter(([id]) => id !== source.id)),
    );
  return source.url ? [source.url + (source.anchor ?? '')] : [];
}

export function matchImportChapters(
  context: ImportPlanContext,
  conflicts: ImportPlan['conflicts'],
): ImportChapterMatch[] {
  const old = (context.snapshot?.book.volumes ?? []).flatMap((volume) => volume.chapters ?? []);
  const receipts =
    context.task.appliedMappings?.find((mapping) => mapping.bookId === context.snapshot?.book.id)
      ?.chapters ?? [];
  return context.chapters.map((draft) => {
    const urls = [
      ...new Set(
        draft.sourceIds.flatMap((id) => importSourceUrls(context.sources.get(id), context.sources)),
      ),
    ];
    let oldIds: string[] = [];
    if (context.snapshot) {
      if (draft.match?.basis === 'user') oldIds = draft.match.chapterIds;
      else {
        const receipt = receipts.find((entry) => entry.draftChapterId === draft.id);
        const exact = old.filter((chapter) => chapter.webUrl && urls.includes(chapter.webUrl));
        if (receipt && old.some((chapter) => chapter.id === receipt.chapterId))
          oldIds = [receipt.chapterId];
        else if (exact.length === 1 && urls.length === 1) oldIds = [exact[0]!.id];
        else if (exact.length > 1)
          conflicts.push({
            code: 'CHAPTER_MATCH_REQUIRED',
            message: `“${draft.title}”的网址对应多个旧章节`,
            chapterId: draft.id,
          });
      }
    }
    const candidates = old
      .filter(
        (chapter) =>
          original(chapter.title) === draft.title || draft.match?.chapterIds.includes(chapter.id),
      )
      .map((chapter) => chapter.id);
    if (!oldIds.length && candidates.length && draft.match?.basis !== 'user')
      conflicts.push({
        code: 'CHAPTER_MATCH_REQUIRED',
        message: `请确认“${draft.title}”是新增章节还是覆盖候选章节`,
        chapterId: draft.id,
      });
    if (oldIds.some((id) => !old.some((chapter) => chapter.id === id)))
      conflicts.push({
        code: 'CHAPTER_MATCH_REQUIRED',
        message: '已选择的旧章节不再存在',
        chapterId: draft.id,
      });
    return { draft, oldIds, candidates, urls };
  });
}

/** 只有明确共享旧章节范围或既有段落引用的输出章节才在同组跨章匹配。 */
export function groupImportChapters(matches: ImportChapterMatch[]): ImportChapterMatch[][] {
  const groups: { items: ImportChapterMatch[]; old: Set<string> }[] = [];
  for (const match of matches) {
    const ids = new Set(importChapterOrigins(match));
    const related = groups.filter((group) => [...ids].some((id) => group.old.has(id)));
    const group = { items: [match], old: ids };
    for (const entry of related) {
      group.items.push(...entry.items);
      for (const id of entry.old) group.old.add(id);
      groups.splice(groups.indexOf(entry), 1);
    }
    groups.push(group);
  }
  const order = new Map(matches.map((match, index) => [match.draft.id, index]));
  return groups.map((group) =>
    group.items.sort((a, b) => order.get(a.draft.id)! - order.get(b.draft.id)!),
  );
}
