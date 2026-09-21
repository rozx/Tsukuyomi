import { describe, it } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportPlanService } from '../services/import/import-plan-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportContentService } from '../services/import/import-content-service';
import { BookService } from '../services/book-service';
import { getDB } from '../utils/indexed-db';
import type { Novel, Paragraph } from '../models/novel';
import type { ImportContentRef, ImportDraftChapter } from '../models/import';

const date = new Date('2026-01-01T00:00:00Z');
function paragraph(id: string, text: string, count = 1): Paragraph {
  return {
    id,
    text,
    translations: Array.from({ length: count }, (_, i) => ({
      id: `${id}-t${i}`,
      translation: `译文${i}`,
      aiModelId: 'm',
    })),
    selectedTranslationId: count ? `${id}-t0` : '',
  };
}
function book(): Novel {
  return {
    id: 'book',
    title: '原书',
    author: '作者',
    createdAt: date,
    lastEdited: date,
    notes: [],
    translationInstructions: '必须保留的设置',
    volumes: [
      {
        id: 'old-v',
        title: '旧卷',
        chapters: [
          {
            id: 'old-c',
            title: '原章',
            createdAt: date,
            lastEdited: date,
            content: [
              paragraph('p1', '原文甲', 2),
              paragraph('p2', '锚点'),
              paragraph('p3', '原文乙', 3),
            ],
          },
          {
            id: 'missing-c',
            title: '来源缺席的旧章',
            createdAt: date,
            lastEdited: date,
            content: [paragraph('untouched', '不能删除')],
          },
        ],
      },
    ],
  };
}

async function draft(text: string) {
  const task = await ImportRepository.createTask();
  const [source] = await ImportSourceService.registerFiles(task.id, [
    new File([text], 'novel.txt'),
  ]);
  const parsed = await new ImportExtractionService(
    new ImportParsingClient(() => undefined),
  ).prepareExtraction(task.id, [{ sourceId: source!.id }]);
  await ImportRepository.saveStep(task.id, parsed);
  const ref: ImportContentRef = { kind: 'extraction', resourceId: parsed.results[0]!.contentId! };
  const chapter: ImportDraftChapter = {
    id: 'draft-c',
    title: '原章',
    volumeId: 'draft-v',
    content: [ref],
    sourceIds: [],
    selected: true,
    status: 'ready',
    inferredTitle: true,
    inferredStructure: true,
  };
  await ImportDraftService.edit(task.id, {
    baseDraftRevision: 0,
    operations: [
      {
        op: 'declare_candidates',
        candidates: [{ id: 'n', title: '小说', sourceIds: [source!.id] }],
      },
      { op: 'upsert_volume', id: 'draft-v', title: '卷一' },
      { op: 'upsert_chapter', chapter },
    ],
  });
  return { taskId: task.id, source: source!, chapter, ref };
}

