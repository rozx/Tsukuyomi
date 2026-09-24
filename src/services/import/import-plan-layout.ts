import type { Chapter, Novel, Paragraph, Volume } from 'src/models/novel';
import type { ImportPlan } from 'src/models/import';
import type { ImportPlanContext } from './import-plan-context';
import type { ImportChapterMatch } from './import-plan-chapters';
import { importChapterOrigins } from './import-plan-chapters';
import { canonicalStringify } from 'src/utils/canonical-json';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import { ImportMetadataService } from './import-metadata-service';

export interface ResolvedImportChapter {
  match: ImportChapterMatch;
  id: string;
  content: Paragraph[];
}
const IDENTITY_FIELDS = new Set([
  'id',
  'title',
  'content',
  'contentLoaded',
  'originalContent',
  'webUrl',
  'createdAt',
  'lastEdited',
  'lastUpdated',
]);
function settings(chapter: Chapter): Record<string, unknown> {
  return Object.fromEntries(Object.entries(chapter).filter(([key]) => !IDENTITY_FIELDS.has(key)));
}
function original(title: Chapter['title']): string {
  return typeof title === 'string' ? title : title.original;
}
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function chapterMetadata(
  context: ImportPlanContext,
  resolved: ResolvedImportChapter,
  plan: ImportPlan,
  usedUrls: Map<string, number>,
): Chapter {
  const old = (context.snapshot?.book.volumes ?? []).flatMap((volume) => volume.chapters ?? []);
  const sourceIds = importChapterOrigins(resolved.match);
  const previous = old.find((chapter) => chapter.id === resolved.id);
  const sourceSettings = sourceIds
    .map((id) => old.find((chapter) => chapter.id === id))
    .filter((chapter): chapter is Chapter => Boolean(chapter));
  const selection = context.task.draft.chapterSettingsSources?.[resolved.match.draft.id];
  const chosen =
    selection && selection.bookRevision === context.snapshot?.revision
      ? sourceSettings.find((chapter) => chapter.id === selection.chapterId)
      : undefined;
  const variants = new Set(sourceSettings.map((chapter) => canonicalStringify(settings(chapter))));
  if (variants.size > 1 && !chosen)
    plan.conflicts.push({
      code: 'CHAPTER_SETTINGS_CONFLICT',
      message: `“${resolved.match.draft.title}”合并范围的章节设置不同，请选择保留来源`,
      chapterId: resolved.match.draft.id,
    });
  const now = new Date(plan.createdAt);
  const base: Chapter = previous
    ? copy(previous)
    : { id: resolved.id, title: resolved.match.draft.title, createdAt: now, lastEdited: now };
  for (const key of Object.keys(settings(base)))
    delete (base as unknown as Record<string, unknown>)[key];
  const result: Chapter = {
    ...base,
    ...settings(chosen ?? sourceSettings[0] ?? base),
    id: resolved.id,
    title:
      previous && original(previous.title) === resolved.match.draft.title
        ? previous.title
        : resolved.match.draft.title,
    contentLoaded: true,
  };
  delete result.content;
  const priorContent = context.snapshot?.chapters[resolved.id];
  const textChanged =
    priorContent?.kind !== 'loaded' ||
    canonicalStringify(priorContent.content) !== canonicalStringify(resolved.content);
  if (
    !previous ||
    textChanged ||
    original(previous.title) !== resolved.match.draft.title ||
    canonicalStringify(settings(previous)) !== canonicalStringify(settings(result))
  )
    result.lastEdited = now;
  if (textChanged)
    result.originalContent = resolved.content.map((paragraph) => paragraph.text).join('\n');
  const url = resolved.match.urls.length === 1 ? resolved.match.urls[0] : undefined;
  if (url && usedUrls.get(url) === 1) result.webUrl = url;
  else if (
    resolved.match.oldIds.length > 1 ||
    resolved.match.urls.length > 1 ||
    (url && usedUrls.get(url)! > 1)
  ) {
    delete result.webUrl;
    delete result.lastUpdated;
  }
  if (previous && canonicalStringify(previous.title) !== canonicalStringify(result.title))
    plan.metadataChanges.push({
      field: `chapter.${result.id}.title`,
      before: original(previous.title),
      after: resolved.match.draft.title,
    });
  return result;
}

function mergeOrder<T extends { id: string }>(
  old: T[],
  incoming: { item: T; anchors: string[] }[],
  consumed: Set<string>,
): T[] {
  const result: T[] = [];
  const retained = new Set<string>();
  for (const item of incoming) {
    const anchor = old.findIndex((chapter) => item.anchors.includes(chapter.id));
    if (anchor >= 0)
      for (let index = 0; index < anchor; index++) {
        const chapter = old[index]!;
        if (!consumed.has(chapter.id) && !retained.has(chapter.id)) {
          result.push(chapter);
          retained.add(chapter.id);
        }
      }
    result.push(item.item);
  }
  for (const chapter of old)
    if (!consumed.has(chapter.id) && !retained.has(chapter.id)) result.push(chapter);
  return result;
}

