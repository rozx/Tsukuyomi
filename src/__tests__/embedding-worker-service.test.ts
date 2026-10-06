import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingService, DIMENSIONS, MODEL_VERSION } from '../services/embedding-service';

const renderer = vi.hoisted(() => ({
  pipeline: vi.fn(() =>
    Promise.resolve(() => Promise.resolve({ data: new Float32Array(384), dims: [1, 384] })),
  ),
}));
vi.mock('@huggingface/transformers', () => renderer);

interface Request {
  id: number;
  generation: number;
  action: string;
  texts?: string[];
  task?: string;
  priority?: string;
}
class FakeWorker {
  static instances: FakeWorker[] = [];
  static autoLifecycle = true;
  static autoEmbed = true;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  requests: Request[] = [];
  terminated = false;
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
  }
  terminate() {
    this.terminated = true;
  }
  send(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
  result(request: Request, data: unknown) {
    this.send({
      kind: 'response',
      id: request.id,
      generation: request.generation,
      success: true,
      data,
    });
  }
  postMessage(request: Request) {
    this.requests.push(request);
    queueMicrotask(() => {
      if (FakeWorker.autoLifecycle && (request.action === 'init' || request.action === 'reload')) {
        this.send({
          kind: 'event',
          generation: request.generation,
          event: 'ready',
          detail: { modelVersion: MODEL_VERSION, backend: 'webgpu' },
        });
        this.result(request, { status: 'ready', backend: 'webgpu', error: null });
      }
      if (FakeWorker.autoEmbed && request.action === 'embed') {
        const vectors =
          request.texts?.map((text) => {
            if (!text.trim()) return null;
            const vector = new Float32Array(DIMENSIONS);
            vector[0] = 0.6;
            vector[1] = 0.8;
            return vector;
          }) ?? [];
        this.result(request, vectors);
      }
    });
  }
}
beforeEach(() => {
  EmbeddingService.__resetForTesting();
  FakeWorker.instances = [];
  FakeWorker.autoLifecycle = true;
  FakeWorker.autoEmbed = true;
  renderer.pipeline.mockClear();
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  EmbeddingService.__resetForTesting();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('浏览器嵌入 Worker 接口', () => {
  it('并发初始化只创建一个模块 Worker，页面线程从不加载模型', async () => {
    await Promise.all([EmbeddingService.init(), EmbeddingService.init(), EmbeddingService.init()]);
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0]!;
    expect(worker.url.pathname).toContain('embedding.worker');
    expect(worker.options.type).toBe('module');
    expect(worker.requests.filter((r) => r.action === 'init')).toHaveLength(1);
    expect(renderer.pipeline).not.toHaveBeenCalled();
    expect(EmbeddingService.isReady()).toBe(true);
    expect(EmbeddingService.getActiveBackend()).toBe('webgpu');
  });

  it('单条和批量请求保留文档任务、查询优先级、空位及归一化向量', async () => {
    await EmbeddingService.init();
    expect(FakeWorker.instances).toHaveLength(1);
    const vectors = await EmbeddingService.embedBatch(
      ['内容', '', '另一个段落'],
      'document',
      'query',
    );
    expect(vectors[0]?.length).toBe(DIMENSIONS);
    expect(vectors[1]).toBeNull();
    expect(vectors[0]?.[0]).toBeCloseTo(0.6);
    expect(vectors[0]?.[1]).toBeCloseTo(0.8);
    expect(FakeWorker.instances[0]!.requests.at(-1)).toMatchObject({
      action: 'embed',
      task: 'document',
      priority: 'query',
      texts: ['内容', '', '另一个段落'],
    });
    expect(await EmbeddingService.embed('内容', 'query')).toEqual(vectors[0]);
    expect(renderer.pipeline).not.toHaveBeenCalled();
  });

  it('Worker 崩溃时结束所有等待请求，标记失败并允许重新加载', async () => {
    await EmbeddingService.init();
    expect(FakeWorker.instances).toHaveLength(1);
    FakeWorker.autoEmbed = false;
    const pending = EmbeddingService.embedBatch(['后台内容'], 'document');
    const worker = FakeWorker.instances[0]!;
    worker.onerror?.(new ErrorEvent('error', { message: 'worker crashed' }));
    expect(await pending).toEqual([null]);
    expect(EmbeddingService.getStatus()).toBe('failed');
    expect(EmbeddingService.getLastError()?.message).toContain('worker crashed');
    expect(worker.terminated).toBe(true);
    await EmbeddingService.reload();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(EmbeddingService.isReady()).toBe(true);
  });

  it('重载使旧请求失效，旧向量与 ready 事件不能覆盖新状态', async () => {
    await EmbeddingService.init();
    expect(FakeWorker.instances).toHaveLength(1);
    FakeWorker.autoEmbed = false;
    const pending = EmbeddingService.embed('旧查询', 'query');
    const worker = FakeWorker.instances[0]!;
    const old = worker.requests.at(-1)!;
    await EmbeddingService.reload();
    expect(await pending).toBeNull();
    worker.send({
      kind: 'event',
      generation: old.generation,
      event: 'status-changed',
      detail: { status: 'failed' },
    });
    worker.result(old, [new Float32Array(DIMENSIONS)]);
    expect(EmbeddingService.isReady()).toBe(true);
    expect(EmbeddingService.getActiveBackend()).toBe('webgpu');
  });

  it('初始化未结束时重新加载可终止旧 Worker，并等待新初始化', async () => {
    FakeWorker.autoLifecycle = false;
    const oldInit = EmbeddingService.init();
    expect(FakeWorker.instances).toHaveLength(1);
    const oldWorker = FakeWorker.instances[0]!;
    FakeWorker.autoLifecycle = true;
    await EmbeddingService.reload();
    await oldInit;
    expect(oldWorker.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(EmbeddingService.isReady()).toBe(true);
  });

  it('无法创建 Worker 时明确降级失败，不回到页面线程偷偷推理', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('worker blocked');
        }
      },
    );
    await EmbeddingService.init();
    expect(EmbeddingService.getStatus()).toBe('failed');
    expect(EmbeddingService.getLastError()?.message).toContain('worker blocked');
    expect(renderer.pipeline).not.toHaveBeenCalled();
    expect(await EmbeddingService.embed('查询', 'query')).toBeNull();
  });
});
