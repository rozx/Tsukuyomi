import type { Novel } from 'src/models/novel';
import type {
  ImportDraftChapter,
  ImportResource,
  ImportSource,
  ImportTask,
} from 'src/models/import';
import { getDB } from 'src/utils/indexed-db';
import { hashJson } from 'src/utils/content-hash';
import { ImportRepository } from './import-repository';
import { ImportLibraryReader } from './import-library-reader';
import { ImportDraftValidator } from './import-draft-validation';

export type ImportBookSnapshot = Extract<
  Awaited<ReturnType<typeof ImportLibraryReader.readBook>>,
  { kind: 'loaded' }
>;
export interface ImportPlanContext {
  task: ImportTask;
  snapshot?: ImportBookSnapshot;
  allBooks: Novel[];
  occupiedChapterIds: Set<string>;
  sources: Map<string, ImportSource>;
  resources: Map<string, ImportResource>;
  resource(id: string): Promise<ImportResource>;
  validator: ImportDraftValidator;
  chapters: ImportDraftChapter[];
}

export async function fingerprintImportBook(snapshot?: ImportBookSnapshot): Promise<string> {
  if (!snapshot) return hashJson(null);
  const book = JSON.parse(JSON.stringify(snapshot.book)) as Novel;
  for (const volume of book.volumes ?? [])
    for (const chapter of volume.chapters ?? []) {
      delete chapter.content;
      delete chapter.contentLoaded;
    }
  const chapters = Object.fromEntries(
    Object.entries(snapshot.chapters).map(([id, content]) => [
      id,
      content.kind === 'loaded' ? { kind: 'loaded', content: content.content } : content,
    ]),
  );
  return hashJson({ book, chapters });
}

export async function loadImportPlanContext(
  taskId: string,
  revision: number,
): Promise<ImportPlanContext> {
  const task = await ImportRepository.getTask(taskId);
  if (!task) throw new Error('TASK_NOT_FOUND: 导入任务不存在');
  if (task.draft.revision !== revision) throw new Error('DRAFT_CHANGED: 草稿已改变');
  let snapshot: ImportBookSnapshot | undefined;
  if (task.draft.target.kind === 'existing') {
    const loaded = await ImportLibraryReader.readBook(task.draft.target.bookId);
    if (loaded.kind !== 'loaded')
      throw new Error(
        `BOOK_READ_FAILED: ${loaded.kind === 'failed' ? loaded.message : '目标小说不存在'}`,
      );
    snapshot = loaded;
  }
  const db = await getDB();
  const allBooks = await db.getAll('books');
  const occupiedChapterIds = new Set(await db.getAllKeys('chapter-contents'));
  for (const book of allBooks)
    for (const volume of book.volumes ?? [])
      for (const chapter of volume.chapters ?? []) occupiedChapterIds.add(chapter.id);
  const sources = new Map(
    (await db.getAllFromIndex('import-sources', 'by-task', taskId)).map((source) => [
      source.id,
      source,
    ]),
  );
  const resources = new Map<string, ImportResource>();
  const resource = async (id: string): Promise<ImportResource> => {
    let value = resources.get(id);
    if (!value) {
      value = await ImportRepository.getResource(taskId, id);
      if (!value) throw new Error('SOURCE_SCOPE: 正文资源不存在');
      resources.set(id, value);
    }
    return value;
  };
  const books = new Map(snapshot ? [[snapshot.book.id, snapshot] as const] : []);
  const validator = new ImportDraftValidator(
    taskId,
    { resource, source: (id) => Promise.resolve(sources.get(id)) },
    books,
  );
  return {
    task,
    ...(snapshot ? { snapshot } : {}),
    allBooks,
    occupiedChapterIds,
    sources,
    resources,
    resource,
    validator,
    chapters: task.draft.chapters.filter(
      (chapter) => chapter.selected && chapter.status === 'ready',
    ),
  };
}
