import { excludeImportText } from './import-content-exclusions';
import type { ImportContentRef, ImportDraftChapter, ImportSource } from 'src/models/import';
import { ImportRepository } from './import-repository';
import { ImportLibraryReader } from './import-library-reader';
import { resolveImportText } from './import-content-references';
import { ImportContentService } from './import-content-service';

export interface ImportPreviewParagraph {
  text: string;
  kind: 'extraction' | 'existing';
  sourceId?: string;
  resourceId?: string;
}

export interface ImportChapterPreview {
  chapterId: string;
  title: string;
  status: ImportDraftChapter['status'];
  paragraphs: ImportPreviewParagraph[];
  /** 引用到的原始来源（用于在来源列表中定位）。 */
  sources: ImportSource[];
  /** 这些提取结果在提取时排除的内容，供用户核对清理是否正确。 */
  excluded: { resourceId: string; text: string; reason: string }[];
  /** 读取失败的引用，界面显示失败而不是空正文。 */
  failures: string[];
}

type ExistingRef = Extract<ImportContentRef, { kind: 'existing' }>;
type BookRead = Awaited<ReturnType<typeof ImportLibraryReader.readBook>>;

async function existingText(ref: ExistingRef, books: Map<string, Promise<BookRead>>) {
  if (!books.has(ref.bookId)) books.set(ref.bookId, ImportLibraryReader.readBook(ref.bookId));
  const read = await books.get(ref.bookId)!;
  if (read.kind !== 'loaded') throw new Error('BOOK_READ_FAILED: 目标小说读取失败');
  if (read.revision !== ref.bookRevision) throw new Error('BOOK_CHANGED: 既有正文引用已过时');
  const chapter = read.chapters[ref.chapterId];
  if (chapter?.kind !== 'loaded') throw new Error('CHAPTER_READ_FAILED: 原章节读取失败');
  const paragraph = chapter.content.find((entry) => entry.id === ref.paragraphId);
  if (!paragraph) throw new Error('PARAGRAPH_NOT_FOUND: 原段落不存在');
  return excludeImportText(paragraph.text, ref.excludeRanges);
}

export type ImportSourcePage =
  | { kind: 'text'; text: string; nextOffset?: number }
  | { kind: 'note'; note: string };

/** 只读：把草稿章节的内容引用还原成可检查的正文，不修改任务或书库。 */
export class ImportPreviewService {
  /** 分页读取来源已保存的内容；尚未读取或失败时只说明原因，不触发新的抓取或解析。 */
  static async source(
    taskId: string,
    sourceId: string,
    options: { offset?: number; limit?: number } = {},
  ): Promise<ImportSourcePage> {
    const source = await ImportRepository.getSource(taskId, sourceId);
    if (!source.currentSnapshotId) {
      if (source.status === 'failed')
        return { kind: 'note', note: source.error?.message ?? '读取失败' };
      return { kind: 'note', note: '尚未读取：月詠检查或提取该来源后才会保存内容。' };
    }
    const page = await ImportContentService.read(taskId, source.currentSnapshotId, {
      offset: options.offset ?? 0,
      limit: options.limit ?? 8000,
    });
    return {
      kind: 'text',
      text: page.text,
      ...(page.nextOffset !== undefined ? { nextOffset: page.nextOffset } : {}),
    };
  }

  static async chapter(taskId: string, chapterId: string): Promise<ImportChapterPreview> {
    const task = await ImportRepository.getTask(taskId);
    const chapter = task?.draft.chapters.find((entry) => entry.id === chapterId);
    if (!chapter) throw new Error('CHAPTER_NOT_FOUND: 草稿章节不存在');
    const preview: ImportChapterPreview = {
      chapterId,
      title: chapter.title,
      status: chapter.status,
      paragraphs: [],
      sources: [],
      excluded: [],
      failures: [],
    };
    const sourceIds = new Set<string>(chapter.sourceIds);
    const excludedFrom = new Set<string>();
    const books = new Map<string, Promise<BookRead>>();
    for (const ref of chapter.content) {
      try {
        if (ref.kind === 'existing') {
          const text = await existingText(ref, books);
          if (text || !ref.excludeRanges?.length)
            preview.paragraphs.push({ kind: 'existing', text });
          continue;
        }
        const resource = await ImportRepository.getResource(taskId, ref.resourceId);
        if (resource?.kind !== 'extraction') throw new Error('INVALID_CONTENT_REF: 提取结果不存在');
        sourceIds.add(resource.sourceId);
        // 与方案生成一致：拼接引用范围后按行拆成段落
        const lines = resolveImportText(resource, ref).replace(/\r\n?/g, '\n').split('\n');
        if (lines.at(-1) === '') lines.pop();
        for (const text of lines)
          preview.paragraphs.push({
            kind: 'extraction',
            text,
            sourceId: resource.sourceId,
            resourceId: resource.id,
          });
        if (!excludedFrom.has(resource.id)) {
          excludedFrom.add(resource.id);
          preview.excluded.push(
            ...resource.excluded.map(({ text, reason }) => ({
              resourceId: resource.id,
              text,
              reason,
            })),
          );
        }
      } catch (error) {
        preview.failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    for (const id of sourceIds) {
      try {
        preview.sources.push(await ImportRepository.getSource(taskId, id));
      } catch {
        /* 来源已不属于任务时只省略关联 */
      }
    }
    return preview;
  }
}
