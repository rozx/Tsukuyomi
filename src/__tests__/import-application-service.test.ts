import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ImportApplicationService } from '../services/import/import-application-service';
import { ImportPlanService } from '../services/import/import-plan-service';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import { BookService } from '../services/book-service';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { getDB } from '../utils/indexed-db';
import { peekCacheEntry } from '../utils/chapter-content-loader';
import { book, draft } from './import-fixtures';
import * as maintenance from '../services/chapter-content-maintenance';
import { deferred, webLocksFixture } from './web-locks-fixture';

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function updatePlan(original = book()) {
  await BookService.saveBook(original);
  const input = await draft('修订甲\n锚点\n修订乙');
  await ImportDraftService.edit(
    input.taskId,
    {
      baseDraftRevision: 1,
      operations: [
        { op: 'propose_target', bookId: 'book' },
        { op: 'propose_match', chapterId: 'draft-c', targetChapterIds: ['old-c'] },
      ],
    },
    { actor: 'user' },
  );
  return ImportPlanService.preview(input.taskId, 2);
}

describe('用户确认后的原子应用与撤销', () => {
  it('预览之后新增的其他小说占用了章节 ID 时，不写入共享正文', async () => {
    const input = await draft('新正文');
    const plan = await ImportPlanService.preview(input.taskId, 1);
    const other = book();
    other.id = 'other';
    other.volumes = [
      {
        id: 'v',
        title: '卷',
        chapters: [
          {
            id: plan.chapters[0]!.chapterId,
            title: '其他小说的章节',
            createdAt: new Date(),
            lastEdited: new Date(),
          },
        ],
      },
    ];
    await BookService.saveBook(other);
    const service = new ImportApplicationService();
    await expect(service.apply(await service.confirmApply(input.taskId, plan.id))).rejects.toThrow(
      'PLAN_STALE',
    );
    expect(await (await getDB()).count('books')).toBe(1);
    expect(await (await getDB()).count('chapter-contents')).toBe(0);
  });
  it('合章应用删除被替代记录，撤销恢复原卷章及所有译文', async () => {
    await BookService.saveBook(book());
    const before = await ImportLibraryReader.readBook('book');
    const input = await draft('原文甲\n锚点\n原文乙\n不能删除');
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 1,
        operations: [
          { op: 'propose_target', bookId: 'book' },
          { op: 'propose_match', chapterId: 'draft-c', targetChapterIds: ['old-c', 'missing-c'] },
        ],
      },
      { actor: 'user' },
    );
    const plan = await ImportPlanService.preview(input.taskId, 2);
    expect(plan.conflicts).toEqual([]);
    const service = new ImportApplicationService();
    await service.apply(await service.confirmApply(input.taskId, plan.id));
    expect(await (await getDB()).get('chapter-contents', 'missing-c')).toBeUndefined();
    const token = await service.confirmRevert(input.taskId, plan.id);
    await service.revert(token);
    await service.revert(token);
    const restored = await ImportLibraryReader.readBook('book');
    if (before.kind !== 'loaded' || restored.kind !== 'loaded') throw new Error('missing');
    expect(restored.chapters).toEqual(before.chapters);
    expect(restored.book.volumes).toEqual(before.book.volumes);
  });

  it('草稿在确认后修改时旧方案拒绝应用，已经缺失的目标也不能复活', async () => {
    const plan = await updatePlan();
    const service = new ImportApplicationService();
    const token = await service.confirmApply(plan.taskId, plan.id);
    await ImportDraftService.edit(
      plan.taskId,
      {
        baseDraftRevision: plan.draftRevision,
        operations: [{ op: 'set_metadata', field: 'title', value: '用户新编辑' }],
      },
      { actor: 'user' },
    );
    await expect(service.apply(token)).rejects.toThrow('PLAN_STALE');
    const task = (await ImportRepository.getTask(plan.taskId))!;
    const fresh = await ImportPlanService.preview(task.id, task.draft.revision);
    const newToken = await service.confirmApply(task.id, fresh.id);
    await BookService.deleteBook('book');
    await expect(service.apply(newToken)).rejects.toThrow('BOOK_READ_FAILED');
    expect(await (await getDB()).count('books')).toBe(0);
  });

  it('部分导入后在同任务补齐不会重复章节或再次清空未变译文', async () => {
    const input = await draft('前半\n后半');
    const resource = await ImportRepository.getResource(
      input.taskId,
      input.ref.kind === 'extraction' ? input.ref.resourceId : '',
    );
    if (resource?.kind !== 'extraction') throw new Error('missing');
    const first = {
      kind: 'extraction' as const,
      resourceId: resource.id,
      blockId: resource.blocks[0]!.id,
      start: 0,
      end: 2,
    };
    const second = {
      kind: 'extraction' as const,
      resourceId: resource.id,
      blockId: resource.blocks[1]!.id,
    };
    await ImportDraftService.edit(input.taskId, {
      baseDraftRevision: 1,
      operations: [
        { op: 'upsert_chapter', chapter: { ...input.chapter, content: [first] } },
        {
          op: 'upsert_chapter',
          chapter: { ...input.chapter, id: 'later', title: '后半', content: [], status: 'missing' },
        },
      ],
    });
    const firstPlan = await ImportPlanService.preview(input.taskId, 2);
    const service = new ImportApplicationService();
    await service.apply(await service.confirmApply(input.taskId, firstPlan.id));
    const appliedTask = (await ImportRepository.getTask(input.taskId))!;
    const changed = await ImportDraftService.edit(input.taskId, {
      baseDraftRevision: appliedTask.draft.revision,
      operations: [
        {
          op: 'upsert_chapter',
          chapter: {
            ...input.chapter,
            id: 'later',
            title: '后半',
            content: [second],
            status: 'ready',
          },
        },
      ],
    });
    const nextPlan = await ImportPlanService.preview(input.taskId, changed.revision);
    expect(nextPlan.conflicts).toEqual([]);
    expect(nextPlan.summary?.clearedVersions).toBe(0);
    expect(nextPlan.mappings[0]?.chapterId).toBe(firstPlan.mappings[0]?.chapterId);
    await service.apply(await service.confirmApply(input.taskId, nextPlan.id));
    expect(await (await getDB()).count('books')).toBe(1);
    expect(await (await getDB()).count('chapter-contents')).toBe(2);
    await expect(
      service.revert(await service.confirmRevert(input.taskId, firstPlan.id)),
    ).rejects.toThrow('BOOK_CHANGED');
  });

  it('模型凭据不进入操作快照，应用与撤销均保留书籍原配置', async () => {
    const original = book();
    const config = { assistant: { id: 'm', apiKey: 'test-only-private-key' } };
    original.defaultAIModel = config as never;
    const plan = await updatePlan(original);
    const service = new ImportApplicationService();
    const result = await service.apply(await service.confirmApply(plan.taskId, plan.id));
    expect(JSON.stringify(result)).not.toContain('test-only-private-key');
    expect((await BookService.getBookById('book'))?.defaultAIModel).toEqual(config);
    await service.revert(await service.confirmRevert(plan.taskId, plan.id));
    expect((await BookService.getBookById('book'))?.defaultAIModel).toEqual(config);
  });

  it('派生维护失败保留已提交结果，恢复只补维护且不再次写书库', async () => {
    const plan = await updatePlan();
    const service = new ImportApplicationService();
    const maintain = vi
      .spyOn(maintenance, 'maintainChapterContent')
      .mockRejectedValue(new Error('index unavailable'));
    const applied = await service.apply(await service.confirmApply(plan.taskId, plan.id));
    expect(applied.state).toBe('applied');
    expect(applied.pendingMaintenance).toEqual(['library']);
    const before = await ImportLibraryReader.readBook('book');
    maintain.mockRestore();
    const recovered = await service.recover(plan.taskId, plan.id);
    expect(recovered.pendingMaintenance).toEqual([]);
    expect(await ImportLibraryReader.readBook('book')).toEqual(before);
  });

  it('只接受当前宿主签发的确认，新建重复请求幂等，撤销定向删除并登记墓碑', async () => {
    const input = await draft('第一段\n第二段');
    const plan = await ImportPlanService.preview(input.taskId, 1);
    const service = new ImportApplicationService();
    await expect(service.apply({ taskId: input.taskId, planId: plan.id } as never)).rejects.toThrow(
      'CONFIRMATION_REQUIRED',
    );
    const confirmation = await service.confirmApply(input.taskId, plan.id);
    await expect(new ImportApplicationService().apply(confirmation)).rejects.toThrow(
      'CONFIRMATION_REQUIRED',
    );
    const applied = await service.apply(confirmation);
    expect(applied.state).toBe('applied');
    expect((await service.apply(confirmation)).postApplyBookRevision).toBe(
      applied.postApplyBookRevision,
    );
    const db = await getDB();
    expect(await db.count('books')).toBe(1);
    expect(await db.count('chapter-contents')).toBe(1);
    expect((await ImportRepository.getTask(input.taskId))?.draft.target).toMatchObject({
      kind: 'existing',
      bookId: plan.targetBookId,
    });
    const reverted = await service.revert(await service.confirmRevert(input.taskId, plan.id));
    expect(reverted.state).toBe('reverted');
    expect(await db.count('books')).toBe(0);
    expect(await db.count('chapter-contents')).toBe(0);
    expect((await db.getAll('sync-configs'))[0]?.deletedNovelIds).toContainEqual(
      expect.objectContaining({ id: plan.targetBookId }),
    );
    expect(await db.get('import-tasks', input.taskId)).toBeDefined();
  });

  it('更新清空实际修订译文，撤销恢复结构、全部译文和选用；纯查看不阻止撤销', async () => {
    const plan = await updatePlan();
    const before = await ImportLibraryReader.readBook('book');
    const service = new ImportApplicationService();
    await service.apply(await service.confirmApply(plan.taskId, plan.id));
    const applied = await ImportLibraryReader.readBook('book');
    expect(applied.kind).toBe('loaded');
    if (applied.kind !== 'loaded' || before.kind !== 'loaded') throw new Error('missing');
    expect(applied.chapters['old-c']).toMatchObject({
      kind: 'loaded',
      content: [
        { text: '修订甲', translations: [], selectedTranslationId: '' },
        { id: 'p2', text: '锚点', selectedTranslationId: 'p2-t0' },
        { text: '修订乙', translations: [], selectedTranslationId: '' },
      ],
    });
    expect(applied.chapters['missing-c']).toEqual(before.chapters['missing-c']);
    await service.revert(await service.confirmRevert(plan.taskId, plan.id));
    const after = await ImportLibraryReader.readBook('book');
    if (after.kind !== 'loaded') throw new Error('missing');
    expect(after.chapters).toEqual(before.chapters);
    expect(after.book.volumes).toEqual(before.book.volumes);
    expect(after.revision).toBeGreaterThan(applied.revision);
    expect(new Date(after.book.lastEdited).getTime()).toBeGreaterThan(
      new Date(before.book.lastEdited).getTime(),
    );
  });

  it('过时草稿、目标后续修改和恢复后的旧确认不能授权覆盖', async () => {
    const plan = await updatePlan();
    const service = new ImportApplicationService();
    const token = await service.confirmApply(plan.taskId, plan.id);
    await BookService.saveBook({ ...book(), author: '后续编辑' });
    await expect(service.apply(token)).rejects.toThrow('PLAN_STALE');
    const fresh = await ImportPlanService.preview(plan.taskId, plan.draftRevision);
    await service.apply(await service.confirmApply(plan.taskId, fresh.id));
    const undo = await service.confirmRevert(plan.taskId, fresh.id);
    const current = await BookService.getBookById('book');
    await BookService.saveBook({ ...current!, author: '新译文之外的后续修改' });
    await expect(service.revert(undo)).rejects.toThrow('BOOK_CHANGED');
    expect((await BookService.getBookById('book'))?.author).toBe('新译文之外的后续修改');
  });

  it('持有执行占用及取消后尚未完成的保存都阻止应用，结束后可重试', async () => {
    const plan = await updatePlan();
    const service = new ImportApplicationService();
    const token = await service.confirmApply(plan.taskId, plan.id);
    const started = deferred();
    const saving = deferred();
    const writing = BookExecutionGuard.write('book', { label: '已取消，正在保存' }, async () => {
      started.resolve();
      await saving.promise;
    });
    await started.promise;
    await expect(service.apply(token)).rejects.toThrow('TARGET_BUSY');
    expect((await (await getDB()).get('import-operations', plan.id))?.state).toBe('planned');
    saving.resolve();
    await writing;
    await expect(service.apply(token)).resolves.toMatchObject({ state: 'applied' });
  });

  it.each([1, 2])(
    '操作记录第 %d 次保存失败时回滚正文、结构、修改序号和任务状态',
    async (failAt) => {
      const plan = await updatePlan();
      const db = await getDB();
      const before = await ImportLibraryReader.readBook('book');
      // eslint-disable-next-line @typescript-eslint/unbound-method -- 故障注入通过 apply 保留原生 this。
      const put = IDBObjectStore.prototype.put;
      let operationWrites = 0;
      const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<typeof put>
      ) {
        if (this.name === 'import-operations' && ++operationWrites === failAt)
          throw new DOMException('存储配额不足', 'QuotaExceededError');
        return put.apply(this, args);
      });
      const service = new ImportApplicationService();
      await expect(service.apply(await service.confirmApply(plan.taskId, plan.id))).rejects.toThrow(
        '存储配额不足',
      );
      failure.mockRestore();
      expect(await ImportLibraryReader.readBook('book')).toEqual(before);
      expect((await db.get('import-operations', plan.id))?.before).toBeUndefined();
      expect((await db.get('import-tasks', plan.taskId))?.state).toBe('ready');
    },
  );

  it('预览后出现损坏正文不能快照为空；合法内嵌正文撤销后仍保持物理缺席', async () => {
    const plan = await updatePlan();
    const db = await getDB();
    const record = (await db.get('chapter-contents', 'old-c'))!;
    await db.put('chapter-contents', { ...record, content: '{broken' });
    const service = new ImportApplicationService();
    await expect(service.apply(await service.confirmApply(plan.taskId, plan.id))).rejects.toThrow(
      'BOOK_READ_FAILED',
    );
    await db.put('books', book());
    await db.delete('chapter-contents', 'old-c');
    const fresh = await ImportPlanService.preview(plan.taskId, plan.draftRevision);
    await service.apply(await service.confirmApply(plan.taskId, fresh.id));
    await service.revert(await service.confirmRevert(plan.taskId, fresh.id));
    expect(await db.get('chapter-contents', 'old-c')).toBeUndefined();
    expect((await db.get('books', 'book'))?.volumes?.[0]?.chapters?.[0]?.content).toEqual(
      book().volumes![0]!.chapters![0]!.content,
    );
    expect(peekCacheEntry('old-c')?.parsed).toEqual(book().volumes![0]!.chapters![0]!.content);
  });
});
