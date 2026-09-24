import { describe, expect, it } from 'vitest';
import './setup';
import { ImportPreviewService } from '../services/import/import-preview-service';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportRepository } from '../services/import/import-repository';
import { BookService } from '../services/book-service';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import { book, draft } from './import-fixtures';
import { ImportSourceService } from '../services/import/import-source-service';
import { getDB } from '../utils/indexed-db';
import { File } from 'node:buffer';

describe('草稿章节预览', () => {
  it('按引用展示实际提取的正文，并关联原始来源与排除记录', async () => {
    const input = await draft('第一段\n第二段');
    const preview = await ImportPreviewService.chapter(input.taskId, 'draft-c');
    expect(preview.status).toBe('ready');
    expect(preview.paragraphs.map((paragraph) => paragraph.text)).toEqual(['第一段', '第二段']);
    expect(preview.paragraphs[0]).toMatchObject({ kind: 'extraction', sourceId: input.source.id });
    expect(preview.sources.map((source) => source.name)).toEqual(['novel.txt']);
    expect(preview.excluded).toEqual([]);
  });

  it('未取得正文的章节显示缺失状态，不显示伪造的正文', async () => {
    const input = await draft('正文');
    await ImportDraftService.edit(input.taskId, {
      baseDraftRevision: 1,
      operations: [
        {
          op: 'upsert_chapter',
          chapter: { ...input.chapter, id: 'gap', title: '缺章', content: [], status: 'missing' },
        },
      ],
    });
    const preview = await ImportPreviewService.chapter(input.taskId, 'gap');
    expect(preview.status).toBe('missing');
    expect(preview.paragraphs).toEqual([]);
  });

  it('既有段落引用读取当前目标小说的原文', async () => {
    await BookService.saveBook(book());
    const input = await draft('新正文');
    await ImportDraftService.edit(
      input.taskId,
      { baseDraftRevision: 1, operations: [{ op: 'propose_target', bookId: 'book' }] },
      { actor: 'user' },
    );
    const task = (await ImportRepository.getTask(input.taskId))!;
    const snapshot = await ImportLibraryReader.readBook('book');
    if (snapshot.kind !== 'loaded') throw new Error('missing');
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: task.draft.revision,
        operations: [
          {
            op: 'upsert_chapter',
            chapter: {
              ...input.chapter,
              content: [
                {
                  kind: 'existing',
                  bookId: 'book',
                  bookRevision: snapshot.revision,
                  chapterId: 'old-c',
                  paragraphId: 'p2',
                },
              ],
            },
          },
        ],
      },
      { actor: 'user' },
    );
    const preview = await ImportPreviewService.chapter(input.taskId, 'draft-c');
    expect(preview.paragraphs).toEqual([
      expect.objectContaining({ kind: 'existing', text: '锚点' }),
    ]);
  });

  it('不存在的章节返回明确错误', async () => {
    const input = await draft('正文');
    await expect(ImportPreviewService.chapter(input.taskId, 'nope')).rejects.toThrow(
      'CHAPTER_NOT_FOUND',
    );
  });
});

describe('来源内容查看', () => {
  it('分页读取已保存的快照，续读时返回后续片段', async () => {
    const input = await draft('甲'.repeat(10));
    const page = await ImportPreviewService.source(input.taskId, input.source.id, {
      limit: 4,
    });
    expect(page).toMatchObject({ kind: 'text', text: '甲甲甲甲', nextOffset: 4 });
    const next = await ImportPreviewService.source(input.taskId, input.source.id, {
      offset: 8,
      limit: 4,
    });
    expect(next).toEqual({ kind: 'text', text: '甲甲' });
  });

  it('尚未读取或读取失败的来源只说明原因，不触发抓取', async () => {
    const task = await ImportRepository.createTask();
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File(['正文'], 'a.txt'),
    ]);
    expect(await ImportPreviewService.source(task.id, source!.id)).toMatchObject({
      kind: 'note',
      note: expect.stringContaining('尚未读取'),
    });
    const db = await getDB();
    await db.put('import-sources', {
      ...source!,
      status: 'failed',
      error: { code: 'FETCH_FAILED', message: 'FETCH_FAILED: 需要登录' },
    });
    expect(await ImportPreviewService.source(task.id, source!.id)).toEqual({
      kind: 'note',
      note: 'FETCH_FAILED: 需要登录',
    });
  });
});
