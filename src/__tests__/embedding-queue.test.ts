/* eslint-disable @typescript-eslint/require-await */
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import './setup';
import { createPinia, setActivePinia } from 'pinia';

import { EmbeddingQueue } from 'src/services/embedding-queue';
import { EmbeddingService, MODEL_VERSION } from 'src/services/embedding-service';
import { MemoryService } from 'src/services/memory-service';
import { ChapterEmbeddingService } from 'src/services/chapter-embedding-service';
import { useSettingsStore } from 'src/stores/settings';
import type { Memory } from 'src/models/memory';

function makeMemory(id: string, overrides: Partial<Memory> = {}): Memory {
  const mem: Memory = {
    id,
    bookId: overrides.bookId ?? 'book-1',
    content: overrides.content ?? `content-${id}`,
    summary: overrides.summary ?? `summary-${id}`,
    createdAt: overrides.createdAt ?? 1,
    lastAccessedAt: overrides.lastAccessedAt ?? 1,
  };
  if (overrides.embedding !== undefined) mem.embedding = overrides.embedding;
  if (overrides.embeddingModel !== undefined) mem.embeddingModel = overrides.embeddingModel;
  return mem;
}

async function waitForIdle(timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (EmbeddingQueue.isRunning() || EmbeddingQueue.getProgress().pending > 0) {
    if (Date.now() - start > timeoutMs) throw new Error('queue idle wait timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
  // 再让事件循环跑一圈,确保 progress finalizers 完成
  await new Promise((r) => setTimeout(r, 5));
}

describe('EmbeddingQueue - 入队与批处理', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // 总开关默认为 false,测试默认打开以复用既有断言
    useSettingsStore().settings.enableLocalEmbedding = true;
    EmbeddingQueue.__resetForTesting();
    // 默认让 service "已就绪"
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    spyOn(EmbeddingService, 'init').mockResolvedValue(undefined);
  });

  afterEach(() => {
    EmbeddingQueue.__resetForTesting();
    mock.restore();
  });

  test('enqueue 单条后自动处理并写回 embedding', async () => {
    const memoryA = makeMemory('a');
    spyOn(MemoryService, 'getMemoryByIdOnly').mockResolvedValue(memoryA);
    const updateSpy = spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    spyOn(EmbeddingService, 'embedBatch').mockResolvedValue([new Float32Array([0.1, 0.2])]);

    EmbeddingQueue.enqueue('a');
    await waitForIdle();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const call = updateSpy.mock.calls[0]!;
    expect(call[0]).toBe('a');
    const vec = call[1];
    expect(vec).toHaveLength(2);
    expect(vec[0]).toBeCloseTo(0.1, 5);
    expect(vec[1]).toBeCloseTo(0.2, 5);
    expect(call[2]).toBe(MODEL_VERSION);
  });

  test('重复 enqueue 同一 id 不会重复处理', async () => {
    spyOn(MemoryService, 'getMemoryByIdOnly').mockResolvedValue(makeMemory('a'));
    const updateSpy = spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    spyOn(EmbeddingService, 'embedBatch').mockResolvedValue([new Float32Array([0.5])]);

    EmbeddingQueue.enqueue('a');
    EmbeddingQueue.enqueue('a');
    EmbeddingQueue.enqueue('a');
    await waitForIdle();

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  test('按 BATCH_SIZE 切片处理', async () => {
    // 入队 10 条 → 应分 2 批(8 + 2)
    const ids = Array.from({ length: 10 }, (_, i) => `m${i}`);
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) =>
      makeMemory(id),
    );
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);

    const embedBatchSpy = spyOn(EmbeddingService, 'embedBatch').mockImplementation(
      async (texts: string[]) => texts.map(() => new Float32Array([0.1])),
    );

    for (const id of ids) EmbeddingQueue.enqueue(id);
    await waitForIdle();

    expect(embedBatchSpy).toHaveBeenCalledTimes(2);
    // 第一批 8 条,第二批 2 条
    expect((embedBatchSpy.mock.calls[0]?.[0] as string[]).length).toBe(8);
    expect((embedBatchSpy.mock.calls[1]?.[0] as string[]).length).toBe(2);
  });

  test('总开关关闭时:不处理 pending,也不调用 embedBatch', async () => {
    useSettingsStore().settings.enableLocalEmbedding = false;
    const getMemSpy = spyOn(MemoryService, 'getMemoryByIdOnly').mockResolvedValue(makeMemory('a'));
    const embedBatchSpy = spyOn(EmbeddingService, 'embedBatch').mockResolvedValue([
      new Float32Array([0.1]),
    ]);

    EmbeddingQueue.enqueue('a');
    // 给 scheduleRun 一点时间(microtask + 若干 tick)
    await new Promise((r) => setTimeout(r, 30));

    // 总电源关,run 直接退出 → 依赖服务链一个都不该被调用
    expect(embedBatchSpy).not.toHaveBeenCalled();
    expect(getMemSpy).not.toHaveBeenCalled();
    // pending 保留,等用户开总开关后再 resume/scheduleRun 消费
    expect(EmbeddingQueue.getProgress().pending).toBe(1);
  });

  test('cancel 从 pending 中移除并使进度前进', async () => {
    // 阻塞 embedBatch,让队列保持运行中
    let release!: () => void;
    const block = new Promise<void>((r) => {
      release = r;
    });
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) =>
      makeMemory(id),
    );
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    spyOn(EmbeddingService, 'embedBatch').mockImplementation(async (texts: string[]) => {
      await block;
      return texts.map(() => new Float32Array([0.1]));
    });

    // 入队 12 条(8 会被第一个批次抓走,剩 4 在 pending)
    for (let i = 0; i < 12; i++) EmbeddingQueue.enqueue(`m${i}`);

    // 让 run() 开始但在 embedBatch 中阻塞
    await new Promise((r) => setTimeout(r, 5));
    expect(EmbeddingQueue.getProgress().pending).toBe(4);

    EmbeddingQueue.cancel('m10');
    expect(EmbeddingQueue.getProgress().pending).toBe(3);

    // 放开阻塞,让队列收尾
    release();
    await waitForIdle();
  });

  test('pause 阻止新批次启动,resume 恢复处理', async () => {
    const ids = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'];
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) =>
      makeMemory(id),
    );
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    const embedBatchSpy = spyOn(EmbeddingService, 'embedBatch').mockImplementation(
      async (texts: string[]) => texts.map(() => new Float32Array([0.1])),
    );

    // 先暂停,再入队,run 应不被调度
    EmbeddingQueue.pause();
    for (const id of ids) EmbeddingQueue.enqueue(id);

    await new Promise((r) => setTimeout(r, 20));
    expect(embedBatchSpy).toHaveBeenCalledTimes(0);
    expect(EmbeddingQueue.getProgress().pending).toBe(10);

    // resume 后应自动启动处理
    EmbeddingQueue.resume();
    await waitForIdle();
    expect(embedBatchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('单批失败时继续下一批,不中断队列', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `m${i}`);
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) =>
      makeMemory(id),
    );
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);

    let call = 0;
    const embedBatchSpy = spyOn(EmbeddingService, 'embedBatch').mockImplementation(
      async (texts: string[]) => {
        call += 1;
        if (call === 1) throw new Error('first batch crashed');
        return texts.map(() => new Float32Array([0.1]));
      },
    );

    let errorCount = 0;
    const off = EmbeddingQueue.addEventListener('error', () => {
      errorCount += 1;
    });

    for (const id of ids) EmbeddingQueue.enqueue(id);
    await waitForIdle();
    off();

    expect(errorCount).toBe(1);
    // 两批都被尝试处理
    expect(embedBatchSpy.mock.calls.length).toBe(2);
    // completed 应覆盖全部 10 条(失败的也计入进度)
    // 注意:处理完成后 completed 会被 reset,所以用入队数 vs 处理调用数
  });

  test('进度事件包含 total/completed/pending 字段', async () => {
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) =>
      makeMemory(id),
    );
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    spyOn(EmbeddingService, 'embedBatch').mockResolvedValue([new Float32Array([0.1])]);

    const snapshots: Array<ReturnType<typeof EmbeddingQueue.getProgress>> = [];
    const off = EmbeddingQueue.addEventListener('progress', (e) => {
      snapshots.push(e.detail as ReturnType<typeof EmbeddingQueue.getProgress>);
    });

    EmbeddingQueue.enqueue('m1');
    await waitForIdle();
    off();

    expect(snapshots.length).toBeGreaterThan(0);
    const first = snapshots[0]!;
    expect(first).toHaveProperty('total');
    expect(first).toHaveProperty('completed');
    expect(first).toHaveProperty('pending');
    expect(first).toHaveProperty('running');
    expect(first).toHaveProperty('paused');
  });

  test('enqueueBacklog 只入队需要嵌入的记忆', async () => {
    const memories = [
      makeMemory('ok', {
        embedding: [0.1, 0.2],
        embeddingModel: MODEL_VERSION,
      }),
      makeMemory('missing'),
      makeMemory('stale', {
        embedding: [0.3],
        embeddingModel: 'old-model@128',
      }),
    ];
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue(memories);
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) =>
      memories.find((m) => m.id === id) ?? null,
    );
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    const embedBatchSpy = spyOn(EmbeddingService, 'embedBatch').mockImplementation(
      async (texts: string[]) => texts.map(() => new Float32Array([0.5])),
    );

    const added = await EmbeddingQueue.enqueueBacklog('book-1');
    expect(added).toBe(2);
    await waitForIdle();

    // 只有 missing 和 stale 被送进 embedBatch
    const callTexts = (embedBatchSpy.mock.calls[0]?.[0] as string[]) ?? [];
    expect(callTexts).toHaveLength(2);
  });

  test('EmbeddingService 未就绪时清空处理但保留 pending', async () => {
    (EmbeddingService.isReady as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(false);
    (EmbeddingService.init as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(undefined);

    EmbeddingQueue.enqueue('a');
    // 等待 run() 完成其未就绪分支
    await new Promise((r) => setTimeout(r, 20));

    expect(EmbeddingQueue.isRunning()).toBe(false);
    // pending 仍保留,等下次 service 就绪再处理
    expect(EmbeddingQueue.getProgress().pending).toBe(1);
  });
});

