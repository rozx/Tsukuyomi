import { BookService } from '../services/book-service';
import { getDB } from '../utils/indexed-db';
import { book } from './import-fixtures';
import { describe, expect, it } from 'vitest';
import './setup';
import { draft } from './import-fixtures';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportPreviewService } from '../services/import/import-preview-service';
import { ImportPlanService } from '../services/import/import-plan-service';
import { ImportContentService } from '../services/import/import-content-service';

// 正文只记录排除位置；相同引用的预览、方案和读取必须一致。
describe('草稿正文排除范围', () => {
  it('删除句中广告不会多出换行，原始资源不变，正文预览和导入方案一致', async () => {
    const { taskId, chapter, ref } = await draft('甲【广告】乙😀\n后文');
    if (ref.kind !== 'extraction') throw new Error('fixture');
    const changed = { ...ref, excludeRanges: [{ start: 1, end: 5 }] };
    await ImportDraftService.edit(taskId, {
      baseDraftRevision: 1,
      operations: [{ op: 'upsert_chapter', chapter: { ...chapter, content: [changed] } }],
    });
    expect(await ImportContentService.resolve(taskId, changed)).toBe('甲乙😀\n后文');
    expect(
      (await ImportPreviewService.chapter(taskId, chapter.id)).paragraphs.map((p) => p.text),
    ).toEqual(['甲乙😀', '后文']);
    const plan = await ImportPlanService.preview(taskId, 2);
    expect(JSON.stringify(plan)).toContain('甲乙😀');
    expect(await ImportContentService.resolve(taskId, ref)).toBe('甲【广告】乙😀\n后文');
    await expect(
      ImportDraftService.edit(taskId, {
        baseDraftRevision: 2,
        operations: [
          {
            op: 'upsert_chapter',
            chapter: { ...chapter, content: [{ ...ref, excludeRanges: [{ start: 6, end: 7 }] }] },
          },
        ],
      }),
    ).rejects.toThrow('INVALID_RANGE');
    expect((await ImportRepository.getTask(taskId))?.draft.revision).toBe(2);
  });
  it('整段既有正文被排除后不留下空段，后续引用仍必须逐个校验', async () => {
    await BookService.saveBook(book());
    const version = (await (await getDB()).get('book-revisions', 'book'))!.revision;
    const input = await draft('来源');
    const content = ['p1', 'p2', 'p3'].map((paragraphId) => ({
      kind: 'existing' as const,
      bookId: 'book',
      bookRevision: version,
      chapterId: 'old-c',
      paragraphId,
      ...(paragraphId === 'p2' ? { excludeRanges: [{ start: 0, end: 2 }] } : {}),
    }));
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 1,
        operations: [
          { op: 'propose_target', bookId: 'book' },
          { op: 'upsert_chapter', chapter: { ...input.chapter, content } },
        ],
      },
      { actor: 'user' },
    );
    expect(
      (await ImportPreviewService.chapter(input.taskId, input.chapter.id)).paragraphs.map(
        (p) => p.text,
      ),
    ).toEqual(['原文甲', '原文乙']);
    await expect(
      ImportDraftService.edit(input.taskId, {
        baseDraftRevision: 2,
        operations: [
          {
            op: 'upsert_chapter',
            chapter: {
              ...input.chapter,
              content: [content[0]!, { ...content[1]!, excludeRanges: [{ start: 0, end: 100 }] }],
            },
          },
        ],
      }),
    ).rejects.toThrow('INVALID_RANGE');
  });
});
