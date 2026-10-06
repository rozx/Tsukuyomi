/* eslint-disable @typescript-eslint/require-await */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';

// ============================================================================
// Mock @huggingface/transformers
// ============================================================================
// 必须在 import EmbeddingService 之前 mock,确保动态 import 命中 mock 版本
let mockPipelineImpl: ((input: unknown, options?: unknown) => Promise<unknown>) | null = null;
let mockPipelineFactory:
  | ((task: string, model: string, options: unknown) => Promise<unknown>)
  | null = null;

mock.module('@huggingface/transformers', () => ({
  env: { backends: { onnx: { wasm: {} } } },
  pipeline: (task: string, model: string, options: unknown) => {
    if (mockPipelineFactory) return mockPipelineFactory(task, model, options);
    return Promise.resolve((input: unknown, opts?: unknown) => {
      if (mockPipelineImpl) return mockPipelineImpl(input, opts);
      throw new Error('pipeline impl not set');
    });
  },
}));

// 必须在 mock 之后 import
import { EmbeddingRuntime as EmbeddingService } from '../services/embedding-runtime';
import {
  EmbeddingService as RendererEmbeddingService,
  MODEL_VERSION,
  DIMENSIONS,
} from '../services/embedding-service';
import { MODEL_ID } from '../services/embedding-service';
import { vi } from 'vitest';

function makeFloat32(values: number[]): Float32Array {
  return new Float32Array(values);
}

/**
 * 构造 Bekko 原生已池化输出:形状 [batch, 384]。
 * 前几维为 fill,其余为 0。
 */
function fakePooledOutput(batch: number, fill: number) {
  const hidden = 384;
  const data = new Float32Array(batch * hidden);
  for (let b = 0; b < batch; b++) {
    for (let i = 0; i < hidden; i++) {
      data[b * hidden + i] = i < 10 ? fill + i * 0.01 : 0;
    }
  }
  return {
    data,
    dims: [batch, hidden],
  };
}

