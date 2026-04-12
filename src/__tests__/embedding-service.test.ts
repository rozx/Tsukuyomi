/* eslint-disable @typescript-eslint/require-await */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';

// ============================================================================
// Mock @huggingface/transformers
// ============================================================================
// 必须在 import EmbeddingService 之前 mock,确保动态 import 命中 mock 版本
let mockPipelineImpl: ((input: unknown, options?: unknown) => Promise<unknown>) | null = null;
let mockPipelineFactory: ((task: string, model: string, options: unknown) => Promise<unknown>) | null = null;

mock.module('@huggingface/transformers', () => ({
  pipeline: (task: string, model: string, options: unknown) => {
    if (mockPipelineFactory) return mockPipelineFactory(task, model, options);
    return Promise.resolve((input: unknown, opts?: unknown) => {
      if (mockPipelineImpl) return mockPipelineImpl(input, opts);
      throw new Error('pipeline impl not set');
    });
  },
}));

// 必须在 mock 之后 import
import {
  EmbeddingService,
  MODEL_VERSION,
  DIMENSIONS,
} from 'src/services/embedding-service';

function makeFloat32(values: number[]): Float32Array {
  return new Float32Array(values);
}

/**
 * 构造 mean-pooled 的模拟输出:形状 [batch, 768]。
 * 前几维为 fill,其余为 0。
 */
function fakePooledOutput(batch: number, fill: number) {
  const hidden = 768;
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

    await Promise.all([
      EmbeddingService.init(),
      EmbeddingService.init(),
      EmbeddingService.init(),
    ]);

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

  test('embed 返回 256 维 L2 归一化向量', async () => {
    mockPipelineImpl = async () => fakePooledOutput(1, 0.5);
    await EmbeddingService.init();

    const vec = await EmbeddingService.embed('测试文本');
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
    expect(await EmbeddingService.embed('')).toBeNull();
    expect(await EmbeddingService.embed('   ')).toBeNull();
  });

  test('未就绪时 embed 返回 null(不会抛异常)', async () => {
    // 未 init
    const vec = await EmbeddingService.embed('hello');
    expect(vec).toBeNull();
  });

  test('embed 内部异常时降级为 null', async () => {
    mockPipelineImpl = async () => {
      throw new Error('inference crash');
    };
    await EmbeddingService.init();
    const vec = await EmbeddingService.embed('hello');
    expect(vec).toBeNull();
  });

  test('embedBatch 返回与输入同长度的数组', async () => {
    mockPipelineImpl = async (input: unknown) => {
      const texts = Array.isArray(input) ? input : [input];
      return fakePooledOutput(texts.length, 0.3);
    };
    await EmbeddingService.init();

    const vecs = await EmbeddingService.embedBatch(['a', 'b', 'c']);
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

    const vecs = await EmbeddingService.embedBatch(['a', '', 'c']);
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).not.toBeNull();
    expect(vecs[1]).toBeNull();
    expect(vecs[2]).not.toBeNull();
  });

  test('embedBatch 未就绪时全部返回 null', async () => {
    const vecs = await EmbeddingService.embedBatch(['a', 'b']);
    expect(vecs).toEqual([null, null]);
  });
});

describe('EmbeddingService - cosineSimilarity', () => {
  test('相同向量返回 1', () => {
    const v = makeFloat32([0.6, 0.8]);
    expect(EmbeddingService.cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  test('正交向量返回 0', () => {
    expect(
      EmbeddingService.cosineSimilarity(makeFloat32([1, 0]), makeFloat32([0, 1])),
    ).toBeCloseTo(0, 5);
  });

  test('任一为空返回 0', () => {
    expect(EmbeddingService.cosineSimilarity(null, makeFloat32([1, 0]))).toBe(0);
    expect(EmbeddingService.cosineSimilarity(makeFloat32([1, 0]), undefined)).toBe(0);
    expect(EmbeddingService.cosineSimilarity(makeFloat32([]), makeFloat32([1]))).toBe(0);
  });

  test('维度不匹配返回 0', () => {
    expect(
      EmbeddingService.cosineSimilarity(makeFloat32([1, 0]), makeFloat32([1, 0, 0])),
    ).toBe(0);
  });

  test('反向向量 clamp 到 0', () => {
    expect(
      EmbeddingService.cosineSimilarity(makeFloat32([1, 0]), makeFloat32([-1, 0])),
    ).toBe(0);
  });
});

describe('EmbeddingService - 常量', () => {
  test('MODEL_VERSION 与 DIMENSIONS 与 spec 一致', () => {
    expect(MODEL_VERSION).toBe('embeddinggemma-300m@256');
    expect(DIMENSIONS).toBe(256);
  });
});