describe('EmbeddingQueue - chapter kind', () => {
  beforeEach(() => {
    EmbeddingQueue.__resetForTesting();
    spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
    spyOn(EmbeddingService, 'init').mockResolvedValue(undefined);
  });

  afterEach(() => {
    EmbeddingQueue.__resetForTesting();
    mock.restore();
  });

  test('enqueueChapter 入队后调用 ChapterEmbeddingService.embedChapter', async () => {
    const embedSpy = spyOn(ChapterEmbeddingService, 'embedChapter').mockResolvedValue(undefined);

    EmbeddingQueue.enqueueChapter('ch-1');
    await waitForIdle();

    expect(embedSpy).toHaveBeenCalledTimes(1);
    expect(embedSpy.mock.calls[0]?.[0]).toBe('ch-1');
  });

  test('重复 enqueueChapter 同一 id 不会重复处理', async () => {
    const embedSpy = spyOn(ChapterEmbeddingService, 'embedChapter').mockResolvedValue(undefined);

    EmbeddingQueue.enqueueChapter('ch-dup');
    EmbeddingQueue.enqueueChapter('ch-dup');
    EmbeddingQueue.enqueueChapter('ch-dup');
    await waitForIdle();

    expect(embedSpy).toHaveBeenCalledTimes(1);
  });

  test('cancelChapter 从 pending 中移除', async () => {
    // 阻塞 embedChapter 让队列保持运行
    let release!: () => void;
    const block = new Promise<void>((r) => {
      release = r;
    });
    spyOn(ChapterEmbeddingService, 'embedChapter').mockImplementation(async () => {
      await block;
    });

    EmbeddingQueue.enqueueChapter('ch-0');
    EmbeddingQueue.enqueueChapter('ch-1');
    EmbeddingQueue.enqueueChapter('ch-2');

    await new Promise((r) => setTimeout(r, 5));
    // ch-0 被取走正在处理,ch-1 / ch-2 在 pending
    expect(EmbeddingQueue.getProgress().breakdown.chapter.pending).toBe(2);

    EmbeddingQueue.cancelChapter('ch-1');
    expect(EmbeddingQueue.getProgress().breakdown.chapter.pending).toBe(1);

    release();
    await waitForIdle();
  });

  test('chapter 与 memory 混合入队时 memory 合批,chapter 单独处理', async () => {
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) =>
      makeMemory(id),
    );
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    const embedBatchSpy = spyOn(EmbeddingService, 'embedBatch').mockResolvedValue([
      new Float32Array([0.1]),
    ]);
    const embedChapterSpy = spyOn(ChapterEmbeddingService, 'embedChapter').mockResolvedValue(
      undefined,
    );

    // chapter 在前,memory 在后,memory 应独立合批
    EmbeddingQueue.enqueueChapter('ch-A');
    EmbeddingQueue.enqueueMemory('m1');
    EmbeddingQueue.enqueueMemory('m2');
    EmbeddingQueue.enqueueChapter('ch-B');
    EmbeddingQueue.enqueueMemory('m3');

    await waitForIdle();

    // chapter 各处理一次(两次)
    expect(embedChapterSpy).toHaveBeenCalledTimes(2);
    // memory 之间被合批,而 ch-B 隔开第一批和第三批:ch-A → [m1,m2] → ch-B → [m3]
    expect(embedBatchSpy).toHaveBeenCalledTimes(2);
    expect((embedBatchSpy.mock.calls[0]?.[0] as string[]).length).toBe(2);
    expect((embedBatchSpy.mock.calls[1]?.[0] as string[]).length).toBe(1);
  });

  test('breakdown 字段分别统计 memory / chapter', async () => {
    // 阻塞两类处理
    let release!: () => void;
    const block = new Promise<void>((r) => {
      release = r;
    });
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) =>
      makeMemory(id),
    );
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    spyOn(EmbeddingService, 'embedBatch').mockImplementation(async (texts: string[]) => {
      await block;
      return texts.map(() => new Float32Array([0.1]));
    });
    spyOn(ChapterEmbeddingService, 'embedChapter').mockImplementation(async () => {
      await block;
    });

    EmbeddingQueue.enqueueMemory('m1');
    EmbeddingQueue.enqueueMemory('m2');
    EmbeddingQueue.enqueueChapter('ch-1');
    EmbeddingQueue.enqueueChapter('ch-2');

    const progress = EmbeddingQueue.getProgress();
    expect(progress.breakdown.memory.total).toBe(2);
    expect(progress.breakdown.chapter.total).toBe(2);
    expect(progress.breakdown.memory.pending + progress.breakdown.chapter.pending).toBe(4);

    release();
    await waitForIdle();
  });

  test('enqueueChapterBacklog 只入队需要嵌入的章节', async () => {
    spyOn(ChapterEmbeddingService, 'findChaptersNeedingEmbedding').mockResolvedValue([
      'ch-need-1',
      'ch-need-2',
    ]);
    const embedSpy = spyOn(ChapterEmbeddingService, 'embedChapter').mockResolvedValue(undefined);

    const added = await EmbeddingQueue.enqueueChapterBacklog('book-1');
    expect(added).toBe(2);
    await waitForIdle();

    expect(embedSpy).toHaveBeenCalledTimes(2);
    const calledIds = (embedSpy.mock.calls.map((c) => c[0]) as string[]).sort();
    expect(calledIds).toEqual(['ch-need-1', 'ch-need-2']);
  });

  test('enqueueChapterBacklog 已在 pending 中的 id 不重复入队', async () => {
    spyOn(ChapterEmbeddingService, 'findChaptersNeedingEmbedding').mockResolvedValue([
      'ch-A',
      'ch-B',
    ]);
    spyOn(ChapterEmbeddingService, 'embedChapter').mockResolvedValue(undefined);

    // 先暂停队列,手动入队 ch-A,此时 ch-A 在 pending 中
    EmbeddingQueue.pause();
    EmbeddingQueue.enqueueChapter('ch-A');
    expect(EmbeddingQueue.getProgress().breakdown.chapter.pending).toBe(1);

    // backlog 扫描发现 ch-A 已在 pending,只应新增 ch-B
    const added = await EmbeddingQueue.enqueueChapterBacklog('book-1');
    expect(added).toBe(1);
    expect(EmbeddingQueue.getProgress().breakdown.chapter.pending).toBe(2);

    EmbeddingQueue.resume();
    await waitForIdle();
  });

  test('不同 bookId 的 memory 不会合批', async () => {
    spyOn(MemoryService, 'getMemoryByIdOnly').mockImplementation(async (id: string) => {
      // m1,m2 属于 book-1;m3,m4 属于 book-2
      const bookId = id === 'm1' || id === 'm2' ? 'book-1' : 'book-2';
      return makeMemory(id, { bookId });
    });
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);
    const embedBatchSpy = spyOn(EmbeddingService, 'embedBatch').mockImplementation(
      async (texts: string[]) => texts.map(() => new Float32Array([0.1])),
    );

    // 交叉入队 —— 应被切成两批(book-1 的 [m1,m2] 和 book-2 的 [m3,m4])
    EmbeddingQueue.enqueueMemory('m1');
    EmbeddingQueue.enqueueMemory('m2');
    EmbeddingQueue.enqueueMemory('m3');
    EmbeddingQueue.enqueueMemory('m4');

    await waitForIdle();

    // 两批,每批各自包含同书的两条
    expect(embedBatchSpy).toHaveBeenCalledTimes(2);
    const batch1 = embedBatchSpy.mock.calls[0]?.[0] as string[];
    const batch2 = embedBatchSpy.mock.calls[1]?.[0] as string[];
    expect(batch1.length).toBe(2);
    expect(batch2.length).toBe(2);
  });

  test('enqueue 传入 bookId 后 currentTask 暴露该 bookId', async () => {
    spyOn(MemoryService, 'getMemoryByIdOnly').mockResolvedValue(makeMemory('m1', { bookId: 'book-X' }));
    spyOn(MemoryService, 'updateMemoryEmbeddingOnly').mockResolvedValue(undefined);

    let releaseBatch!: () => void;
    const block = new Promise<void>((r) => {
      releaseBatch = r;
    });
    spyOn(EmbeddingService, 'embedBatch').mockImplementation(async (texts: string[]) => {
      await block;
      return texts.map(() => new Float32Array([0.1]));
    });

    const seenTasks: Array<{ bookId: string | null; kind: string }> = [];
    const off = EmbeddingQueue.addEventListener('progress', (e) => {
      const task = (e.detail as { currentTask?: { bookId: string | null; kind: string } })
        ?.currentTask;
      if (task) seenTasks.push({ bookId: task.bookId, kind: task.kind });
    });

    EmbeddingQueue.enqueueMemory('m1', 'book-X');
    // 等调度跑起来
    await new Promise((r) => setTimeout(r, 20));

    expect(seenTasks.length).toBeGreaterThan(0);
    expect(seenTasks[0]!.bookId).toBe('book-X');
    expect(seenTasks[0]!.kind).toBe('memory');

    releaseBatch();
    await waitForIdle();
    off();

    // 队列空后 currentTask 应被清空
    expect(EmbeddingQueue.getProgress().currentTask).toBeNull();
  });

  test('chapter 批失败不影响后续队列', async () => {
    spyOn(ChapterEmbeddingService, 'embedChapter').mockImplementation(async (id: string) => {
      if (id === 'ch-bad') throw new Error('boom');
    });

    let errorCount = 0;
    const off = EmbeddingQueue.addEventListener('error', () => {
      errorCount += 1;
    });

    EmbeddingQueue.enqueueChapter('ch-bad');
    EmbeddingQueue.enqueueChapter('ch-good');
    await waitForIdle();
    off();

    expect(errorCount).toBe(1);
    // 两个 chapter 都被尝试处理
    expect(EmbeddingQueue.getProgress().pending).toBe(0);
  });
});