describe('EmbeddingService - 懒加载与状态', () => {
  beforeEach(() => {
    EmbeddingService.__resetForTesting();
    mockPipelineImpl = null;
    mockPipelineFactory = null;
  });

  afterEach(() => {
    EmbeddingService.__resetForTesting();
  });

  test('单条与批量查询共享正在计算及已完成的向量，文档推理独立', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    mockPipelineImpl = async (input) => {
      calls += 1;
      entered.resolve();
      await release.promise;
      return fakePooledOutput(Array.isArray(input) ? input.length : 1, 0.5);
    };
    await EmbeddingService.init();
    const first = EmbeddingService.embed('共享查询', 'query');
    await entered.promise;
    const second = EmbeddingService.embedBatch(['共享查询', '共享查询'], 'query');
    release.resolve();
    const [vector, batch] = await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(batch).toEqual([vector, vector]);
    expect(await EmbeddingService.embed('共享查询', 'query')).toEqual(vector);
    expect(calls).toBe(1);
    await EmbeddingService.embed('共享查询', 'document');
    expect(calls).toBe(2);
    await EmbeddingService.reload();
    await EmbeddingService.embed('共享查询', 'query');
    expect(calls).toBe(3);
  });

  test('前台查询优先于等待中的后台推理，模型调用不会重叠', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const inputs: string[] = [];
    let active = 0;
    let peak = 0;
    mockPipelineImpl = async (input) => {
      const text = String(input);
      inputs.push(text);
      active += 1;
      peak = Math.max(peak, active);
      if (text === '后台一') {
        entered.resolve();
        await release.promise;
      }
      active -= 1;
      return fakePooledOutput(1, 0.5);
    };
    await EmbeddingService.init();
    const first = EmbeddingService.embed('后台一', 'document');
    await entered.promise;
    const second = EmbeddingService.embed('后台二', 'document');
    const query = EmbeddingService.embed('前台查询', 'query');
    release.resolve();
    await Promise.all([first, second, query]);
    expect(peak).toBe(1);
    expect(inputs).toEqual(['后台一', '前台查询', '后台二']);
  });

  test('前台重排的文档批次复用缓存，并与查询文本的缓存隔离', async () => {
    let calls = 0;
    mockPipelineImpl = async (input) => {
      calls += 1;
      return fakePooledOutput(Array.isArray(input) ? input.length : 1, 0.5);
    };
    await EmbeddingService.init();
    const first = await EmbeddingService.embedBatch(['关键段落', '关键段落'], 'document', 'query');
    expect(first[0]).toEqual(first[1]);
    await EmbeddingService.embedBatch(['关键段落'], 'document', 'query');
    expect(calls).toBe(1);
    await EmbeddingService.embed('关键段落', 'query');
    expect(calls).toBe(2);
    await EmbeddingService.embedBatch(['关键段落'], 'document');
    expect(calls).toBe(3);
  });

  test('文档重排优先于等待中的后台批次，任务输入仍按文档处理', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const inputs: string[] = [];
    mockPipelineImpl = async (input) => {
      const text = String(input);
      inputs.push(text);
      if (text === '后台一') {
        entered.resolve();
        await release.promise;
      }
      return fakePooledOutput(1, 0.5);
    };
    await EmbeddingService.init();
    const first = EmbeddingService.embed('后台一', 'document');
    await entered.promise;
    const second = EmbeddingService.embed('后台二', 'document');
    const rerank = EmbeddingService.embedBatch(['关键段落'], 'document', 'query');
    release.resolve();
    await Promise.all([first, second, rerank]);
    expect(inputs).toEqual(['后台一', '关键段落', '后台二']);
  });

  test('一轮最大规模的段落重排能完整缓存，重复查询不会逐批淘汰而全部重新推理', async () => {
    let calls = 0;
    mockPipelineImpl = async (input) => {
      calls += 1;
      return fakePooledOutput(Array.isArray(input) ? input.length : 1, 0.5);
    };
    await EmbeddingService.init();
    const texts = Array.from({ length: 192 }, (_, index) => `章节关键段落 ${index}`);
    for (let round = 0; round < 2; round++) {
      for (let offset = 0; offset < texts.length; offset += 8) {
        await EmbeddingService.embedBatch(texts.slice(offset, offset + 8), 'document', 'query');
      }
    }
    expect(calls).toBe(24);
  });

  test('失败的查询向量不会占据缓存，下一次请求可以重试', async () => {
    let calls = 0;
    mockPipelineImpl = async () => {
      if (++calls === 1) throw new Error('temporary inference failure');
      return fakePooledOutput(1, 0.5);
    };
    await EmbeddingService.init();
    expect(await EmbeddingService.embed('重试查询', 'query')).toBeNull();
    expect(await EmbeddingService.embed('重试查询', 'query')).not.toBeNull();
    expect(calls).toBe(2);
  });

  test('后台批次即使队列曾清空，也要留出计算预算空档', async () => {
    const calls: string[] = [];
    mockPipelineImpl = async (input) => {
      calls.push(String(input));
      await new Promise((resolve) => setTimeout(resolve, 20));
      return fakePooledOutput(1, 0.5);
    };
    await EmbeddingService.init();
    vi.useFakeTimers();
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    try {
      const first = EmbeddingService.embed('后台一', 'document');
      await vi.advanceTimersByTimeAsync(20);
      await first;
      const second = EmbeddingService.embed('后台二', 'document');
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toEqual(['后台一']);
      await vi.advanceTimersByTimeAsync(50);
      await second;
      expect(calls).toEqual(['后台一', '后台二']);
    } finally {
      clock.mockRestore();
      vi.useRealTimers();
    }
  });

  test('后台长短文本按长度分组并还原输入顺序，不让短文本陪长文本填充', async () => {
    const batches: string[][] = [];
    mockPipelineImpl = async (input) => {
      const texts = input as string[];
      batches.push(texts);
      const data = new Float32Array(texts.length * DIMENSIONS);
      texts.forEach((text, index) => {
        data[index * DIMENSIONS] = 1;
        data[index * DIMENSIONS + 1] = text.length;
      });
      return { data, dims: [texts.length, DIMENSIONS] };
    };
    await EmbeddingService.init();
    const texts = ['短甲', '长'.repeat(1800), '短乙', '大'.repeat(1500), '短丙'];
    const vectors = await EmbeddingService.embedBatch(texts, 'document');
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every((batch) => batch.length <= 4)).toBe(true);
    expect(
      batches
        .filter((batch) => batch.some((text) => text.length > 1200))
        .every((batch) => batch.length === 1),
    ).toBe(true);
    texts.forEach((text, index) =>
      expect(vectors[index]![1]! / vectors[index]![0]!).toBeCloseTo(text.length, 2),
    );
  });

  test('重新加载等待已有推理退出，并释放旧模型实例', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let active = false;
    const dispose = vi.fn(async () => {
      expect(active).toBe(false);
    });
    mockPipelineFactory = async () =>
      Object.assign(
        async () => {
          active = true;
          entered.resolve();
          await release.promise;
          active = false;
          return fakePooledOutput(1, 0.5);
        },
        { dispose },
      );
    await EmbeddingService.init();
    const pending = EmbeddingService.embed('工作中', 'document');
    await entered.promise;
    const reload = EmbeddingService.reload();
    expect(dispose).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([pending, reload]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('重载会取消旧批次尚未执行的分组，不再调用已释放的模型', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const oldModel = vi.fn(async (input: unknown) => {
      entered.resolve();
      await release.promise;
      return fakePooledOutput((input as string[]).length, 0.5);
    });
    const dispose = vi.fn(() => Promise.resolve());
    let created = 0;
    mockPipelineFactory = async () => {
      if (++created === 1) return Object.assign(oldModel, { dispose });
      return async (input: unknown) => fakePooledOutput((input as string[]).length, 0.5);
    };
    await EmbeddingService.init();
    const pending = EmbeddingService.embedBatch(
      Array.from({ length: 8 }, (_, index) => `旧分组 ${index}`),
      'document',
    );
    await entered.promise;
    const reload = EmbeddingService.reload();
    release.resolve();
    const [vectors] = await Promise.all([pending, reload]);
    expect(oldModel).toHaveBeenCalledTimes(1);
    expect(vectors.slice(4)).toEqual([null, null, null, null]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(EmbeddingService.isReady()).toBe(true);
  });

  test('初始状态为 idle,isReady=false', () => {
    expect(EmbeddingService.getStatus()).toBe('idle');
    expect(EmbeddingService.isReady()).toBe(false);
  });

  test('init() 成功后状态切换到 ready', async () => {
    mockPipelineImpl = async () => fakePooledOutput(1, 0.5);
    await EmbeddingService.init();

    expect(EmbeddingService.getStatus()).toBe('ready');
    expect(EmbeddingService.isReady()).toBe(true);
  });

  test('Bekko 在 WebGPU 和 WASM 都加载官方默认压缩 ONNX 文件', async () => {
    const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
    const loaded: Array<{ model: string; config: Record<string, unknown> }> = [];
    mockPipelineFactory = async (_task, model, options) => {
      loaded.push({ model, config: options as Record<string, unknown> });
      return async () => fakePooledOutput(1, 0.5);
    };
    try {
      for (const gpu of [
        undefined,
        {
          requestAdapter: () =>
            Promise.resolve({ requestDevice: () => Promise.resolve({ destroy() {} }) }),
        },
      ]) {
        Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
        if (gpu === undefined) delete (navigator as Navigator & { gpu?: unknown }).gpu;
        EmbeddingService.__resetForTesting();
        await EmbeddingService.init();
      }
      expect(loaded.map((entry) => entry.model)).toEqual([
        'hotchpotch/bekko-embedding-v1-a25m',
        'hotchpotch/bekko-embedding-v1-a25m',
      ]);
      expect(loaded.map((entry) => entry.config)).toEqual([
        expect.objectContaining({ device: 'wasm', dtype: 'fp32' }),
        expect.objectContaining({ device: 'webgpu', dtype: 'fp32' }),
      ]);
    } finally {
      if (originalGpu) Object.defineProperty(navigator, 'gpu', originalGpu);
      else delete (navigator as Navigator & { gpu?: unknown }).gpu;
    }
  });

  test('浏览器暴露 WebGPU 但拿不到适配器时，直接加载 WASM 而不污染运行时初始化链', async () => {
    const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
    const backends: unknown[] = [];
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: () => Promise.resolve(null) },
    });
    mockPipelineFactory = async (_task, _model, options) => {
      const device = (options as Record<string, unknown>).device;
      backends.push(device);
      if (device === 'webgpu') throw new Error('poisoned runtime initialization chain');
      return async () => fakePooledOutput(1, 0.5);
    };
    try {
      await EmbeddingService.init();
      expect(backends).toEqual(['wasm']);
      expect(EmbeddingService.getActiveBackend()).toBe('wasm');
      expect(EmbeddingService.isReady()).toBe(true);
    } finally {
      if (originalGpu) Object.defineProperty(navigator, 'gpu', originalGpu);
      else delete (navigator as Navigator & { gpu?: unknown }).gpu;
    }
  });

  test('GPU 适配器存在但驱动无法创建设备时直接使用 WASM', async () => {
    const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: () =>
          Promise.resolve({
            requestDevice: () => Promise.reject(new Error('GPU device unavailable')),
          }),
      },
    });
    const backends: unknown[] = [];
    mockPipelineFactory = async (_task, _model, options) => {
      backends.push((options as Record<string, unknown>).device);
      return async () => fakePooledOutput(1, 0.5);
    };
    try {
      await EmbeddingService.init();
      expect(backends).toEqual(['wasm']);
      expect(EmbeddingService.getActiveBackend()).toBe('wasm');
    } finally {
      if (originalGpu) Object.defineProperty(navigator, 'gpu', originalGpu);
      else delete (navigator as Navigator & { gpu?: unknown }).gpu;
    }
  });

  test('WebGPU session 失败后 init 等待 WASM 完成，并发调用不重复初始化', async () => {
    const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: () =>
          Promise.resolve({ requestDevice: () => Promise.resolve({ destroy() {} }) }),
      },
    });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const backends: unknown[] = [];
    mockPipelineFactory = async (_task, _model, options) => {
      const device = (options as Record<string, unknown>).device;
      backends.push(device);
      if (device === 'webgpu') throw new Error('GPU session failed');
      entered.resolve();
      await release.promise;
      return async () => fakePooledOutput(1, 0.5);
    };
    let finished = false;
    const first = EmbeddingService.init().then(() => {
      finished = true;
    });
    try {
      await entered.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(finished).toBe(false);
      const second = EmbeddingService.init();
      release.resolve();
      await Promise.all([first, second]);
      expect(backends).toEqual(['webgpu', 'wasm']);
      expect(EmbeddingService.isReady()).toBe(true);
      expect(EmbeddingService.getActiveBackend()).toBe('wasm');
    } finally {
      release.resolve();
      await first;
      if (originalGpu) Object.defineProperty(navigator, 'gpu', originalGpu);
      else delete (navigator as Navigator & { gpu?: unknown }).gpu;
    }
  });

  test('init() 失败时状态切换到 failed,不抛异常', async () => {
    // 禁用重试,避免测试等待延迟
    EmbeddingService.__disableRetryForTesting();
    mockPipelineFactory = async () => {
      throw new Error('download failed');
    };

    await EmbeddingService.init();

    expect(EmbeddingService.getStatus()).toBe('failed');
    expect(EmbeddingService.isReady()).toBe(false);
    expect(EmbeddingService.getLastError()?.message).toContain('download failed');
  });

  test('并发 init() 共享同一 Promise', async () => {
    let callCount = 0;
    mockPipelineFactory = async () => {
      callCount += 1;
      await new Promise((r) => setTimeout(r, 10));
      return async () => fakePooledOutput(1, 0.5);
    };

    await Promise.all([EmbeddingService.init(), EmbeddingService.init(), EmbeddingService.init()]);

    expect(callCount).toBe(1);
    expect(EmbeddingService.getStatus()).toBe('ready');
  });

  test('ready 后再次 init 直接返回', async () => {
    let callCount = 0;
    mockPipelineFactory = async () => {
      callCount += 1;
      return async () => fakePooledOutput(1, 0.5);
    };

    await EmbeddingService.init();
    await EmbeddingService.init();
    expect(callCount).toBe(1);
  });

  test('status-changed 事件在切换时触发', async () => {
    const events: string[] = [];
    const off = EmbeddingService.addEventListener('status-changed', (e) => {
      events.push((e.detail as { status: string }).status);
    });

    mockPipelineImpl = async () => fakePooledOutput(1, 0.5);
    await EmbeddingService.init();

    expect(events).toContain('loading');
    expect(events).toContain('ready');

    off();
  });
});

