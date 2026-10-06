import type {
  EmbeddingInitResult,
  EmbeddingTask,
  EmbeddingWorkerData,
  EmbeddingWorkerEvent,
  EmbeddingWorkerMessage,
  EmbeddingWorkerRequest,
  SerializedEmbeddingError,
} from 'src/models/embedding';

interface PendingRequest {
  action: 'init' | 'reload' | 'embed';
  resolve: (data: EmbeddingWorkerData) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}
interface Callbacks {
  onEvent: (event: EmbeddingWorkerEvent) => void;
  onFatal: (error: Error) => void;
}
type Payload =
  | { action: 'init' | 'reload' }
  | { action: 'embed'; texts: string[]; task: EmbeddingTask; priority: EmbeddingTask };

function errorFrom(data: SerializedEmbeddingError): Error {
  const error = new Error(data.message);
  error.name = data.name;
  return error;
}

/** 只负责 RPC、generation 和失败收尾，不在页面线程加载 Transformers.js。 */
export class EmbeddingWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private currentGeneration = 0;
  private alive = true;
  constructor(private readonly callbacks: Callbacks) {
    this.worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), {
      type: 'module',
      name: 'tsukuyomi-embeddings',
    });
    this.worker.onmessage = (event: MessageEvent<EmbeddingWorkerMessage>) =>
      this.receive(event.data);
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new Error(event.message || '嵌入 Worker 意外停止'));
    };
    this.worker.onmessageerror = () => this.fail(new Error('嵌入 Worker 返回了无法读取的消息'));
  }
  get generation(): number {
    return this.currentGeneration;
  }
  async initialize(action: 'init' | 'reload'): Promise<EmbeddingInitResult> {
    const data = await this.request({ action });
    if (Array.isArray(data)) throw new Error('嵌入 Worker 初始化响应无效');
    return data;
  }
  async embed(
    texts: string[],
    task: EmbeddingTask,
    priority: EmbeddingTask,
  ): Promise<Array<Float32Array | null>> {
    const data = await this.request({ action: 'embed', texts, task, priority });
    if (!Array.isArray(data)) throw new Error('嵌入 Worker 向量响应无效');
    return data;
  }
  clearQueryCache(): void {
    if (!this.alive) return;
    try {
      this.worker.postMessage({
        id: 0,
        generation: this.currentGeneration,
        action: 'clear-cache',
      } satisfies EmbeddingWorkerRequest);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
  invalidate(): void {
    this.currentGeneration++;
    this.rejectPending(new Error('嵌入模型正在重新加载'));
  }
  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.worker.terminate();
    this.rejectPending(new Error('嵌入 Worker 已停止'));
  }
  private request(payload: Payload): Promise<EmbeddingWorkerData> {
    if (!this.alive) return Promise.reject(new Error('嵌入 Worker 不可用'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { action: payload.action, resolve, reject });
      this.armTimeout(id);
      try {
        this.worker.postMessage({
          ...payload,
          id,
          generation: this.currentGeneration,
        } satisfies EmbeddingWorkerRequest);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  private armTimeout(id: number): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    // 下载进度重置初始化的无活动计时；正常慢速下载不会被固定总时长打断。
    pending.timer = setTimeout(
      () => this.fail(new Error('嵌入 Worker 长时间未响应，请重新加载模型')),
      pending.action === 'embed' ? 30_000 : 120_000,
    );
  }
  private receive(message: EmbeddingWorkerMessage): void {
    if (!this.alive || message.generation !== this.currentGeneration) return;
    if (message.kind === 'event') {
      for (const [id, pending] of this.pending) if (pending.action !== 'embed') this.armTimeout(id);
      this.callbacks.onEvent(message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.success) pending.resolve(message.data);
    else pending.reject(errorFrom(message.error));
  }
  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
  private fail(error: Error): void {
    if (!this.alive) return;
    this.dispose();
    this.callbacks.onFatal(error);
  }
}
