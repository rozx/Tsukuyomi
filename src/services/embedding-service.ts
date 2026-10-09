/** 页面端接口：只管理 Worker、事件和缓存检测，模型与向量计算均由 Worker 持有。 */
import { EmbeddingWorkerClient } from './embedding-worker-client';
import { createCustomEventSubscriber, dispatchCustomEvent } from 'src/utils/dispatch-custom-event';
import { cosineSimilarity } from 'src/utils/cosine-similarity';
import { MODEL_ID, MODEL_VERSION } from 'src/models/embedding';
import type {
  EmbeddingBackend,
  EmbeddingStatus,
  EmbeddingTask,
  EmbeddingWorkerEvent,
  EmbeddingProgressEvent,
} from 'src/models/embedding';
export { MODEL_ID, MODEL_VERSION, DIMENSIONS } from 'src/models/embedding';
export type {
  EmbeddingBackend,
  EmbeddingStatus,
  EmbeddingTask,
  EmbeddingProgressEvent,
} from 'src/models/embedding';

export class EmbeddingService {
  private static client: EmbeddingWorkerClient | null = null;
  private static status: EmbeddingStatus = 'idle';
  private static activeBackend: EmbeddingBackend | null = null;
  private static lastError: Error | null = null;
  private static initPromise: Promise<void> | null = null;
  private static progress: EmbeddingProgressEvent | null = null;
  private static readonly events = new EventTarget();
  static addEventListener = createCustomEventSubscriber<
    'progress' | 'status-changed' | 'ready' | 'error'
  >(this.events);
  private static dispatch(type: string, detail?: unknown): void {
    dispatchCustomEvent(this.events, type, detail);
  }
  private static setStatus(next: EmbeddingStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.dispatch('status-changed', { status: next });
  }
  static isReady(): boolean {
    return this.status === 'ready' && this.client !== null;
  }
  static getStatus(): EmbeddingStatus {
    return this.status;
  }
  static getActiveBackend(): EmbeddingBackend | null {
    return this.activeBackend;
  }
  static getLastError(): Error | null {
    return this.lastError;
  }
  static getProgress(): EmbeddingProgressEvent | null {
    return this.progress ? { ...this.progress } : null;
  }