describe('EmbeddingService - embed / embedBatch', () => {
  beforeEach(() => {
    EmbeddingService.__resetForTesting();
    mockPipelineImpl = null;
    mockPipelineFactory = null;
  });

  afterEach(() => {
    EmbeddingService.__resetForTesting();
  });

  test('embed 返回原生 384 维 L2 归一化向量', async () => {
    mockPipelineImpl = async () => fakePooledOutput(1, 0.5);
    await EmbeddingService.init();

    const vec = await EmbeddingService.embed('测试文本', 'document');
    expect(vec).not.toBeNull();
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec!.length).toBe(DIMENSIONS);

    // L2 归一化校验:∑x² ≈ 1(除非向量全零)
    let norm = 0;
    for (let i = 0; i < vec!.length; i++) norm += vec![i]! * vec![i]!;
    expect(norm).toBeCloseTo(1, 4);
  });

  test('embed 空文本返回 null', async () => {
    mockPipelineImpl = async () => fakePooledOutput(1, 0.5);
    await EmbeddingService.init();
    expect(await EmbeddingService.embed('', 'document')).toBeNull();
    expect(await EmbeddingService.embed('   ', 'document')).toBeNull();
  });

  test('未就绪时 embed 返回 null(不会抛异常)', async () => {
    // 未 init
    const vec = await EmbeddingService.embed('hello', 'document');
    expect(vec).toBeNull();
  });

  test('embed 内部异常时降级为 null', async () => {
    mockPipelineImpl = async () => {
      throw new Error('inference crash');
    };
    await EmbeddingService.init();
    const vec = await EmbeddingService.embed('hello', 'document');
    expect(vec).toBeNull();
  });

  test('embedBatch 返回与输入同长度的数组', async () => {
    mockPipelineImpl = async (input: unknown) => {
      const texts = Array.isArray(input) ? input : [input];
      return fakePooledOutput(texts.length, 0.3);
    };
    await EmbeddingService.init();

    const vecs = await EmbeddingService.embedBatch(['a', 'b', 'c'], 'document');
    expect(vecs).toHaveLength(3);
    vecs.forEach((v) => {
      expect(v).toBeInstanceOf(Float32Array);
      expect(v!.length).toBe(DIMENSIONS);
    });
  });

  test('embedBatch 空文本位置返回 null,其他位置返回向量', async () => {
    mockPipelineImpl = async (input: unknown) => {
      const texts = Array.isArray(input) ? input : [input];
      return fakePooledOutput(texts.length, 0.2);
    };
    await EmbeddingService.init();

    const vecs = await EmbeddingService.embedBatch(['a', '', 'c'], 'document');
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).not.toBeNull();
    expect(vecs[1]).toBeNull();
    expect(vecs[2]).not.toBeNull();
  });

  test('embedBatch 未就绪时全部返回 null', async () => {
    const vecs = await EmbeddingService.embedBatch(['a', 'b'], 'document');
    expect(vecs).toEqual([null, null]);
  });

  test('embed 与 embedBatch 对同一文本 + task 产出一致向量(防 pooling 漂移)', async () => {
    // 回归测试:历史上 embed 用 mean pooling 而 embedBatch 误用 last_token,
    // 导致 query 向量(单条)和 document 向量(批量)落到不同 embedding 空间,
    // 余弦相似度退化成噪声。这里拦截 pipeline 调用,断言两条路径传入的 pooling
    // 选项一致,并且同文本输出向量完全相同。
    const capturedOptions: Array<Record<string, unknown>> = [];
    mockPipelineImpl = async (input: unknown, options?: unknown) => {
      capturedOptions.push((options ?? {}) as Record<string, unknown>);
      const texts = Array.isArray(input) ? (input as string[]) : [input as string];
      const hidden = 384;
      const data = new Float32Array(texts.length * hidden);
      for (let b = 0; b < texts.length; b++) {
        const t = texts[b] ?? '';
        for (let i = 0; i < hidden; i++) {
          data[b * hidden + i] = i < 10 ? (t.length + i) * 0.01 : 0;
        }
      }
      return { data, dims: [texts.length, hidden] };
    };
    await EmbeddingService.init();

    const single = await EmbeddingService.embed('hello world', 'document');
    const batch = await EmbeddingService.embedBatch(['hello world'], 'document');

    expect(single).not.toBeNull();
    expect(batch[0]).not.toBeNull();

    // 两处传入的 pooling 必须一致 — 这是 embedding 空间身份的组成部分
    expect(capturedOptions).toHaveLength(2);
    expect(capturedOptions[0]!.pooling).toBe(capturedOptions[1]!.pooling);
    expect(capturedOptions[0]!.pooling).toBe('mean');

    // 同文本 + 同 task 下,两条路径必须产出完全相同的向量
    expect(batch[0]!.length).toBe(single!.length);
    for (let i = 0; i < single!.length; i++) {
      expect(batch[0]![i]).toBeCloseTo(single![i]!, 6);
    }
  });

  test('query 与 document 都按官方契约直接编码原文', async () => {
    const capturedInputs: string[] = [];
    mockPipelineImpl = async (input: unknown) => {
      const texts = Array.isArray(input) ? (input as string[]) : [input as string];
      capturedInputs.push(...texts);
      const hidden = 384;
      const data = new Float32Array(texts.length * hidden);
      for (let b = 0; b < texts.length; b++) {
        const t = texts[b] ?? '';
        for (let i = 0; i < 10; i++) {
          data[b * hidden + i] = (t.length + i) * 0.01;
        }
      }
      return { data, dims: [texts.length, hidden] };
    };
    await EmbeddingService.init();

    const vQuery = await EmbeddingService.embed('hello', 'query');
    const vDoc = await EmbeddingService.embed('hello', 'document');
    expect(vQuery).not.toBeNull();
    expect(vDoc).not.toBeNull();
    expect(capturedInputs).toEqual(['hello', 'hello']);
    for (let i = 0; i < vQuery!.length; i++) {
      expect(vQuery![i]).toBeCloseTo(vDoc![i]!, 6);
    }
  });
});

