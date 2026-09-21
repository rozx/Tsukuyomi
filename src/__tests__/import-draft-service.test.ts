import { afterEach, describe, it, mock } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportContentService } from '../services/import/import-content-service';
import { BookService } from '../services/book-service';
import type { ImportDraftEdit, ImportContentRef } from '../models/import';

afterEach(() => mock.restore());

async function fixture(text = '第一段\n第二段\n第三段') {
  const task = await ImportRepository.createTask();
  const [source] = await ImportSourceService.registerFiles(task.id, [
    new File([text], 'novel.txt'),
  ]);
  const parsing = new ImportExtractionService(new ImportParsingClient(() => undefined));
  const extracted = await parsing.prepareExtraction(task.id, [{ sourceId: source!.id }]);
  await ImportRepository.saveStep(task.id, extracted);
  const resourceId = extracted.results[0]!.contentId!;
  const resource = await ImportRepository.getResource(task.id, resourceId);
  if (resource?.kind !== 'extraction') throw new Error('missing extraction');
  const ref: ImportContentRef = { kind: 'extraction', resourceId };
  return { task, source: source!, resource, ref };
}

describe('草稿共同编辑与原文授权', () => {
  it('章节和卷标题不能用超长自由文本代替正文引用', async () => {
    const { task, source, ref } = await fixture();
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 0,
        operations: [{ op: 'upsert_volume', id: 'v', title: '字'.repeat(501) }],
      }),
    ).rejects.toThrow('METADATA_LIMIT');
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 0,
        operations: [
          {
            op: 'declare_candidates',
            candidates: [{ id: 'n', title: '书', sourceIds: [source.id] }],
          },
          { op: 'upsert_volume', id: 'v', title: '卷' },
          {
            op: 'upsert_chapter',
            chapter: {
              id: 'c',
              volumeId: 'v',
              title: '字'.repeat(501),
              content: [ref],
              sourceIds: [],
              selected: true,
              status: 'ready',
              inferredTitle: true,
              inferredStructure: true,
            },
          },
        ],
      }),
    ).rejects.toThrow('METADATA_LIMIT');
    expect((await ImportRepository.getTask(task.id))!.draft.revision).toBe(0);
  });
  it('整本范围授权不对每一段重新展开整本内容', async () => {
    const { task, source, ref } = await fixture('正文\n'.repeat(10000));
    const started = performance.now();
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        {
          op: 'declare_candidates',
          candidates: [{ id: 'n', title: '书', sourceIds: [source.id], content: [ref] }],
        },
        { op: 'upsert_volume', id: 'v', title: '卷' },
        {
          op: 'upsert_chapter',
          chapter: {
            id: 'c',
            volumeId: 'v',
            title: '章',
            content: [ref],
            sourceIds: [],
            status: 'ready',
            selected: true,
            inferredTitle: true,
            inferredStructure: true,
          },
        },
      ],
    });
    expect(performance.now() - started).toBeLessThan(1500);
  }, 20000);
  it('同一批可声明单本小说、创建卷章；正文只引用完整资源，不复制模型文字', async () => {
    const { task, source, ref } = await fixture();
    const draft = await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        {
          op: 'declare_candidates',
          candidates: [{ id: 'novel', title: '小说', sourceIds: [source.id] }],
        },
        { op: 'upsert_volume', id: 'v', title: '卷一' },
        {
          op: 'upsert_chapter',
          chapter: {
            id: 'c',
            volumeId: 'v',
            title: '拟定章名',
            content: [ref],
            sourceIds: [],
            status: 'ready',
            selected: true,
            inferredTitle: false,
            inferredStructure: false,
          },
        },
      ],
    });
    expect(draft.revision).toBe(1);
    expect(draft.chapters[0]?.content).toEqual([ref]);
    expect(draft.chapters[0]?.sourceIds).toEqual([source.id]);
    expect(draft.chapters[0]?.inferredTitle).toBe(true);
    expect(draft.chapters[0]?.inferredStructure).toBe(true);
    expect(await ImportContentService.resolve(task.id, ref)).toBe('第一段\n第二段\n第三段');
  });

  it('手动与 Agent 使用同一版本，旧操作失败，整批错误不留下半个卷', async () => {
    const { task } = await fixture();
    await ImportDraftService.edit(
      task.id,
      {
        baseDraftRevision: 0,
        operations: [{ op: 'set_metadata', field: 'title', value: '用户书名' }],
      },
      { actor: 'user' },
    );
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 0,
        operations: [{ op: 'set_metadata', field: 'title', value: '旧推断' }],
      }),
    ).rejects.toThrow('DRAFT_CHANGED');
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 1,
        operations: [
          { op: 'upsert_volume', id: 'temporary', title: '应回滚' },
          { op: 'reorder_chapters', chapterIds: ['missing'] },
        ],
      }),
    ).rejects.toThrow('INVALID_OPERATION');
    const current = (await ImportRepository.getTask(task.id))!.draft;
    expect(current.revision).toBe(1);
    expect(current.metadata.title?.value).toBe('用户书名');
    expect(current.volumes).toEqual([]);
  });

  it('拆分、合并、移动和排序仅改变原文引用，跨任务和无效范围不能混入', async () => {
    const { task, source, resource } = await fixture();
    const first = {
      kind: 'extraction' as const,
      resourceId: resource.id,
      blockId: resource.blocks[0]!.id,
    };
    const rest = {
      kind: 'extraction' as const,
      resourceId: resource.id,
      blockId: resource.blocks[1]!.id,
      endBlockId: resource.blocks[2]!.id,
    };
    const base = {
      volumeId: 'v',
      sourceIds: [],
      status: 'ready' as const,
      selected: true,
      inferredTitle: true,
      inferredStructure: true,
    };
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        {
          op: 'declare_candidates',
          candidates: [{ id: 'n', title: '书', sourceIds: [source.id] }],
        },
        { op: 'upsert_volume', id: 'v', title: '卷一' },
        { op: 'upsert_volume', id: 'v2', title: '卷二' },
        { op: 'upsert_chapter', chapter: { ...base, id: 'c1', title: '上', content: [first] } },
        { op: 'upsert_chapter', chapter: { ...base, id: 'c2', title: '下', content: [rest] } },
        { op: 'reorder_chapters', chapterIds: ['c2', 'c1'] },
      ],
    });
    const merged = await ImportDraftService.edit(task.id, {
      baseDraftRevision: 1,
      operations: [
        {
          op: 'upsert_chapter',
          chapter: { ...base, id: 'c1', title: '合并', volumeId: 'v2', content: [first, rest] },
        },
        { op: 'remove_chapter', chapterId: 'c2' },
        { op: 'reorder_volumes', volumeIds: ['v2', 'v'] },
      ],
    });
    expect(merged.chapters).toHaveLength(1);
    expect(merged.chapters[0]?.volumeId).toBe('v2');
    expect(await ImportContentService.resolve(task.id, rest)).toBe('第二段\n第三段');
    const other = await fixture();
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 2,
        operations: [
          {
            op: 'upsert_chapter',
            chapter: { ...base, id: 'c3', title: '错误', content: [other.ref] },
          },
        ],
      }),
    ).rejects.toThrow('SOURCE_SCOPE');
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 2,
        operations: [
          {
            op: 'upsert_chapter',
            chapter: { ...base, id: 'c3', title: '错误', content: [{ ...first, end: 999 }] },
          },
        ],
      }),
    ).rejects.toThrow('INVALID_RANGE');
  });

  it('不能用额外字段伪造宿主任务、用户确认或章节匹配证据', async () => {
    const { task } = await fixture();
    const forged = {
      baseDraftRevision: 0,
      taskId: 'other',
      operations: [],
    } as unknown as ImportDraftEdit;
    await expect(ImportDraftService.edit(task.id, forged)).rejects.toThrow('INVALID_OPERATION');
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 0,
        operations: [{ op: 'propose_target', bookId: 'book', basis: 'user' }],
      } as unknown as ImportDraftEdit),
    ).rejects.toThrow('INVALID_OPERATION');
    expect((await ImportRepository.getTask(task.id))!.draft.revision).toBe(0);
  });

  it('既有段落仅可引用当前明确目标的正确快照，其他候选和过时快照均拒绝', async () => {
    const { task, source } = await fixture();
    const date = new Date();
    for (const id of ['a', 'b'])
      await BookService.saveBook({
        id,
        title: id,
        createdAt: date,
        lastEdited: date,
        volumes: [
          {
            id: `${id}-v`,
            title: '卷',
            chapters: [
              {
                id: `${id}-c`,
                title: '章',
                createdAt: date,
                lastEdited: date,
                content: [{ id: 'p', text: id, translations: [], selectedTranslationId: '' }],
              },
            ],
          },
        ],
      });
    await ImportDraftService.edit(
      task.id,
      {
        baseDraftRevision: 0,
        operations: [
          {
            op: 'declare_candidates',
            candidates: [{ id: 'n', title: '书', sourceIds: [source.id] }],
          },
          { op: 'propose_target', bookId: 'a' },
          { op: 'upsert_volume', id: 'v', title: '卷' },
        ],
      },
      { actor: 'user' },
    );
    const chapter = {
      id: 'c',
      volumeId: 'v',
      title: '合章',
      content: [
        {
          kind: 'existing' as const,
          bookId: 'b',
          bookRevision: 1,
          chapterId: 'b-c',
          paragraphId: 'p',
        },
      ],
      sourceIds: [],
      selected: true,
      status: 'ready' as const,
      inferredTitle: false,
      inferredStructure: true,
    };
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 1,
        operations: [{ op: 'upsert_chapter', chapter }],
      }),
    ).rejects.toThrow('TARGET_SCOPE');
    chapter.content = [
      { kind: 'existing', bookId: 'a', bookRevision: 99, chapterId: 'a-c', paragraphId: 'p' },
    ];
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 1,
        operations: [{ op: 'upsert_chapter', chapter }],
      }),
    ).rejects.toThrow('BOOK_CHANGED');
  });
});
