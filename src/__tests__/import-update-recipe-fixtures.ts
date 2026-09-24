import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportContentService } from '../services/import/import-content-service';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportDraftService } from '../services/import/import-draft-service';
import type {
  ImportContentRef,
  ImportDraftChapter,
  ImportExtractionRules,
  ImportResource,
  ImportSource,
} from '../models/import';

export const recipeParser = new ImportParsingClient(() => undefined);
export const SITE = 'https://example.com';
export const CATALOG = `${SITE}/book`;

export const chapterPage = (n: number, lines: string[]) =>
  `<html><body><article><h1>第${n}话</h1>${lines.map((line) => `<p>${line}</p>`).join('')}</article></body></html>`;
export const catalogPage = (numbers: number[], next?: string) =>
  `<html><head><title>作品</title></head><body><nav class="toc">${numbers
    .map((n) => `<a href="/book/${n}">第${n}话</a>`)
    .join('')}</nav>${next ? `<a rel="next" href="${next}">次へ</a>` : ''}</body></html>`;

/** 为任务登记网址来源并保存快照，不发起网络请求。 */
export async function addPage(taskId: string, url: string, html: string): Promise<ImportSource> {
  const source = await ImportSourceService.registerUrl(taskId, url);
  const snapshot = await ImportContentService.prepareSnapshot(source, new Blob([html]), {
    text: html,
    responseUrl: url,
  });
  const updated = { ...source, currentSnapshotId: snapshot.id };
  await ImportRepository.saveStep(taskId, { resources: [snapshot], sources: [updated] });
  return updated;
}

export async function extractPage(
  taskId: string,
  sourceId: string,
  rules: ImportExtractionRules = { selector: 'article' },
): Promise<Extract<ImportResource, { kind: 'extraction' }>> {
  const prepared = await new ImportExtractionService(recipeParser).prepareExtraction(taskId, [
    { sourceId, rules },
  ]);
  await ImportRepository.saveStep(taskId, prepared);
  const id = prepared.results[0]!.contentId!;
  return prepared.resources.find(
    (resource): resource is Extract<ImportResource, { kind: 'extraction' }> =>
      resource.id === id && resource.kind === 'extraction',
  )!;
}

export interface WebChapter {
  n: number;
  lines?: string[];
  selected?: boolean;
  /** 自定义正文引用（默认整份提取结果）。 */
  content?:
    | ((resource: Extract<ImportResource, { kind: 'extraction' }>) => ImportContentRef[])
    | undefined;
  /** 章节来源网址（默认 /book/n）。 */
  url?: string;
  title?: string;
  rules?: ImportExtractionRules;
}

/** 目录 + 章节全部来自快照的网页导入任务；返回任务与各章节草稿。 */
export async function webTask(
  chapters: WebChapter[],
  options: { catalog?: string; extraPages?: Record<string, string> } = {},
) {
  const task = await ImportRepository.createTask();
  const catalog = await addPage(
    task.id,
    CATALOG,
    options.catalog ?? catalogPage(chapters.map((chapter) => chapter.n)),
  );
  const sources: ImportSource[] = [catalog];
  for (const [url, html] of Object.entries(options.extraPages ?? {}))
    sources.push(await addPage(task.id, url, html));
  const drafts: ImportDraftChapter[] = [];
  const pages = new Map<string, ImportSource>();
  for (const chapter of chapters) {
    const url = chapter.url ?? `${SITE}/book/${chapter.n}`;
    let source = pages.get(url);
    if (!source) {
      source = await addPage(
        task.id,
        url,
        chapterPage(chapter.n, chapter.lines ?? [`本文${chapter.n}`]),
      );
      pages.set(url, source);
      sources.push(source);
    }
    const resource = await extractPage(task.id, source.id, chapter.rules);
    drafts.push({
      id: `c${chapter.n}${chapter.title ? `-${drafts.length}` : ''}`,
      volumeId: 'v',
      title: chapter.title ?? `第${chapter.n}话`,
      inferredTitle: true,
      inferredStructure: true,
      selected: chapter.selected ?? true,
      content: chapter.content?.(resource) ?? [{ kind: 'extraction', resourceId: resource.id }],
      sourceIds: [source.id],
      status: 'ready',
    });
  }
  const draft = await ImportDraftService.edit(task.id, {
    baseDraftRevision: 0,
    operations: [
      {
        op: 'declare_candidates',
        candidates: [{ id: 'n', title: '作品', sourceIds: sources.map((source) => source.id) }],
      },
      { op: 'upsert_volume', id: 'v', title: '正文' },
      ...drafts.map((chapter) => ({ op: 'upsert_chapter' as const, chapter })),
    ],
  });
  return { taskId: task.id, catalog, sources, drafts, revision: draft.revision };
}
