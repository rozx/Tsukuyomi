import { ImportWorkerFixture } from './import-worker-fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { Blob, File } from 'node:buffer';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportToolExecutor } from '../services/import/import-tool-executor';
import type { ImportRunContext } from '../models/import';
import type { AIToolCall } from '../services/ai/types/ai-service';
import * as transport from '../services/scraper/core/page-transport';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(count = 1) {
  vi.stubGlobal('Blob', Blob);
  const task = await ImportRepository.createTask();
  const sources = await ImportSourceService.registerFiles(
    task.id,
    Array.from({ length: count }, (_, i) => new File([`正文${i + 1}`], `第${i + 1}章`)),
  );
  await ImportDraftService.edit(task.id, {
    baseDraftRevision: 0,
    operations: [
      {
        op: 'declare_candidates',
        candidates: [{ id: 'n', title: '小说', sourceIds: sources.map((s) => s.id) }],
      },
      { op: 'upsert_volume', id: 'v', title: '第一卷' },
    ],
  });
  const run: ImportRunContext = { taskId: task.id, runId: 'r', runEpoch: 1, modelId: 'm' };
  await ImportRepository.mutateTask(task.id, (current) => {
    Object.assign(current, { state: 'running', run, runEpoch: 1 });
    return Promise.resolve();
  });
  const execute = async (call: AIToolCall, signal?: AbortSignal) => {
    const outcome = await new ImportToolExecutor(run).execute(call, {
      ...(signal ? { signal } : {}),
      afterResult: (result) => ({
        messages: [result],
        remainingCalls: [],
        completedCallIds: [call.id],
      }),
    });
    return JSON.parse(outcome.result!.content) as Record<string, unknown>;
  };
  const record = async (name: string, args: Record<string, unknown>) => {
    const call: AIToolCall = {
      id: crypto.randomUUID(),
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    };
    await ImportRepository.saveStep(task.id, {
      events: [
        { kind: 'tool-call', callId: call.id, toolName: name, data: call.function.arguments },
      ],
      checkpoint: {
        messages: [{ role: 'assistant', tool_calls: [call], content: '' }],
        remainingCalls: [{ id: call.id, name, arguments: call.function.arguments }],
        completedCallIds: [],
      },
    });
    return call;
  };
  const invoke = async (name: string, args: Record<string, unknown>) =>
    execute(await record(name, args));
  const prepare = () =>
    invoke('prepare_chapter_batch', {
      source_ids: sources.map((s) => s.id),
      volume_id: 'v',
      base_draft_revision: 1,
    });
  return { taskId: task.id, sources, run, record, execute, invoke, prepare };
}

async function webBatch(count = 5) {
  const f = await fixture();
  const root = await ImportSourceService.registerUrl(f.taskId, 'https://example.com/book');
  const discoveries = await ImportSourceService.recordDiscoveries(
    f.taskId,
    root.id,
    Array.from({ length: count }, (_, i) => ({
      kind: 'url' as const,
      locator: `https://example.com/c${i + 1}`,
      name: `第${i + 1}章`,
      relation: 'chapter' as const,
    })),
  );
  await ImportDraftService.edit(f.taskId, {
    baseDraftRevision: 1,
    operations: [
      { op: 'declare_candidates', candidates: [{ id: 'n', title: '小说', sourceIds: [root.id] }] },
    ],
  });
  const plan = await f.invoke('prepare_chapter_batch', {
    discovery_ids: discoveries.map((d) => d.id),
    volume_id: 'v',
    base_draft_revision: 2,
    rules: { selector: 'article' },
  });
  expect(plan.success).toBe(true);
  return { ...f, batchId: plan.batchId };
}

function controlledPages() {
  const pending = new Map<string, () => void>();
  let active = 0;
  let maxActive = 0;
  const fetch = vi.spyOn(transport, 'fetchScraperPage').mockImplementation(
    (url, options) =>
      new Promise((resolve, reject) => {
        active++;
        maxActive = Math.max(active, maxActive);
        const finish = () => {
          active--;
          pending.delete(url);
          options?.signal?.removeEventListener('abort', abort);
        };
        const abort = () => {
          finish();
          reject(new DOMException('已取消', 'AbortError'));
        };
        pending.set(url, () => {
          finish();
          resolve({
            html: `<article><p>${url} 的完整正文</p></article>`,
            requestUrl: url,
            transportUrl: url,
            status: 200,
            contentType: 'text/html',
          });
        });
        options?.signal?.addEventListener('abort', abort, { once: true });
      }),
  );
  return { pending, fetch, maxActive: () => maxActive, active: () => active };
}

