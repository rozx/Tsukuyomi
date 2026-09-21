import { afterEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
// fake-indexeddb 使用 Node structuredClone，需用可克隆的原生 Blob。
import { Blob } from 'node:buffer';
import { getDB, __resetDbPromiseForTesting } from '../utils/indexed-db';
import { ImportRepository } from '../services/import/import-repository';
import type { ImportResource, ImportSource } from '../models/import';

afterEach(() => mock.restore());

function source(taskId: string, id: string): ImportSource {
  return {
    id,
    taskId,
    name: `${id}.txt`,
    kind: 'file',
    origin: 'user',
    purpose: 'content-root',
    status: 'registered',
    createdAt: 1,
  };
}

describe('导入任务仓库', () => {
  it('独立创建和重载任务，按更新时间分页且不启动运行', async () => {
    const a = await ImportRepository.createTask('甲');
    const b = await ImportRepository.createTask('乙');
    expect(a.id).not.toBe(b.id);
    expect(a.draft.chapters).toEqual([]);
    await __resetDbPromiseForTesting();
    expect((await ImportRepository.getTask(a.id))?.state).toBe('draft');
    const first = await ImportRepository.listTasks({ limit: 1 });
    const second = await ImportRepository.listTasks({ limit: 1, cursor: first.cursor });
    expect(new Set([...first.items, ...second.items].map((t) => t.id))).toEqual(
      new Set([a.id, b.id]),
    );
    expect(second.cursor).toBeUndefined();
  });

  it('来源分页不读取资源 store，保存关系和 Blob，不能跨任务读取', async () => {
    const a = await ImportRepository.createTask('甲');
    const b = await ImportRepository.createTask('乙');
    const parent = source(a.id, 'parent');
    const child = { ...source(a.id, 'child'), parentSourceId: 'parent' };
    const resource: ImportResource = {
      id: 'raw',
      taskId: a.id,
      sourceId: 'child',
      kind: 'input',
      blob: new Blob(['全文']),
      createdAt: 1,
    };
    await ImportRepository.registerSources(a.id, [parent, child], [resource]);
    const db = await getDB();
    const reads = spyOn(db, 'transaction');
    const page = await ImportRepository.listSources(a.id, { limit: 1, parentSourceId: 'parent' });
    expect(page.items).toEqual([child]);
    expect(
      reads.mock.calls.every(([stores]) => !JSON.stringify(stores).includes('import-resources')),
    ).toBe(true);
    expect((await ImportRepository.getResource(a.id, 'raw'))?.kind).toBe('input');
    expect(await ImportRepository.listSources(b.id, {})).toEqual({ items: [] });
    await expect(ImportRepository.getResource(b.id, 'raw')).rejects.toThrow('SOURCE_SCOPE');
    const loaded = await ImportRepository.getResource(a.id, 'raw');
    expect(loaded?.kind === 'input' && loaded.blob.size).toBe(resource.blob.size);
  });

  it('资源不可覆盖；批次跨任务或写入失败不会留下半次登记', async () => {
    const a = await ImportRepository.createTask('甲');
    const r: ImportResource = {
      id: 'r',
      taskId: a.id,
      sourceId: 's',
      kind: 'input',
      blob: new Blob(['甲']),
      createdAt: 1,
    };
    await ImportRepository.registerSources(a.id, [source(a.id, 's')], [r]);
    await expect(
      ImportRepository.registerSources(a.id, [source(a.id, 'new')], [r]),
    ).rejects.toThrow();
    expect((await ImportRepository.listSources(a.id, {})).items.map((s) => s.id)).toEqual(['s']);
    await expect(
      ImportRepository.registerSources(a.id, [source('another', 'bad')], []),
    ).rejects.toThrow('SOURCE_SCOPE');
  });

  it('任务删除只清理专属来源、资源和事件，不删除已导入小说或别的任务', async () => {
    const a = await ImportRepository.createTask('甲');
    const b = await ImportRepository.createTask('乙');
    await ImportRepository.registerSources(a.id, [source(a.id, 'a')], []);
    await ImportRepository.registerSources(b.id, [source(b.id, 'b')], []);
    const db = await getDB();
    await db.put('books', {
      id: 'imported',
      title: '已导入',
      lastEdited: new Date(),
      createdAt: new Date(),
    });
    await ImportRepository.deleteTask(a.id);
    expect(await ImportRepository.getTask(a.id)).toBeUndefined();
    expect((await ImportRepository.listSources(a.id, {})).items).toEqual([]);
    expect((await ImportRepository.listSources(b.id, {})).items).toHaveLength(1);
    expect(await db.get('books', 'imported')).toBeDefined();
  });

  it('步骤原子保存资源、来源状态、工具配对和检查点，刷新不丢记录', async () => {
    const task = await ImportRepository.createTask();
    await ImportRepository.registerSources(task.id, [source(task.id, 's')], []);
    await ImportRepository.saveStep(task.id, {
      events: [
        {
          kind: 'tool-call',
          callId: 'call',
          toolName: 'inspect_source',
          data: '{"source_id":"s"}',
        },
      ],
    });
    await ImportRepository.saveStep(task.id, {
      resources: [
        {
          id: 'snap',
          taskId: task.id,
          sourceId: 's',
          kind: 'snapshot',
          blob: new Blob(['小说']),
          digest: 'digest',
          createdAt: 1,
        },
      ],
      sources: [{ ...source(task.id, 's'), currentSnapshotId: 'snap', status: 'inspected' }],
      events: [
        {
          kind: 'tool-result',
          callId: 'call',
          toolName: 'inspect_source',
          data: { success: true, snapshotId: 'snap' },
        },
      ],
      checkpoint: { messages: [], remainingCalls: [], completedCallIds: ['call'] },
      state: 'paused',
    });
    await __resetDbPromiseForTesting();
    const saved = await ImportRepository.getTask(task.id);
    expect(saved?.checkpoint?.completedCallIds).toEqual(['call']);
    expect(saved?.state).toBe('paused');
    expect((await ImportRepository.getSource(task.id, 's')).currentSnapshotId).toBe('snap');
    const page = await ImportRepository.listEvents(task.id, { limit: 1 });
    expect(page.items[0]?.kind).toBe('tool-call');
    expect(
      (await ImportRepository.listEvents(task.id, { afterSequence: page.items[0]?.sequence }))
        .items[0]?.kind,
    ).toBe('tool-result');
  });

  it('拒绝不完整工具 JSON 和无调用的结果，不允许记录先于资源失败单独提交', async () => {
    const task = await ImportRepository.createTask();
    await ImportRepository.registerSources(task.id, [source(task.id, 's')], []);
    await expect(
      ImportRepository.saveStep(task.id, {
        events: [
          { kind: 'tool-call', callId: 'call', toolName: 'extract_content', data: '{"source_id":' },
        ],
      }),
    ).rejects.toThrow('INCOMPLETE_TOOL_CALL');
    await expect(
      ImportRepository.saveStep(task.id, {
        resources: [
          {
            id: 'would-rollback',
            taskId: task.id,
            sourceId: 's',
            kind: 'input',
            blob: new Blob(['x']),
            createdAt: 1,
          },
        ],
        events: [{ kind: 'tool-result', callId: 'missing', toolName: 'extract_content', data: {} }],
      }),
    ).rejects.toThrow('TOOL_PAIR');
    expect(await ImportRepository.getResource(task.id, 'would-rollback')).toBeUndefined();
    expect((await ImportRepository.listEvents(task.id, {})).items).toHaveLength(0);
  });

  it('暂停后的旧运行结果不能保存，存储失败向调用者报告并回滚状态', async () => {
    const task = await ImportRepository.createTask();
    const run = { taskId: task.id, runId: 'run', runEpoch: 1, modelId: 'm' };
    const db = await getDB();
    await db.put('import-tasks', { ...task, run, runEpoch: 1, state: 'paused' });
    await expect(
      ImportRepository.saveStep(task.id, { run, events: [{ kind: 'progress', data: '迟到' }] }),
    ).rejects.toThrow('RUN_STALE');
    // 存储层真实 structured-clone 失败，不能提前把任务状态置为成功。
    await expect(
      ImportRepository.saveStep(task.id, {
        state: 'failed',
        events: [{ kind: 'progress', data: () => '不可存储' }],
      }),
    ).rejects.toThrow();
    expect((await ImportRepository.getTask(task.id))?.state).toBe('paused');
    expect((await ImportRepository.listEvents(task.id, {})).items).toHaveLength(0);
  });
});