describe('EmbeddingService - cosineSimilarity', () => {
  test('相同向量返回 1', () => {
    const v = makeFloat32([0.6, 0.8]);
    expect(RendererEmbeddingService.cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  test('正交向量返回 0', () => {
    expect(
      RendererEmbeddingService.cosineSimilarity(makeFloat32([1, 0]), makeFloat32([0, 1])),
    ).toBeCloseTo(0, 5);
  });

  test('任一为空返回 0', () => {
    expect(RendererEmbeddingService.cosineSimilarity(null, makeFloat32([1, 0]))).toBe(0);
    expect(RendererEmbeddingService.cosineSimilarity(makeFloat32([1, 0]), undefined)).toBe(0);
    expect(RendererEmbeddingService.cosineSimilarity(makeFloat32([]), makeFloat32([1]))).toBe(0);
  });

  test('维度不匹配返回 0', () => {
    expect(
      RendererEmbeddingService.cosineSimilarity(makeFloat32([1, 0]), makeFloat32([1, 0, 0])),
    ).toBe(0);
  });

  test('反向向量 clamp 到 0', () => {
    expect(
      RendererEmbeddingService.cosineSimilarity(makeFloat32([1, 0]), makeFloat32([-1, 0])),
    ).toBe(0);
  });
});

describe('EmbeddingService - 常量', () => {
  test('MODEL_VERSION 与 DIMENSIONS 与 spec 一致', () => {
    expect(MODEL_ID).toBe('hotchpotch/bekko-embedding-v1-a25m');
    expect(MODEL_VERSION).toBe('bekko-embedding-v1-a25m@384@mean@raw');
    expect(DIMENSIONS).toBe(384);
  });
});

describe('EmbeddingService - cleanupLegacyModelCache', () => {
  // 用一个简易的内存 caches 替身替换 globalThis.caches,精确断言删除行为
  type FakeReq = { url: string };
  interface FakeCache {
    name: string;
    entries: FakeReq[];
    keys: () => Promise<FakeReq[]>;
    delete: (req: FakeReq) => Promise<boolean>;
  }

  function installFakeCaches(caches: FakeCache[]): () => void {
    const original = (globalThis as { caches?: unknown }).caches;
    (globalThis as { caches: unknown }).caches = {
      keys: async () => caches.map((c) => c.name),
      open: async (name: string) => {
        const cache = caches.find((c) => c.name === name);
        if (!cache) throw new Error(`cache not found: ${name}`);
        return cache;
      },
    };
    return () => {
      if (original === undefined) delete (globalThis as { caches?: unknown }).caches;
      else (globalThis as { caches: unknown }).caches = original;
    };
  }

  function makeCache(name: string, urls: string[]): FakeCache {
    const entries: FakeReq[] = urls.map((url) => ({ url }));
    return {
      name,
      entries,
      keys: async () => [...entries],
      delete: async (req) => {
        const idx = entries.findIndex((e) => e.url === req.url);
        if (idx < 0) return false;
        entries.splice(idx, 1);
        return true;
      },
    };
  }

  test('仅 Bekko 的完整默认模型缓存可触发预热，旧模型或单独分词器不算', async () => {
    const cache = makeCache('transformers-cache', [
      'https://huggingface.co/onnx-community/gte-multilingual-base/resolve/main/onnx/model_q4f16.onnx',
      'https://huggingface.co/hotchpotch/bekko-embedding-v1-a25m/resolve/main/tokenizer.json',
    ]);
    const restore = installFakeCaches([cache]);
    try {
      expect(await RendererEmbeddingService.isModelCachedInBrowser()).toBe(false);
      cache.entries.push({
        url: 'https://huggingface.co/hotchpotch/bekko-embedding-v1-a25m/resolve/main/onnx/model.onnx',
      });
      expect(await RendererEmbeddingService.isModelCachedInBrowser()).toBe(true);
    } finally {
      restore();
    }
  });

  test('删除所有匹配历史模型 URL 片段的条目,保留当前模型', async () => {
    const cache = makeCache('transformers-cache', [
      'https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX/resolve/main/onnx/model_q4.onnx',
      'https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX/resolve/main/tokenizer.json',
      'https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX/resolve/main/onnx/model_q4f16.onnx',
      'https://huggingface.co/onnx-community/gte-multilingual-base/resolve/main/onnx/model_q4f16.onnx',
    ]);
    const restore = installFakeCaches([cache]);
    try {
      const deleted = await RendererEmbeddingService.cleanupLegacyModelCache();
      expect(deleted).toBe(3); // 2 条 embeddinggemma + 1 条 qwen3
      expect(cache.entries).toHaveLength(1);
      expect(cache.entries[0]!.url).toContain('gte-multilingual');
    } finally {
      restore();
    }
  });

  test('没有匹配项时返回 0 不抛错', async () => {
    const cache = makeCache('transformers-cache', [
      'https://huggingface.co/onnx-community/gte-multilingual-base/resolve/main/onnx/model_q4f16.onnx',
    ]);
    const restore = installFakeCaches([cache]);
    try {
      const deleted = await RendererEmbeddingService.cleanupLegacyModelCache();
      expect(deleted).toBe(0);
      expect(cache.entries).toHaveLength(1);
    } finally {
      restore();
    }
  });

  test('caches API 不可用时返回 0', async () => {
    const original = (globalThis as { caches?: unknown }).caches;
    delete (globalThis as { caches?: unknown }).caches;
    try {
      const deleted = await RendererEmbeddingService.cleanupLegacyModelCache();
      expect(deleted).toBe(0);
    } finally {
      if (original !== undefined) (globalThis as { caches: unknown }).caches = original;
    }
  });
});