describe('Agent 章节批次', () => {
  it('来源被用户移除后保留草稿，但旧批次不能继续抓取', async () => {
    const f = await webBatch(3);
    await ImportRepository.mutateTask(f.taskId, (task) => {
      task.state = 'paused';
      delete task.run;
      return Promise.resolve();
    });
    const root = (await ImportRepository.listSources(f.taskId)).items.find(
      (source) => source.url === 'https://example.com/book',
    )!;
    await ImportSourceService.remove(f.taskId, root.id);
    await ImportRepository.mutateTask(f.taskId, (task) => {
      task.state = 'running';
      task.run = f.run;
      return Promise.resolve();
    });
    const fetch = vi.spyOn(transport, 'fetchScraperPage').mockRejectedValue(new Error('不应抓取'));
    expect(
      await f.invoke('run_chapter_batch', { batch_id: f.batchId, base_draft_revision: 3 }),
    ).toMatchObject({ success: false, error: { code: 'SOURCE_REMOVED' } });
    expect(fetch).not.toHaveBeenCalled();
    expect((await ImportRepository.getTask(f.taskId))?.draft.chapters).toHaveLength(3);
  });

  it('暂停后保留已完成章，原调用在新运行中继续，只请求剩余章节', async () => {
    const f = await webBatch(4);
    const network = controlledPages();
    const controller = new AbortController();
    const call = await f.record('run_chapter_batch', {
      batch_id: f.batchId,
      base_draft_revision: 3,
    });
    const running = f.execute(call, controller.signal);
    const stopped = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(network.pending.size).toBe(3));
    network.pending.get('https://example.com/c1')!();
    await vi.waitFor(async () =>
      expect((await ImportRepository.getTask(f.taskId))?.batchProgress?.ready).toBe(1),
    );
    controller.abort();
    await stopped;
    expect(network.active()).toBe(0);
    const paused = await ImportRepository.getTask(f.taskId);
    expect(paused?.checkpoint?.remainingCalls[0]?.id).toBe(call.id);
    expect(paused?.draft.chapters.filter((c) => c.status === 'ready')).toHaveLength(1);
    f.run.runEpoch++;
    f.run.runId = 'resumed';
    await ImportRepository.mutateTask(f.taskId, (task) => {
      Object.assign(task, { run: f.run, runEpoch: f.run.runEpoch });
      return Promise.resolve();
    });
    const resumed = f.execute(call);
    await vi.waitFor(() => expect(network.pending.size).toBe(3));
    for (const resolve of [...network.pending.values()]) resolve();
    expect(await resumed).toMatchObject({ ready: 4, pending: 0 });
    expect(network.fetch.mock.calls.filter(([url]) => url.endsWith('/c1'))).toHaveLength(1);
    expect((await ImportRepository.getTask(f.taskId))?.draft.chapters.map((c) => c.id)).toEqual(
      paused?.draft.chapters.map((c) => c.id),
    );
  });

  it('一章失败不丢其他章节，重试只请求失败项且保留稳定章节 ID', async () => {
    const f = await webBatch(3);
    let failed = false;
    const fetch = vi.spyOn(transport, 'fetchScraperPage').mockImplementation((url) => {
      if (url.endsWith('/c2') && !failed) {
        failed = true;
        return Promise.reject(new Error('503'));
      }
      return Promise.resolve({
        html: `<article><p>${url} 原文</p></article>`,
        requestUrl: url,
        transportUrl: url,
        status: 200,
        contentType: 'text/html',
      });
    });
    expect(
      await f.invoke('run_chapter_batch', { batch_id: f.batchId, base_draft_revision: 3 }),
    ).toMatchObject({ ready: 2, failed: 1, pending: 0, issueCount: 1 });
    const task = (await ImportRepository.getTask(f.taskId))!;
    expect(
      await f.invoke('run_chapter_batch', {
        batch_id: f.batchId,
        base_draft_revision: task.draft.revision,
        retry_failed: true,
      }),
    ).toMatchObject({ ready: 3, failed: 0, issueCount: 0 });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://example.com/c1',
      'https://example.com/c2',
      'https://example.com/c3',
      'https://example.com/c2',
    ]);
    expect((await ImportRepository.getTask(f.taskId))?.draft.chapters.map((c) => c.id)).toEqual(
      task.draft.chapters.map((c) => c.id),
    );
  });

  it('手动编辑时停止所有工作槽，新版本也不能覆盖被编辑的预留章', async () => {
    const f = await webBatch(5);
    const network = controlledPages();
    const running = f.invoke('run_chapter_batch', { batch_id: f.batchId, base_draft_revision: 3 });
    await vi.waitFor(() => expect(network.pending.size).toBe(3));
    const before = (await ImportRepository.getTask(f.taskId))!;
    await ImportDraftService.edit(
      f.taskId,
      {
        baseDraftRevision: before.draft.revision,
        operations: [
          {
            op: 'upsert_chapter',
            chapter: { ...before.draft.chapters[0]!, title: '用户指定标题' },
          },
        ],
      },
      { actor: 'user' },
    );
    network.pending.get('https://example.com/c1')!();
    expect(await running).toMatchObject({ success: false, error: { code: 'DRAFT_CHANGED' } });
    expect(network.active()).toBe(0);
    expect(network.fetch).toHaveBeenCalledTimes(3);
    const after = (await ImportRepository.getTask(f.taskId))!;
    expect(after.draft.chapters[0]?.title).toBe('用户指定标题');
    expect(after.draft.chapters.filter((c) => c.status === 'ready')).toHaveLength(0);
    expect(
      await f.invoke('run_chapter_batch', {
        batch_id: f.batchId,
        base_draft_revision: after.draft.revision,
      }),
    ).toMatchObject({ success: false, error: { code: 'DRAFT_CHANGED' } });
    expect(network.fetch).toHaveBeenCalledTimes(3);
  });

  it('三个工作槽并发，乱序完成仍保持目录顺序，完成一章就可读到进度', async () => {
    const f = await webBatch(4);
    const network = controlledPages();
    const running = f.invoke('run_chapter_batch', { batch_id: f.batchId, base_draft_revision: 3 });
    await vi.waitFor(() => expect(network.pending.size).toBe(3));
    network.pending.get('https://example.com/c3')!();
    await vi.waitFor(async () =>
      expect((await ImportRepository.getTask(f.taskId))?.draft.chapters[2]?.status).toBe('ready'),
    );
    await vi.waitFor(() => expect(network.pending.has('https://example.com/c4')).toBe(true));
    for (const resolve of [...network.pending.values()]) resolve();
    expect(await running).toMatchObject({ ready: 4, pending: 0 });
    expect(network.maxActive()).toBe(3);
    expect((await ImportRepository.getTask(f.taskId))?.draft.chapters.map((c) => c.title)).toEqual([
      '第1章',
      '第2章',
      '第3章',
      '第4章',
    ]);
  });

  it('一次执行百章，保存完整正文引用并只返回计数，完成后重跑不重复建章', async () => {
    const f = await fixture(100);
    const plan = await f.prepare();
    const result = await f.invoke('run_chapter_batch', {
      batch_id: plan.batchId,
      base_draft_revision: 2,
    });
    expect(result).toMatchObject({ success: true, total: 100, ready: 100, failed: 0, pending: 0 });
    expect(JSON.stringify(result)).not.toContain('正文');
    const task = await ImportRepository.getTask(f.taskId);
    expect(task?.draft.chapters).toHaveLength(100);
    const first = task!.draft.chapters[0]!;
    expect(first.status).toBe('ready');
    const ref = first.content[0]!;
    expect(ref.kind).toBe('extraction');
    if (ref.kind !== 'extraction') throw new Error('引用错误');
    expect(await ImportRepository.getResource(f.taskId, ref.resourceId)).toMatchObject({
      kind: 'extraction',
      blocks: [{ text: '正文1' }],
    });
    const again = await f.invoke('run_chapter_batch', {
      batch_id: plan.batchId,
      base_draft_revision: task!.draft.revision,
    });
    expect(again).toMatchObject({ ready: 100, draftRevision: task!.draft.revision });
    const page = await f.invoke('get_chapter_batch', {
      batch_id: plan.batchId,
      offset: 99,
      limit: 1,
    });
    expect(page.items).toMatchObject([{ title: '第100章', status: 'ready' }]);
  });

  it('从固定目录快照选择章节范围，不包含下一页且非法范围不留下派生来源', async () => {
    const f = await fixture();
    const root = await ImportSourceService.registerUrl(f.taskId, 'https://example.com/book');
    await ImportDraftService.edit(f.taskId, {
      baseDraftRevision: 1,
      operations: [
        {
          op: 'declare_candidates',
          candidates: [{ id: 'n', title: '小说', sourceIds: [root.id] }],
        },
      ],
    });
    const fetch = vi.spyOn(transport, 'fetchScraperPage').mockResolvedValue({
      html: '<nav class="toc"><a href="/c1">第一章</a><a href="/c2">第二章</a><a href="/c3">第三章</a></nav><a rel="next" href="/page2">下一页</a>',
      requestUrl: root.url!,
      transportUrl: root.url!,
      status: 200,
      contentType: 'text/html',
    });
    const inspection = await f.invoke('inspect_source', { source_id: root.id });
    const args = {
      catalog: { snapshot_id: inspection.snapshotId, offset: 1, limit: 2 },
      volume_id: 'v',
      base_draft_revision: 2,
    };
    expect(
      await f.invoke('prepare_chapter_batch', { ...args, catalog: { ...args.catalog, limit: 3 } }),
    ).toMatchObject({ success: false });
    expect(
      (await ImportRepository.listSources(f.taskId, { parentSourceId: root.id })).items,
    ).toHaveLength(0);
    expect(await f.invoke('prepare_chapter_batch', args)).toMatchObject({
      success: true,
      total: 2,
    });
    expect((await ImportRepository.getTask(f.taskId))?.draft.chapters.map((c) => c.title)).toEqual([
      '第二章',
      '第三章',
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('混合来源参数不能静默忽略，越界、重复、元信息和已有章节均拒绝整个计划', async () => {
    const f = await fixture(2);
    const other = await ImportRepository.createTask();
    const [foreign] = await ImportSourceService.registerFiles(other.id, [
      new File(['别书'], '别书'),
    ]);
    const metadata = await ImportSourceService.registerMetadataUrl(
      f.taskId,
      'https://example.com/info',
      '信息',
    );
    for (const ids of [
      [f.sources[0]!.id, foreign!.id],
      [metadata.id],
      [f.sources[0]!.id, f.sources[0]!.id],
    ]) {
      expect(
        await f.invoke('prepare_chapter_batch', {
          source_ids: ids,
          volume_id: 'v',
          base_draft_revision: 1,
        }),
      ).toMatchObject({ success: false });
      expect((await ImportRepository.getTask(f.taskId))?.draft.chapters).toHaveLength(0);
    }
    expect(
      await f.invoke('prepare_chapter_batch', {
        source_ids: [f.sources[0]!.id],
        discovery_ids: ['bad'],
        volume_id: 'v',
        base_draft_revision: 1,
      }),
    ).toMatchObject({ success: false });
    expect(await f.prepare()).toMatchObject({ success: true });
    expect(
      await f.invoke('prepare_chapter_batch', {
        source_ids: [f.sources[0]!.id],
        volume_id: 'v',
        base_draft_revision: 2,
      }),
    ).toMatchObject({ success: false, error: { code: 'SOURCE_OVERLAP' } });
  });

  it('一次准备百章，保留输入顺序且不抓取正文', async () => {
    const f = await fixture(100);
    const fetch = vi.spyOn(transport, 'fetchScraperPage');
    const result = await f.prepare();
    expect(result.success).toBe(true);
    expect(result.total).toBe(100);
    const task = await ImportRepository.getTask(f.taskId);
    expect(task?.draft.chapters).toHaveLength(100);
    expect(task?.draft.chapters[0]).toMatchObject({
      title: '第1章',
      status: 'pending',
      content: [],
    });
    expect(task?.draft.chapters[99]).toMatchObject({
      title: '第100章',
      status: 'pending',
      content: [],
    });
    expect((await ImportRepository.getSource(f.taskId, f.sources[0]!.id)).status).toBe(
      'registered',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(task?.draft.revision).toBe(2);
  });
  it('章节批次可用标题正则筛选，排除项不会创建草稿，零命中不产生副作用', async () => {
    vi.stubGlobal('Worker', ImportWorkerFixture);
    const f = await fixture(3);
    const input = {
      source_ids: f.sources.map((s) => s.id),
      volume_id: 'v',
      base_draft_revision: 1,
    };
    const none = await f.invoke('prepare_chapter_batch', {
      ...input,
      filter: { name: { mode: 'regex', pattern: '^番外' } },
    });
    expect(none.success).toBe(false);
    expect((await ImportRepository.getTask(f.taskId))?.draft.revision).toBe(1);
    const prepared = await f.invoke('prepare_chapter_batch', {
      ...input,
      filter: { name: { mode: 'regex', pattern: '^第[13]章$' } },
    });
    expect(prepared.success).toBe(true);
    expect((await ImportRepository.getTask(f.taskId))?.draft.chapters.map((c) => c.title)).toEqual([
      '第1章',
      '第3章',
    ]);
  });
});
