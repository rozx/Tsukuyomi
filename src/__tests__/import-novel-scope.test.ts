import { describe, it } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportDraftService } from '../services/import/import-draft-service';
import { BookService } from '../services/book-service';
import type { ImportContentRef, ImportDraftChapter, ImportNovelCandidate } from '../models/import';

async function setup() {
  const task = await ImportRepository.createTask();
  const [source] = await ImportSourceService.registerFiles(task.id, [
    new File(['甲书正文\n乙书正文'], 'two-books.txt'),
  ]);
  const extraction = await new ImportExtractionService(
    new ImportParsingClient(() => undefined),
  ).prepareExtraction(task.id, [{ sourceId: source!.id }]);
  await ImportRepository.saveStep(task.id, extraction);
  const resource = await ImportRepository.getResource(task.id, extraction.results[0]!.contentId!);
  if (resource?.kind !== 'extraction') throw new Error('missing');
  const refs: ImportContentRef[] = resource.blocks.map((block) => ({
    kind: 'extraction',
    resourceId: resource.id,
    blockId: block.id,
  }));
  const candidates: ImportNovelCandidate[] = refs.map((ref, index) => ({
    id: index === 0 ? 'a' : 'b',
    title: index === 0 ? '甲书' : '乙书',
    sourceIds: [source!.id],
    content: [ref],
  }));
  return { task, source: source!, refs, candidates };
}
function chapter(content: ImportContentRef[]): ImportDraftChapter {
  return {
    id: 'chapter',
    volumeId: 'v',
    title: '章',
    inferredTitle: true,
    inferredStructure: true,
    selected: true,
    status: 'ready',
    content,
    sourceIds: [],
  };
}