async function adoptBookMetadata(
  context: ImportPlanContext,
  book: Novel,
  plan: ImportPlan,
): Promise<void> {
  for (const [field, value] of Object.entries(context.task.draft.metadata)) {
    if (!value?.adopted) continue;
    const before = book[field as keyof Novel];
    const after =
      field === 'cover'
        ? { url: await ImportMetadataService.resolveCover(context.task.id, value) }
        : field === 'alternateTitles' || field === 'tags'
          ? [
              ...new Set(
                value.value
                  .split(/\r?\n/)
                  .map((text) => text.trim())
                  .filter(Boolean),
              ),
            ]
          : value.value;
    if (canonicalStringify(before) !== canonicalStringify(after))
      plan.metadataChanges.push({
        field,
        ...(before === undefined
          ? {}
          : { before: typeof before === 'string' ? before : JSON.stringify(before) }),
        after: typeof after === 'string' ? after : JSON.stringify(after),
        ...(value.sourceId ? { sourceId: value.sourceId } : {}),
      });
    Object.assign(book, { [field]: after });
  }
  if (!book.title?.trim())
    plan.conflicts.push({ code: 'TITLE_REQUIRED', message: '新建小说需要书名' });
}

function layoutVolumes(
  context: ImportPlanContext,
  book: Novel,
  resolved: ResolvedImportChapter[],
  consumed: Set<string>,
  plan: ImportPlan,
): Volume[] {
  const volumes = (book.volumes ?? []).map((volume) => ({
    ...volume,
    chapters: volume.chapters ?? [],
  }));
  const generator = new UniqueIdGenerator(volumes.map((volume) => volume.id));
  const claimed = new Set<string>();
  const oldOwners = new Map(
    volumes.flatMap((volume) => volume.chapters.map((chapter) => [chapter.id, volume.id] as const)),
  );
  const usedUrls = new Map<string, number>();
  for (const item of resolved)
    for (const url of item.match.urls) usedUrls.set(url, (usedUrls.get(url) ?? 0) + 1);
  const incoming = new Map<string, { item: Chapter; anchors: string[] }[]>();
  for (const draftVolume of context.task.draft.volumes) {
    const children = resolved.filter((item) => item.match.draft.volumeId === draftVolume.id);
    if (!children.length) continue;
    const named = volumes.filter(
      (volume) => original(volume.title) === draftVolume.title && !claimed.has(volume.id),
    );
    const owner = children
      .flatMap((item) => item.match.oldIds.map((id) => oldOwners.get(id)))
      .find((id) => id && !claimed.has(id));
    let volume =
      volumes.find((entry) => entry.id === draftVolume.id && !claimed.has(entry.id)) ??
      volumes.find((entry) => entry.id === owner) ??
      (named.length === 1 ? named[0] : undefined);
    if (!volume) {
      volume = { id: generator.generate(), title: draftVolume.title, chapters: [] };
      volumes.push(volume);
    } else if (original(volume.title) !== draftVolume.title) {
      plan.metadataChanges.push({
        field: `volume.${volume.id}.title`,
        before: original(volume.title),
        after: draftVolume.title,
      });
      volume.title = draftVolume.title;
    }
    claimed.add(volume.id);
    incoming.set(
      volume.id,
      children.map((item) => ({
        item: chapterMetadata(context, item, plan, usedUrls),
        anchors: item.match.oldIds,
      })),
    );
  }
  for (const volume of volumes)
    volume.chapters = mergeOrder(volume.chapters, incoming.get(volume.id) ?? [], consumed);
  const ordered = [...incoming.keys()].map((id) => ({
    item: volumes.find((volume) => volume.id === id)!,
    anchors: [id],
  }));
  return mergeOrder(volumes, ordered, claimed);
}

function preserveRetainedContent(
  volumes: Volume[],
  resolved: ResolvedImportChapter[],
  plan: ImportPlan,
): void {
  for (const volume of volumes)
    for (const chapter of volume.chapters ?? []) {
      const written = plan.chapters.find((entry) => entry.chapterId === chapter.id);
      if (written && !resolved.some((entry) => entry.id === chapter.id)) {
        chapter.lastEdited = new Date(plan.createdAt);
        chapter.originalContent = written.content.map((paragraph) => paragraph.text).join('\n');
      }
      if (chapter.content !== undefined) {
        // 合法旧格式转存，不能因写元信息而剥离后丢失内嵌正文。
        if (!written) plan.chapters.push({ chapterId: chapter.id, content: chapter.content });
        delete chapter.content;
      }
    }
}

export async function buildImportBook(
  context: ImportPlanContext,
  resolved: ResolvedImportChapter[],
  consumed: Set<string>,
  plan: ImportPlan,
): Promise<void> {
  const { defaultAIModel: _privateModels, ...safeBook } = context.snapshot?.book ?? {
    id: plan.targetBookId,
    title: '',
    createdAt: new Date(plan.createdAt),
    lastEdited: new Date(plan.createdAt),
  };
  const book = copy(safeBook) as Novel;
  await adoptBookMetadata(context, book, plan);
  book.volumes = layoutVolumes(context, book, resolved, consumed, plan);
  preserveRetainedContent(book.volumes, resolved, plan);
  plan.book = book;
}
