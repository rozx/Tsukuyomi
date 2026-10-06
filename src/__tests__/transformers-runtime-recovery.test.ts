import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeSymbol = Symbol.for('onnxruntime');
afterEach(() => {
  Reflect.deleteProperty(globalThis, runtimeSymbol);
  vi.restoreAllMocks();
});

async function runtime() {
  vi.resetModules();
  const create = vi.fn((_bytes: unknown, options: { executionProviders: string[] }) =>
    options.executionProviders[0] === 'webgpu'
      ? Promise.reject(new Error('GPU session failed'))
      : Promise.resolve({ backend: 'wasm' }),
  );
  // 使用运行时公开的 ONNX 注入入口，验证真实浏览器 Promise 链，不加载模型权重。
  Reflect.set(globalThis, runtimeSymbol, {
    env: { wasm: {} },
    InferenceSession: { create },
    Tensor: class {},
  });
  // 上游源码模块没有独立的 TypeScript 声明。
  // @ts-expect-error 仅此回归测试直接调用运行时公开 session API。
  const api = await import('../../node_modules/@huggingface/transformers/src/backends/onnx.js');
  return { api, create };
}

describe('Transformers.js 浏览器运行时故障恢复', () => {
  it('WebGPU session 失败后仍能创建 WASM session', async () => {
    const { api, create } = await runtime();
    await expect(
      api.createInferenceSession(new Uint8Array(), { executionProviders: ['webgpu'] }, {}),
    ).rejects.toThrow('GPU session failed');
    await expect(
      api.createInferenceSession(new Uint8Array(), { executionProviders: ['wasm'] }, {}),
    ).resolves.toMatchObject({ backend: 'wasm' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('一次推理失败不会阻断后续推理', async () => {
    const { api } = await runtime();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary inference failure'))
      .mockResolvedValueOnce({ result: 'ok' });
    await expect(api.runInferenceSession({ run }, {})).rejects.toThrow(
      'temporary inference failure',
    );
    await expect(api.runInferenceSession({ run }, {})).resolves.toEqual({ result: 'ok' });
    expect(run).toHaveBeenCalledTimes(2);
  });
});