describe('单本小说确认', () => {
  it('补充文件必须先核对小说归属，确认范围后可继续且保留原失败记录', async () => {
    const { task, candidates } = await setup();
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        { op: 'declare_candidates', candidates: [candidates[0]!] },
        { op: 'upsert_volume', id: 'v', title: '卷' },
      ],
    });
    const failed = await ImportSourceService.registerUrl(task.id, 'https://example.com/missing');
    await ImportRepository.saveStep(task.id, {
      sources: [
        { ...failed, status: 'failed', error: { code: 'SOURCE_UNAVAILABLE', message: '无法访问' } },
      ],
    });
    const [replacement] = await ImportSourceService.registerFiles(
      task.id,
      [new File(['补充章节正文'], 'replacement.txt')],
      failed.id,
    );
    const prepared = await new ImportExtractionService(
      new ImportParsingClient(() => undefined),
    ).prepareExtraction(task.id, [{ sourceId: replacement!.id }]);
    await ImportRepository.saveStep(task.id, prepared);
    const ref: ImportContentRef = {
      kind: 'extraction',
      resourceId: prepared.results[0]!.contentId!,
    };
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 1,
        operations: [{ op: 'upsert_chapter', chapter: chapter([ref]) }],
      }),
    ).rejects.toThrow('SOURCE_SCOPE');
    const assigned = {
      ...candidates[0]!,
      sourceIds: [...candidates[0]!.sourceIds, replacement!.id],
      content: [...candidates[0]!.content!, ref],
    };
    const result = await ImportDraftService.edit(task.id, {
      baseDraftRevision: 1,
      operations: [
        { op: 'declare_candidates', candidates: [assigned] },
        { op: 'upsert_chapter', chapter: chapter([ref]) },
      ],
    });
    expect(result.chapters[0]?.status).toBe('ready');
    expect((await ImportRepository.getSource(task.id, failed.id)).status).toBe('failed');
  });

  it('另一个任务的回答不能解除当前问题', async () => {
    const first = await setup();
    const second = await setup();
    for (const entry of [first, second])
      await ImportDraftService.edit(entry.task.id, {
        baseDraftRevision: 0,
        operations: [{ op: 'declare_candidates', candidates: entry.candidates }],
      });
    const question = (await ImportRepository.getTask(first.task.id))!.pendingQuestion!;
    await expect(
      ImportDraftService.chooseNovel(second.task.id, question.id, question.scopeRevision, 'a'),
    ).rejects.toThrow('QUESTION_CHANGED');
    expect((await ImportRepository.getTask(second.task.id))!.draft.novelScope.needsChoice).toBe(
      true,
    );
  });
  it('同一文件中的多作品必须实际选择，取消和 Agent 缩减候选不能解除门槛', async () => {
    const { task, candidates, refs } = await setup();
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [{ op: 'declare_candidates', candidates }],
    });
    const waiting = (await ImportRepository.getTask(task.id))!;
    expect(waiting.state).toBe('waiting_user');
    const q = waiting.pendingQuestion!;
    await ImportDraftService.chooseNovel(task.id, q.id, q.scopeRevision, null);
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: 1,
        operations: [{ op: 'upsert_volume', id: 'v', title: '卷' }],
      }),
    ).rejects.toThrow('NOVEL_CHOICE_REQUIRED');
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 1,
      operations: [{ op: 'declare_candidates', candidates: [candidates[0]!] }],
    });
    expect((await ImportRepository.getTask(task.id))!.draft.novelScope.needsChoice).toBe(true);
    await expect(
      ImportDraftService.chooseNovel(task.id, q.id, q.scopeRevision, 'a'),
    ).rejects.toThrow('QUESTION_CHANGED');
    const current = (await ImportRepository.getTask(task.id))!;
    const selected = await ImportDraftService.chooseNovel(
      task.id,
      current.pendingQuestion!.id,
      current.pendingQuestion!.scopeRevision,
      'a',
    );
    const edited = await ImportDraftService.edit(task.id, {
      baseDraftRevision: selected.revision,
      operations: [
        { op: 'upsert_volume', id: 'v', title: '卷' },
        { op: 'upsert_chapter', chapter: chapter([refs[0]!]) },
      ],
    });
    await expect(
      ImportDraftService.edit(task.id, {
        baseDraftRevision: edited.revision,
        operations: [{ op: 'upsert_chapter', chapter: chapter([refs[1]!]) }],
      }),
    ).rejects.toThrow('SOURCE_SCOPE');
  });

  it('更换实际作品需要新确认，并保留但取消选择旧作品的草稿', async () => {
    const { task, candidates, refs } = await setup();
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        { op: 'declare_candidates', candidates: [candidates[0]!] },
        { op: 'upsert_volume', id: 'v', title: '卷' },
        { op: 'upsert_chapter', chapter: chapter([refs[0]!]) },
      ],
    });
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 1,
      operations: [{ op: 'declare_candidates', candidates }],
    });
    const current = (await ImportRepository.getTask(task.id))!;
    const selected = await ImportDraftService.chooseNovel(
      task.id,
      current.pendingQuestion!.id,
      current.pendingQuestion!.scopeRevision,
      'b',
    );
    expect(selected.chapters).toHaveLength(1);
    expect(selected.chapters[0]?.selected).toBe(false);
    expect(selected.metadata.title?.value).toBe('乙书');
  });

  it('同一本小说重新确认新增范围时保留手动标题和目标', async () => {
    const { task, candidates, source } = await setup();
    const date = new Date();
    await BookService.saveBook({ id: 'target', title: '目标', lastEdited: date, createdAt: date });
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [{ op: 'declare_candidates', candidates }],
    });
    let stored = (await ImportRepository.getTask(task.id))!;
    const selected = await ImportDraftService.chooseNovel(
      task.id,
      stored.pendingQuestion!.id,
      stored.pendingQuestion!.scopeRevision,
      'a',
    );
    const manual = await ImportDraftService.edit(
      task.id,
      {
        baseDraftRevision: selected.revision,
        operations: [
          { op: 'set_metadata', field: 'title', value: '我的标题' },
          { op: 'propose_target', bookId: 'target' },
        ],
      },
      { actor: 'user' },
    );
    const [extra] = await ImportSourceService.registerFiles(
      task.id,
      [new File(['补章'], 'extra.txt')],
      source.id,
    );
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: manual.revision,
      operations: [
        {
          op: 'declare_candidates',
          candidates: [{ ...candidates[0]!, sourceIds: [source.id, extra!.id] }, candidates[1]!],
        },
      ],
    });
    stored = (await ImportRepository.getTask(task.id))!;
    const confirmed = await ImportDraftService.chooseNovel(
      task.id,
      stored.pendingQuestion!.id,
      stored.pendingQuestion!.scopeRevision,
      'a',
    );
    expect(confirmed.metadata.title?.value).toBe('我的标题');
    expect(confirmed.target).toEqual({ kind: 'existing', bookId: 'target', basis: 'user' });
  });

  it('草稿和工具回执同事务，回执写失败不会留下草稿编辑', async () => {
    const { task } = await setup();
    await expect(
      ImportDraftService.edit(
        task.id,
        {
          baseDraftRevision: 0,
          operations: [{ op: 'set_metadata', field: 'title', value: '不能落盘' }],
        },
        {
          finish: () => ({
            events: [
              { kind: 'tool-result', callId: 'unknown', toolName: 'edit_import_draft', data: {} },
            ],
          }),
        },
      ),
    ).rejects.toThrow('TOOL_PAIR');
    expect((await ImportRepository.getTask(task.id))!.draft.revision).toBe(0);
    expect((await ImportRepository.getTask(task.id))!.draft.metadata.title).toBeUndefined();
  });
});
