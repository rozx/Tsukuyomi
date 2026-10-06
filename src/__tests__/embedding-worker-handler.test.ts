import './setup';
import { describe, expect, it, vi } from 'vitest';
import { startEmbeddingWorker } from '../services/embedding-worker-handler';
import type {
  EmbeddingWorkerPort,
  EmbeddingWorkerRequest,
  EmbeddingWorkerMessage,
} from '../models/embedding';

function fixture() {
  const messages: EmbeddingWorkerMessage[] = [];
  const port: EmbeddingWorkerPort = {
    onmessage: null,
    postMessage: (message, transfer = []) => messages.push(structuredClone(message, { transfer })),
  };
  const listeners = new Map<string, (event: CustomEvent) => void>();
  const cached = new Float32Array([0.6, 0.8]);
  const runtime = {
    init: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    getStatus: () => 'ready' as const,
    getActiveBackend: () => 'wasm' as const,
    getLastError: () => null,
    clearQueryCache: vi.fn(),
    embedBatch: vi.fn(
      (_texts: string[], _task: 'query' | 'document', _priority: 'query' | 'document') =>
        Promise.resolve([cached, null]),
    ),
    addEventListener: (name: string, listener: (event: CustomEvent) => void) => {
      listeners.set(name, listener);
      return () => listeners.delete(name);
    },
  };
  startEmbeddingWorker(port, runtime);
  const send = (request: EmbeddingWorkerRequest) =>
    port.onmessage!(new MessageEvent('message', { data: request }));
  return { messages, port, runtime, cached, listeners, send };
}
describe('模型 Worker 消息处理', () => {
  it('只转移结果副本，重复查询不会把缓存中的向量缓冲区分离', async () => {
    const f = fixture();
    f.send({ id: 1, generation: 0, action: 'init' });
    await vi.waitFor(() => expect(f.messages).toHaveLength(1));
    for (const id of [2, 3]) {
      f.send({
        id,
        generation: 0,
        action: 'embed',
        texts: ['a', ''],
        task: 'document',
        priority: 'query',
      });
      await vi.waitFor(() => expect(f.messages).toHaveLength(id));
    }
    expect(f.cached.byteLength).toBe(8);
    expect(f.runtime.embedBatch).toHaveBeenCalledWith(['a', ''], 'document', 'query');
    const response = f.messages[2]!;
    expect(response.kind).toBe('response');
    if (response.kind === 'response' && response.success && Array.isArray(response.data)) {
      expect(response.data[0]?.[0]).toBeCloseTo(0.6);
      expect(response.data[0]?.[1]).toBeCloseTo(0.8);
      expect(response.data[1]).toBeNull();
    }
  });
  it('初始化和重载串行，初始化的迟到事件仍带旧 generation', async () => {
    const f = fixture();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    f.runtime.init.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      f.listeners.get('ready')!(
        new CustomEvent('ready', { detail: { modelVersion: 'test', backend: 'wasm' } }),
      );
    });
    f.send({ id: 1, generation: 0, action: 'init' });
    await entered.promise;
    f.send({ id: 2, generation: 1, action: 'reload' });
    expect(f.runtime.reload).not.toHaveBeenCalled();
    release.resolve();
    await vi.waitFor(() => expect(f.runtime.reload).toHaveBeenCalledTimes(1));
    const ready = f.messages.find(
      (message) => message.kind === 'event' && message.event === 'ready',
    );
    expect(ready?.generation).toBe(0);
  });
  it('重载已请求后拒绝旧 generation 的嵌入请求', async () => {
    const f = fixture();
    f.send({ id: 1, generation: 1, action: 'reload' });
    f.send({
      id: 2,
      generation: 0,
      action: 'embed',
      texts: ['old'],
      task: 'query',
      priority: 'query',
    });
    await vi.waitFor(() =>
      expect(f.messages.some((message) => message.kind === 'response' && message.id === 2)).toBe(
        true,
      ),
    );
    expect(f.runtime.embedBatch).not.toHaveBeenCalled();
    expect(
      f.messages.find((message) => message.kind === 'response' && message.id === 2),
    ).toMatchObject({ success: false });
  });
});