  private static fail(error: Error): void {
    this.lastError = error;
    this.activeBackend = null;
    this.setStatus('failed');
    this.dispatch('error', { error, retrying: false });
  }
  private static receive(message: EmbeddingWorkerEvent): void {
    switch (message.event) {
      case 'progress':
        this.progress = { ...message.detail };
        this.dispatch('progress', message.detail);
        break;
      case 'status-changed':
        this.setStatus(message.detail.status);
        break;
      case 'ready':
        this.activeBackend = message.detail.backend;
        this.lastError = null;
        this.setStatus('ready');
        this.dispatch('ready', message.detail);
        break;
      case 'error': {
        const error = new Error(message.detail.error.message);
        error.name = message.detail.error.name;
        this.lastError = error;
        this.dispatch('error', { ...message.detail, error });
        break;
      }
    }
  }
  private static createClient(): EmbeddingWorkerClient {
    const client = new EmbeddingWorkerClient({
      onEvent: (message) => {
        if (this.client === client) this.receive(message);
      },
      onFatal: (error) => {
        if (this.client === client) {
          this.client = null;
          this.fail(error);
        }
      },
    });
    return client;
  }
  static init(): Promise<void> {
    if (this.isReady()) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    return this.beginInitialization('init');
  }
  private static beginInitialization(action: 'init' | 'reload'): Promise<void> {
    this.progress = null;
    this.lastError = null;
    this.activeBackend = null;
    this.setStatus('loading');
    try {
      this.client ??= this.createClient();
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
      return Promise.resolve();
    }
    const promise = this.initialize(this.client, action);
    this.initPromise = promise;
    void promise.then(() => {
      if (this.initPromise === promise) this.initPromise = null;
    });
    return promise;
  }
  private static async initialize(
    client: EmbeddingWorkerClient,
    action: 'init' | 'reload',
  ): Promise<void> {
    const generation = client.generation;
    try {
      const result = await client.initialize(action);
      if (this.client !== client || client.generation !== generation) return;
      this.activeBackend = result.backend;
      this.lastError = result.error
        ? Object.assign(new Error(result.error.message), { name: result.error.name })
        : null;
      const needsReadyEvent = this.status !== 'ready' && result.status === 'ready';
      this.setStatus(result.status);
      if (needsReadyEvent && result.backend)
        this.dispatch('ready', { modelVersion: MODEL_VERSION, backend: result.backend });
    } catch (error) {
      if (this.client === client && client.generation === generation)
        this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
  static warmup(): Promise<void> {
    return this.init();
  }
  static reload(): Promise<void> {
    const reusable = this.isReady();
    this.client?.invalidate();
    if (!reusable) {
      this.client?.dispose();
      this.client = null;
    }
    this.initPromise = null;
    this.setStatus('idle');
    return this.beginInitialization(reusable ? 'reload' : 'init');
  }
  static async embed(text: string, task: EmbeddingTask): Promise<Float32Array | null> {
    if (!text?.trim()) return null;
    return (await this.embedBatch([text], task))[0] ?? null;
  }
  static async embedBatch(
    texts: string[],
    task: EmbeddingTask,
    priority: EmbeddingTask = task,
  ): Promise<Array<Float32Array | null>> {
    if (!texts?.length) return [];
    const client = this.client;
    if (!this.isReady() || !client) return texts.map(() => null);
    const generation = client.generation;
    try {
      const vectors = await client.embed(texts, task, priority);
      if (this.client !== client || client.generation !== generation) return texts.map(() => null);
      return vectors;
    } catch (error) {
      console.warn('[EmbeddingService] Worker 推理未完成:', error);
      return texts.map(() => null);
    }
  }
  static clearQueryCache(): void {
    this.client?.clearQueryCache();
  }
  static cosineSimilarity(
    a: Float32Array | number[] | null | undefined,
    b: Float32Array | number[] | null | undefined,
  ): number {
    return cosineSimilarity(a, b);
  }
  /**
   * 检测浏览器 Cache Storage 中是否已存在模型文件。
   * Transformers.js 通过 Cache API 持久化模型权重,命中则说明之前在本设备加载过。
   * 用于启动时判断是否可以静默 warmup(无需等用户再次触发下载)。
   */
  static async isModelCachedInBrowser(): Promise<boolean> {
    try {
      if (typeof caches === 'undefined') return false;
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        if (
          keys.some((req) => {
            const url = req.url.toLowerCase();
            return (
              url.includes(MODEL_ID.toLowerCase()) &&
              url.split('?')[0]!.endsWith('/onnx/model.onnx')
            );
          })
        ) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 历史模型在浏览器 Cache Storage 中的 URL 片段列表。
   * 每次切换嵌入模型时,往这里追加旧模型的 URL 关键词,启动清理会把它们从 Cache API 中删除。
   * 匹配采用小写 `includes`,不区分大小写。
   */
  private static readonly LEGACY_MODEL_URL_PATTERNS: readonly string[] = [
    'embeddinggemma',
    'qwen3-embedding', // 0.6B decoder 在 WebGPU 上仍过慢,已弃用,回收 ~567MB 缓存
  ];

  /**
   * 清理历史嵌入模型在浏览器 Cache Storage 中的残留文件。
   * 用于模型升级后回收空间(例如 EmbeddingGemma-300m 的 ~195MB 权重在切到 Qwen3 后就废了)。
   * - 不阻塞启动,失败静默
   * - 返回被删除的条目数,调用方可据此决定是否重置其它相关标记(如 `embeddingModelCached`)
   */
  static async cleanupLegacyModelCache(): Promise<number> {
    if (typeof caches === 'undefined') return 0;
    let deleted = 0;
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        for (const req of requests) {
          const url = req.url.toLowerCase();
          if (EmbeddingService.LEGACY_MODEL_URL_PATTERNS.some((p) => url.includes(p))) {
            const ok = await cache.delete(req);
            if (ok) deleted += 1;
          }
        }
      }
      if (deleted > 0) {
        console.info(`[EmbeddingService] 清理历史模型缓存: 删除 ${deleted} 个文件`);
      }
    } catch (error) {
      console.warn('[EmbeddingService] cleanupLegacyModelCache 失败:', error);
    }
    return deleted;
  }

  /** 测试专用：终止模拟 Worker 并收尾等待请求。 */
  static __resetForTesting(): void {
    this.client?.dispose();
    this.client = null;
    this.status = 'idle';
    this.activeBackend = null;
    this.lastError = null;
    this.initPromise = null;
    this.progress = null;
  }
}
