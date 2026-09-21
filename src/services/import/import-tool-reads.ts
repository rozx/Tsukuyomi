import type { ImportDraftChapter, ImportResource, ImportRunContext } from 'src/models/import';
import { ImportRepository } from './import-repository';
import { ImportLibraryService } from './import-library-service';
import { ImportContentService } from './import-content-service';

export function textArgument(
  args: Record<string, unknown>,
  key: string,
  fallback?: string,
): string {
  const value = args[key] ?? fallback;
  if (typeof value !== 'string') throw new Error(`INVALID_ARGUMENTS: ${key} 必须是文本`);
  return value;
}
export function pageArguments(args: Record<string, unknown>, max = 100) {
  const offset = args.offset ?? 0;
  const limit = args.limit ?? Math.min(max, 30);
  if (
    !Number.isSafeInteger(offset) ||
    (offset as number) < 0 ||
    !Number.isSafeInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > max
  )
    throw new Error(`INVALID_PAGE: offset 须为非负整数，limit 须为 1–${max}`);
  return { offset: offset as number, limit: limit as number };
}
function chapterInfo(chapter: ImportDraftChapter) {
  const { content, ...info } = chapter;
  return { ...info, contentReferenceCount: content.length };
}
async function readDraft(taskId: string, args: Record<string, unknown>) {
  const task = await ImportRepository.getTask(taskId);
  if (!task) throw new Error('TASK_NOT_FOUND: 任务不存在');
  const { offset, limit } = pageArguments(args);
  if (args.view === 'chapter') {
    const chapter = task.draft.chapters.find(
      (entry) => entry.id === textArgument(args, 'chapter_id'),
    );
    if (!chapter) throw new Error('CHAPTER_NOT_FOUND: 草稿章节不存在');
    return {
      ...chapterInfo(chapter),
      draftRevision: task.draft.revision,
      content: chapter.content.slice(offset, offset + limit),
      total: chapter.content.length,
      ...(offset + limit < chapter.content.length ? { nextOffset: offset + limit } : {}),
    };
  }
  if (args.view === 'chapters')
    return {
      draftRevision: task.draft.revision,
      chapters: task.draft.chapters.slice(offset, offset + limit).map(chapterInfo),
      total: task.draft.chapters.length,
      ...(offset + limit < task.draft.chapters.length ? { nextOffset: offset + limit } : {}),
    };
  const draft = task.draft;
  return {
    draftRevision: draft.revision,
    metadata: draft.metadata,
    metadataCandidates: draft.metadataCandidates,
    target: draft.target,
    novelScope: draft.novelScope,
    volumes: draft.volumes,
    chapterCount: draft.chapters.length,
    completeness: draft.completeness,
    pendingQuestion: task.pendingQuestion,
    currentPlanId: task.currentPlanId,
  };
}

async function readResource(taskId: string, args: Record<string, unknown>) {
  const resourceId = textArgument(args, 'resource_id');
  const view = textArgument(args, 'view', 'text');
  if (view === 'text')
    return ImportContentService.read(taskId, resourceId, pageArguments(args, 16000));
  const resource = await ImportRepository.getResource(taskId, resourceId);
  if (!resource) throw new Error('SOURCE_SCOPE: 资源不存在');
  if (view === 'inspection' && resource.kind === 'snapshot')
    return { resourceId, inspection: resource.inspection };
  if (resource.kind !== 'extraction') throw new Error('UNREADABLE_RESOURCE: 该视图需要已提取内容');
  return extractionPage(resource, view, args);
}
function extractionPage(
  resource: Extract<ImportResource, { kind: 'extraction' }>,
  view: string,
  args: Record<string, unknown>,
) {
  const { offset, limit } = pageArguments(args);
  const values = view === 'excluded' ? resource.excluded : resource.blocks;
  let budget = 16000;
  const items = [];
  for (const value of values.slice(offset, offset + limit)) {
    if (budget <= 0) break;
    const { text, ...position } = value;
    const preview = text.slice(0, Math.min(2000, budget));
    budget -= preview.length;
    items.push({
      ...position,
      preview,
      textLength: text.length,
      truncated: text.length > preview.length,
    });
  }
  return {
    resourceId: resource.id,
    snapshotId: resource.snapshotId,
    items,
    total: values.length,
    rules: resource.rules,
    ...(offset + items.length < values.length ? { nextOffset: offset + items.length } : {}),
  };
}

export async function readImportTool(
  run: ImportRunContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const id = run.taskId;
  switch (name) {
    case 'list_sources':
      return ImportRepository.listSources(id, {
        limit: pageArguments(args).limit,
        ...(typeof args.cursor === 'string' ? { cursor: args.cursor } : {}),
        ...(typeof args.parent_source_id === 'string'
          ? { parentSourceId: args.parent_source_id }
          : {}),
        ...(typeof args.status === 'string' ? { status: args.status as 'registered' } : {}),
      });
    case 'read_source':
      return readResource(id, args);
    case 'get_import_draft':
      return readDraft(id, args);
    case 'search_books':
      return ImportLibraryService.search(id, {
        query: textArgument(args, 'query', ''),
        ...pageArguments(args),
        ...(typeof args.author === 'string' ? { author: args.author } : {}),
        ...(typeof args.url === 'string' ? { url: args.url } : {}),
      });
    case 'get_book_info':
      return ImportLibraryService.book(id, textArgument(args, 'book_id'));
    case 'list_chapters':
      return ImportLibraryService.chapters(id, textArgument(args, 'book_id'), pageArguments(args));
    case 'get_chapter_info':
      return ImportLibraryService.chapter(
        id,
        textArgument(args, 'book_id'),
        textArgument(args, 'chapter_id'),
        pageArguments(args),
      );
    default:
      throw new Error('TOOL_NOT_ALLOWED: 不支持的读取工具');
  }
}
