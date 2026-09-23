import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportAgentService } from '../services/import/import-agent-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AIServiceConfig, TextGenerationRequest } from '../services/ai/types/ai-service';
import { deferred, webLocksFixture } from './web-locks-fixture';
import { getDB } from '../utils/indexed-db';
import { ImportToolExecutor } from '../services/import/import-tool-executor';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import type { ImportRunContext } from '../models/import';

const model: AIModel = {
  id: 'm',
  name: '测试模型',
  provider: 'openai',
  model: 'test',
  apiKey: 'test-only-private-key',
  baseUrl: 'https://example.test',
  temperature: 0,
  maxInputTokens: 50000,
  maxOutputTokens: 2000,
  enabled: true,
  lastEdited: new Date(),
  isDefault: {
    translation: { enabled: false, temperature: 0 },
    proofreading: { enabled: false, temperature: 0 },
    termsTranslation: { enabled: false, temperature: 0 },
    assistant: { enabled: true, temperature: 0 },
  },
};
function tool(name: string, args: unknown) {
  return {
    text: '',
    toolCalls: [
      {
        id: 'provider-call',
        type: 'function' as const,
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}
beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('导入 Agent 执行生命周期', () => {
  it('界面订阅异常不会释放仍在执行的锁或中止持久化', async () => {
    const task = await ImportRepository.createTask();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: () => Promise.resolve({ text: '反馈已完成' }),
    } as never);
    const dispose = ImportAgentService.subscribe(() => {
      throw new Error('界面刷新失败');
    });
    try {
      await expect(ImportAgentService.run(task.id, model, '检查')).resolves.toMatchObject({
        state: 'paused',
      });
    } finally {
      dispose();
      await ImportAgentService.pause(task.id);
    }
  });
  it('直接开始或完成一轮后点击继续，仍提供明确用户消息而非空请求', async () => {
    const task = await ImportRepository.createTask();
    const requests: TextGenerationRequest[] = [];
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
        requests.push(structuredClone(request));
        return Promise.resolve({ text: '需要先提供来源' });
      },
    } as never);
    await ImportAgentService.run(task.id, model);
    expect(
      requests[0]?.messages?.some((message) => message.role === 'user' && message.content?.trim()),
    ).toBe(true);
    await ImportAgentService.run(task.id, model);
    expect(requests[1]?.messages?.at(-1)?.role).toBe('user');
  });

  it('从登记文件经过真实工具链得到待确认方案，消息和结果持久化但不自动应用', async () => {
    const task = await ImportRepository.createTask();
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File(['正文第一段\n正文第二段'], 'novel.txt'),
    ]);
    let requestCount = 0;
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
        requestCount++;
        if (requestCount === 1)
          return Promise.resolve(tool('inspect_source', { source_id: source!.id }));
        if (requestCount === 2)
          return Promise.resolve(tool('extract_content', { sources: [{ source_id: source!.id }] }));
        if (requestCount === 3) {
          const entry = request.messages!.find(
            (message) => message.role === 'tool' && message.name === 'extract_content',
          )!;
          const parsed = JSON.parse(entry.content!) as { results: { contentId: string }[] };
          return Promise.resolve(
            tool('edit_import_draft', {
              base_draft_revision: 0,
              operations: [
                {
                  op: 'declare_candidates',
                  candidates: [{ id: 'n', title: '小说', sourceIds: [source!.id] }],
                },
                { op: 'upsert_volume', id: 'v', title: '卷一' },
                {
                  op: 'upsert_chapter',
                  chapter: {
                    id: 'c',
                    volumeId: 'v',
                    title: '第一章',
                    inferredTitle: true,
                    inferredStructure: true,
                    selected: true,
                    status: 'ready',
                    content: [{ kind: 'extraction', resourceId: parsed.results[0]!.contentId }],
                    sourceIds: [],
                  },
                },
              ],
            }),
          );
        }
        if (requestCount === 4)
          return Promise.resolve(tool('rename_import_task', { name: '小说' }));
        if (requestCount === 5)
          return Promise.resolve(tool('preview_import', { draft_revision: 1 }));
        return Promise.resolve({ text: '请检查导入方案。' });
      },
    } as never);
    const result = await ImportAgentService.run(task.id, model, '请整理这些来源');
    expect(result.state).toBe('ready');
    expect(result.currentPlanId).toBeDefined();
    expect(result.run).toBeUndefined();
    const events = (await ImportRepository.listEvents(task.id, { limit: 100 })).items;
    expect(events.filter((event) => event.kind === 'tool-call')).toHaveLength(5);
    expect(events.filter((event) => event.kind === 'tool-result')).toHaveLength(5);
    expect(events.some((event) => event.message?.content === '请检查导入方案。')).toBe(true);
    expect(JSON.stringify(result)).not.toContain(model.apiKey);
    expect(JSON.stringify(events)).not.toContain(model.apiKey);
    expect(await (await getDB()).count('books')).toBe(0);
  });

  it('一个任务运行时其他任务不能并行，暂停等待模型停止后才释放全局运行锁', async () => {
    const first = await ImportRepository.createTask();
    const second = await ImportRepository.createTask();
    const started = deferred();
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (config: AIServiceConfig) =>
        new Promise((_resolve, reject) => {
          started.resolve();
          config.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('取消', 'AbortError')),
            { once: true },
          );
        }),
    } as never);
    const running = ImportAgentService.run(first.id, model, '开始');
    await started.promise;
    expect(await ImportAgentService.findActiveTaskId()).toBe(first.id);
    await expect(ImportAgentService.run(second.id, model, '开始')).rejects.toThrow('IMPORT_BUSY');
    const paused = await ImportAgentService.pause(first.id);
    expect(paused.state).toBe('paused');
    expect((await running).state).toBe('paused');
    expect((await ImportRepository.getTask(second.id))?.state).toBe('draft');
    expect(ImportAgentService.activeTaskId).toBeUndefined();
    expect(await ImportAgentService.findActiveTaskId()).toBeUndefined();
  });

  it('出现多小说必要问题后让出运行，取消选择不能继续执行或伪报 ready', async () => {
    const task = await ImportRepository.createTask();
    const sources = await ImportSourceService.registerFiles(task.id, [
      new File(['一'], 'one.txt'),
      new File(['二'], 'two.txt'),
    ]);
    const generate = vi.fn(() =>
      Promise.resolve(
        tool('edit_import_draft', {
          base_draft_revision: 0,
          operations: [
            {
              op: 'declare_candidates',
              candidates: sources.map((source, index) => ({
                id: String(index),
                title: `小说${index}`,
                sourceIds: [source.id],
              })),
            },
          ],
        }),
      ),
    );
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({ generateText: generate } as never);
    const result = await ImportAgentService.run(task.id, model, '检查');
    expect(result.state).toBe('waiting_user');
    expect(result.pendingQuestion?.required).toBe(true);
    await expect(ImportAgentService.run(task.id, model, '继续')).rejects.toThrow(
      'PENDING_QUESTION',
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('刷新后遗留的运行状态在取得任务锁后转为可继续，旧运行的迟到工具结果被拒绝', async () => {
    const task = await ImportRepository.createTask();
    const dead: ImportRunContext = { taskId: task.id, runId: 'dead', runEpoch: 1, modelId: 'm' };
    await (
      await getDB()
    ).put('import-tasks', {
      ...task,
      state: 'running',
      run: dead,
      runEpoch: 1,
      streaming: { text: '半截回复' },
    });
    const service = vi.spyOn(AIServiceFactory, 'getService');

    const recovered = await ImportAgentService.recover(task.id);
    expect(recovered.state).toBe('paused');
    expect(recovered.run).toBeUndefined();
    expect(recovered.streaming).toBeUndefined();
    expect(recovered.runEpoch).toBe(2);
    expect(recovered.lastError?.code).toBe('INTERRUPTED');
    expect(service).not.toHaveBeenCalled();

    const call = {
      id: 'late',
      type: 'function' as const,
      function: { name: 'list_sources', arguments: '{}' },
    };
    await expect(
      new ImportToolExecutor(dead).execute(call, {
        afterResult: (result) => ({
          messages: [result],
          remainingCalls: [],
          completedCallIds: [call.id],
        }),
      }),
    ).rejects.toThrow('RUN_STALE');
    const events = (await ImportRepository.listEvents(task.id, { limit: 100 })).items;
    expect(events.some((event) => event.kind === 'tool-result')).toBe(false);
  });

  it('其他页面仍持有任务锁时恢复只观察，不改写仍在执行的运行', async () => {
    const task = await ImportRepository.createTask();
    const live: ImportRunContext = { taskId: task.id, runId: 'live', runEpoch: 1, modelId: 'm' };
    await (
      await getDB()
    ).put('import-tasks', { ...task, state: 'running', run: live, runEpoch: 1 });
    await navigator.locks.request(
      `tsukuyomi:import-task:${task.id}`,
      { ifAvailable: true },
      async () => {
        const observed = await ImportAgentService.recover(task.id);
        expect(observed.state).toBe('running');
        expect(observed.run?.runId).toBe('live');
      },
    );
  });

  it('暂停遗留的运行时无需本页执行者，回收后直接显示已暂停', async () => {
    const task = await ImportRepository.createTask();
    const dead: ImportRunContext = { taskId: task.id, runId: 'dead', runEpoch: 1, modelId: 'm' };
    await (
      await getDB()
    ).put('import-tasks', { ...task, state: 'running', run: dead, runEpoch: 1 });
    const paused = await ImportAgentService.pause(task.id);
    expect(paused.state).toBe('paused');
    expect(paused.run).toBeUndefined();
  });

  it('其他页面把任务标为暂停后，运行页在下一步骤前停止并保存进度', async () => {
    const task = await ImportRepository.createTask();
    const started = deferred();
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (config: AIServiceConfig) =>
        new Promise((_resolve, reject) => {
          started.resolve();
          config.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('取消', 'AbortError')),
            { once: true },
          );
        }),
    } as never);
    const running = ImportAgentService.run(task.id, model, '开始');
    await started.promise;
    await ImportRepository.mutateTask(task.id, (current) => {
      current.state = 'pausing';
      return Promise.resolve();
    });
    const result = await running;
    expect(result.state).toBe('paused');
    expect(result.run).toBeUndefined();
  }, 5000);

  it('暂停时仍在执行的工具迟到返回不会写入结果，恢复后重新执行该调用一次', async () => {
    const task = await ImportRepository.createTask();
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File(['正文'], 'novel.txt'),
    ]);
    const entered = deferred();
    const release = deferred();
    const original: ImportExtractionService['prepareInspection'] = Reflect.get(
      ImportExtractionService.prototype,
      'prepareInspection',
    );
    const inspect = vi
      .spyOn(ImportExtractionService.prototype, 'prepareInspection')
      .mockImplementationOnce(async function (this: ImportExtractionService, ...args) {
        entered.resolve();
        await release.promise;
        return original.apply(this, args);
      });
    let requests = 0;
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: () => {
        requests++;
        return Promise.resolve(
          requests === 1 ? tool('inspect_source', { source_id: source!.id }) : { text: '完成' },
        );
      },
    } as never);

    const running = ImportAgentService.run(task.id, model, '开始');
    await entered.promise;
    const pausing = ImportAgentService.pause(task.id);
    release.resolve();
    const paused = await pausing;
    await running;
    expect(paused.state).toBe('paused');
    expect(paused.checkpoint?.remainingCalls.map((call) => call.name)).toEqual(['inspect_source']);
    const results = async () =>
      (await ImportRepository.listEvents(task.id, { limit: 100 })).items.filter(
        (event) => event.kind === 'tool-result',
      );
    expect(await results()).toHaveLength(0);

    await ImportAgentService.run(task.id, model);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(await results()).toHaveLength(1);
    expect(requests).toBe(2);
  });

  it('模型服务返回整页 HTML 错误时只保存简短说明，不把网页写入任务或界面', async () => {
    const task = await ImportRepository.createTask();
    const page = `530 <!DOCTYPE html><html><head><title>Origin DNS error | example.invalid | Cloudflare</title></head><body>${'x'.repeat(6000)}</body></html>`;
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: () => Promise.reject(new Error(page)),
    } as never);
    const failure = await ImportAgentService.run(task.id, model, '开始').catch(
      (error: unknown) => error as Error,
    );
    const saved = (await ImportRepository.getTask(task.id))!;
    expect(saved.state).toBe('failed');
    expect(saved.lastError?.message).toContain('Origin DNS error');
    expect(saved.lastError?.message).not.toContain('<html');
    expect(saved.lastError!.message.length).toBeLessThanOrEqual(320);
    expect(String((failure as Error).message)).not.toContain('<html');
  });
});