describe('基于真实数据的导入方案', () => {
  it('只检查后续目录页时不能把局部章节数宣称为整本总数', async () => {
    const input = await draft('正文');
    const db = await getDB();
    const source = await db.get('import-sources', input.source.id);
    const url = 'https://ncode.syosetu.com/n1234ab/?p=2';
    const updated = { ...source!, url };
    await db.put('import-sources', updated);
    const html =
      '<h1>小说</h1><a class="c-pager__item--before" href="/n1234ab/">前へ</a><div class="l-container"><main><article><div class="p-eplist"><div class="p-eplist__sublist"><a class="p-eplist__subtitle" href="/n1234ab/101/">第101章</a></div></div></article></main></div>';
    const snapshot = await ImportContentService.prepareSnapshot(updated, new Blob([html]), {
      text: html,
      responseUrl: url,
    });
    await ImportRepository.saveStep(input.taskId, {
      resources: [snapshot],
      sources: [{ ...updated, currentSnapshotId: snapshot.id }],
    });
    const plan = await ImportPlanService.preview(input.taskId, 1);
    expect(plan.completeness.confirmed).toBe(false);
    expect(plan.completeness.knownTotal).toBeUndefined();
    expect(plan.completeness.missing).toContain('第101章');
  });

  it('调整卷顺序后，方案按草稿顺序保留原卷身份和正文', async () => {
    const original = book();
    const second = original.volumes![0]!.chapters!.pop()!;
    original.volumes!.push({ id: 'second-v', title: '第二卷', chapters: [second] });
    await BookService.saveBook(original);
    const version = (await (await getDB()).get('book-revisions', 'book'))!.revision;
    const input = await draft('原文甲\n锚点\n原文乙');
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 1,
        operations: [
          { op: 'propose_target', bookId: 'book' },
          { op: 'propose_match', chapterId: 'draft-c', targetChapterIds: ['old-c'] },
          { op: 'upsert_volume', id: 'draft-v2', title: '第二卷' },
          {
            op: 'upsert_chapter',
            chapter: {
              ...input.chapter,
              id: 'draft-c2',
              title: '来源缺席的旧章',
              volumeId: 'draft-v2',
              content: [
                {
                  kind: 'existing',
                  bookId: 'book',
                  bookRevision: version,
                  chapterId: 'missing-c',
                  paragraphId: 'untouched',
                },
              ],
            },
          },
          { op: 'propose_match', chapterId: 'draft-c2', targetChapterIds: ['missing-c'] },
          { op: 'reorder_volumes', volumeIds: ['draft-v2', 'draft-v'] },
        ],
      },
      { actor: 'user' },
    );
    const plan = await ImportPlanService.preview(input.taskId, 2);
    expect(plan.conflicts).toEqual([]);
    expect(plan.book.volumes?.map((volume) => volume.id)).toEqual(['second-v', 'old-v']);
    expect(plan.book.volumes?.map((volume) => volume.title)).toEqual(['第二卷', '卷一']);
    expect(plan.summary?.clearedVersions).toBe(0);
  });

  it('通过既有段落引用合章时能够选择设置，并保留来源章的未移动部分', async () => {
    const original = book();
    original.volumes![0]!.chapters![0]!.translationInstructions = '第一套指令';
    original.volumes![0]!.chapters![1]!.translationInstructions = '第二套指令';
    await BookService.saveBook(original);
    const revision = (await (await getDB()).get('book-revisions', 'book'))!.revision;
    const input = await draft('任意来源');
    const content: ImportContentRef[] = [
      ['old-c', 'p1'],
      ['missing-c', 'untouched'],
    ].map(([chapterId, paragraphId]) => ({
      kind: 'existing',
      bookId: 'book',
      bookRevision: revision,
      chapterId: chapterId!,
      paragraphId: paragraphId!,
    }));
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 1,
        operations: [
          { op: 'propose_target', bookId: 'book' },
          { op: 'upsert_chapter', chapter: { ...input.chapter, title: '合章', content } },
          { op: 'propose_match', chapterId: 'draft-c', targetChapterIds: [] },
        ],
      },
      { actor: 'user' },
    );
    const unresolved = await ImportPlanService.preview(input.taskId, 2);
    expect(unresolved.conflicts.some((entry) => entry.code === 'CHAPTER_SETTINGS_CONFLICT')).toBe(
      true,
    );
    const next = await ImportPlanService.chooseChapterSettings(
      input.taskId,
      unresolved.id,
      'draft-c',
      'missing-c',
    );
    const plan = await ImportPlanService.preview(input.taskId, next);
    expect(plan.conflicts).toEqual([]);
    expect(
      plan.chapters
        .find((chapter) => chapter.chapterId === 'old-c')
        ?.content.map((entry) => entry.id),
    ).toEqual(['p2', 'p3']);
    expect(plan.removedChapterIds).toEqual([]);
    expect(plan.summary?.clearedVersions).toBe(0);
    await expect(
      ImportPlanService.chooseChapterSettings(input.taskId, unresolved.id, 'draft-c', 'old-c'),
    ).rejects.toThrow('PLAN_STALE');
  });

  it('用户可以明确把同名章节作为新增，不会被标题自动覆盖', async () => {
    await BookService.saveBook(book());
    const input = await draft('完全新增的正文');
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 1,
        operations: [
          { op: 'propose_target', bookId: 'book' },
          { op: 'propose_match', chapterId: 'draft-c', targetChapterIds: [] },
        ],
      },
      { actor: 'user' },
    );
    const plan = await ImportPlanService.preview(input.taskId, 2);
    expect(plan.conflicts).toEqual([]);
    expect(plan.chapterChanges![0]?.kind).toBe('insert');
    expect(plan.chapterChanges![0]?.chapterId).not.toBe('old-c');
    expect(
      plan.book.volumes
        ?.flatMap((volume) => volume.chapters ?? [])
        .some((chapter) => chapter.id === 'old-c'),
    ).toBe(true);
  });

  it('合章遇到专属设置冲突时要求选择，正文移动仍保留全部译文', async () => {
    const original = book();
    original.volumes![0]!.chapters![0]!.translationInstructions = '第一套指令';
    original.volumes![0]!.chapters![1]!.translationInstructions = '第二套指令';
    await BookService.saveBook(original);
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
    const unresolved = await ImportPlanService.preview(input.taskId, 2);
    expect(
      unresolved.conflicts.some((conflict) => conflict.code === 'CHAPTER_SETTINGS_CONFLICT'),
    ).toBe(true);
    const revision = await ImportPlanService.chooseChapterSettings(
      input.taskId,
      unresolved.id,
      'draft-c',
      'missing-c',
    );
    const plan = await ImportPlanService.preview(input.taskId, revision);
    expect(plan.conflicts).toEqual([]);
    expect(plan.removedChapterIds).toEqual(['missing-c']);
    expect(plan.chapters[0]?.content.map((paragraph) => paragraph.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'untouched',
    ]);
    expect(plan.summary?.clearedVersions).toBe(0);
    expect(
      plan.book.volumes
        ?.flatMap((volume) => volume.chapters ?? [])
        .find((chapter) => chapter.id === 'old-c')?.translationInstructions,
    ).toBe('第二套指令');
  });

  for (const basis of ['user', 'url', 'receipt'] as const)
    it(`拆章不能因只选择一半就丢弃另一半旧内容（${basis}）`, async () => {
      const original = book();
      original.volumes![0]!.chapters![0]!.webUrl = 'https://example.test/novel/1';
      await BookService.saveBook(original);
      const input = await draft('原文甲\n锚点\n原文乙');
      if (basis === 'url') {
        const db = await getDB();
        const source = await db.get('import-sources', input.source.id);
        await db.put('import-sources', {
          ...source!,
          url: original.volumes![0]!.chapters![0]!.webUrl!,
        });
      }
      const resource = await ImportRepository.getResource(
        input.taskId,
        input.ref.kind === 'extraction' ? input.ref.resourceId : '',
      );
      if (resource?.kind !== 'extraction') throw new Error('missing');
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
      await ImportDraftService.edit(
        input.taskId,
        {
          baseDraftRevision: 1,
          operations: [
            { op: 'propose_target', bookId: 'book' },
            { op: 'upsert_chapter', chapter: { ...input.chapter, content: [first] } },
            ...(basis === 'user'
              ? [
                  {
                    op: 'propose_match' as const,
                    chapterId: 'draft-c',
                    targetChapterIds: ['old-c'],
                  },
                ]
              : []),
            {
              op: 'upsert_chapter',
              chapter: {
                ...input.chapter,
                id: 'part2',
                title: '后半',
                selected: false,
                content: [rest],
              },
            },
            ...(basis === 'user'
              ? [{ op: 'propose_match' as const, chapterId: 'part2', targetChapterIds: ['old-c'] }]
              : []),
          ],
        },
        { actor: 'user' },
      );
      if (basis === 'receipt')
        await ImportRepository.mutateTask(input.taskId, (task) => {
          task.appliedMappings = [
            {
              bookId: 'book',
              chapters: ['draft-c', 'part2'].map((draftChapterId) => ({
                draftChapterId,
                chapterId: 'old-c',
                sourceIds: [input.source.id],
              })),
            },
          ];
          return Promise.resolve();
        });
      const plan = await ImportPlanService.preview(input.taskId, 2);
      expect(plan.conflicts.some((conflict) => conflict.code === 'PARTIAL_RESTRUCTURE')).toBe(true);
      expect(plan.removedChapterIds).toEqual([]);
      expect(plan.chapters).toEqual([]);
    });
  it('新建先生成持久方案与稳定 ID，不写书库', async () => {
    const input = await draft('第一段\n第二段');
    const plan = await ImportPlanService.preview(input.taskId, 1);
    expect(plan.conflicts).toEqual([]);
    expect(plan.targetKind).toBe('new');
    expect(plan.chapters[0]?.content.map((p) => p.text)).toEqual(['第一段', '第二段']);
    expect((await ImportPlanService.get(plan.id))?.chapters[0]?.content[0]?.id).toBe(
      plan.chapters[0]?.content[0]?.id,
    );
    await expect((await getDB()).count('books')).resolves.toBe(0);
    expect((await ImportRepository.getTask(input.taskId))?.state).toBe('ready');
  });

  it('标题只提供候选；明确选择后才计算覆盖，并保留缺席旧章节及设置', async () => {
    const original = book();
    await BookService.saveBook(original);
    const input = await draft('修订甲\n锚点\n修订乙');
    await ImportDraftService.edit(
      input.taskId,
      { baseDraftRevision: 1, operations: [{ op: 'propose_target', bookId: 'book' }] },
      { actor: 'user' },
    );
    const ambiguous = await ImportPlanService.preview(input.taskId, 2);
    expect(ambiguous.conflicts.some((conflict) => conflict.code === 'CHAPTER_MATCH_REQUIRED')).toBe(
      true,
    );
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 2,
        operations: [{ op: 'propose_match', chapterId: 'draft-c', targetChapterIds: ['old-c'] }],
      },
      { actor: 'user' },
    );
    const plan = await ImportPlanService.preview(input.taskId, 3);
    expect(plan.conflicts).toEqual([]);
    expect(plan.summary?.clearedParagraphs).toBe(2);
    expect(plan.summary?.clearedVersions).toBe(5);
    expect(plan.book.translationInstructions).toBe('必须保留的设置');
    expect(
      plan.book.volumes
        ?.flatMap((volume) => volume.chapters ?? [])
        .some((chapter) => chapter.id === 'missing-c'),
    ).toBe(true);
    expect(
      plan.chapters.find((chapter) => chapter.chapterId === 'old-c')?.content[1]?.translations,
    ).toEqual(original.volumes![0]!.chapters![0]!.content![1]!.translations);
    expect(
      (await BookService.getBookById('book', true))?.volumes?.[0]?.chapters?.[0]?.content?.[0]
        ?.text,
    ).toBe('原文甲');
  });

  it('读取失败不会生成清空正文的变更或快照，排除后可预览其他部分', async () => {
    await BookService.saveBook(book());
    await (
      await getDB()
    ).put('chapter-contents', { chapterId: 'old-c', content: '{broken', lastModified: 'time' });
    const input = await draft('新正文');
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
    const plan = await ImportPlanService.preview(input.taskId, 2);
    expect(plan.conflicts.some((conflict) => conflict.code === 'BOOK_READ_FAILED')).toBe(true);
    expect(plan.chapters.some((chapter) => chapter.chapterId === 'old-c')).toBe(false);
    expect(plan.paragraphChanges.filter((change) => change.chapterId === 'old-c')).toEqual([]);
  });

  it('多对多替换须按当前计划确认范围，模型不能伪造确认', async () => {
    await BookService.saveBook(book());
    const input = await draft('完全不同的段落一\n完全不同的段落二');
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
    const first = await ImportPlanService.preview(input.taskId, 2);
    expect(first.conflicts.some((conflict) => conflict.code === 'REPLACEMENT_REQUIRED')).toBe(true);
    const revision = await ImportPlanService.confirmReplacement(
      input.taskId,
      first.id,
      first.replacements![0]!.signature,
    );
    const second = await ImportPlanService.preview(input.taskId, revision);
    expect(second.conflicts).toEqual([]);
    expect(second.summary?.clearedVersions).toBe(6);
    expect(
      second.chapters[0]?.content.every((paragraph) => paragraph.translations.length === 0),
    ).toBe(true);
  });

  it('目标修订后的预览绑定新序号，过时草稿不能标为 ready', async () => {
    await BookService.saveBook(book());
    const input = await draft('原文甲\n锚点\n原文乙');
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
    const first = await ImportPlanService.preview(input.taskId, 2);
    await BookService.saveBook({ ...book(), author: '新作者' });
    const second = await ImportPlanService.preview(input.taskId, 2);
    expect(second.baseBookRevision).toBeGreaterThan(first.baseBookRevision);
    expect(second.baseDigest).not.toBe(first.baseDigest);
    await ImportDraftService.edit(
      input.taskId,
      {
        baseDraftRevision: 2,
        operations: [{ op: 'set_metadata', field: 'title', value: '手动改名' }],
      },
      { actor: 'user' },
    );
    await expect(ImportPlanService.preview(input.taskId, 2)).rejects.toThrow('DRAFT_CHANGED');
  });
});
