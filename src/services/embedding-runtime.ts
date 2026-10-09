/**
 * EmbeddingRuntime — Worker 内的单模型特征提取与调度
 *
 * 约定:
 * - 使用 Bekko a25m 官方 ONNX,约 123M 总参数 / 25M 活跃参数。
 *   默认文件约 190 MiB，静态词表 int8 压缩，Transformer 计算保持 fp32。
 * - 使用原生 384 维 mean pooling 表征并 L2 归一化。
 * - 模型加载走动态 import,确保 Transformers.js 不进主 bundle。
 * - 失败时静默降级:调用方通过 getStatus() 感知,不会抛到 UI 顶层。
 */

import { createCustomEventSubscriber, dispatchCustomEvent } from 'src/utils/dispatch-custom-event';
import { EmbeddingDownloadProgress } from './embedding-download-progress';

import { MODEL_ID, MODEL_VERSION, DIMENSIONS } from 'src/models/embedding';
import type {
  EmbeddingStatus,
  EmbeddingBackend,
  EmbeddingTask,
  EmbeddingProgressEvent,
} from 'src/models/embedding';
const NATIVE_DIMENSIONS = DIMENSIONS;

interface PipelineConfig {
  device: EmbeddingBackend;
  dtype: 'fp32';
}

/** fp32 选择 model.onnx；该文件的词表已经 int8 压缩，并非完整 fp32 权重。 */
const WEBGPU_CONFIG: PipelineConfig = { device: 'webgpu', dtype: 'fp32' };
const WASM_CONFIG: PipelineConfig = { device: 'wasm', dtype: 'fp32' };

function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Bekko 官方检索方案直接编码原文,不使用 query/document 指令前缀。
 * task 仍保留在 API 中标明调用意图,便于以后更换模型时维持显式契约。
 */

/**
 * Pooling 方案 — Bekko 官方契约对有效 token 做 mean pooling。
 * 单条 embed() 与批处理 embedBatch() 必须使用同一方案,否则 query 向量和 document 向量
 * 落到不同空间,余弦相似度退化成噪声。集中在此常量避免两处手写漂移。
 * 该值也是 MODEL_VERSION 的一部分——变更 pooling 必须同时 bump 版本号。
 */
const POOLING = 'mean' as const;

function prepareTaskText(text: string, _task: EmbeddingTask): string {
  return text;
}

type FeatureExtractionPipeline = ((
  input: string | string[],
  options?: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>) & { dispose?: () => Promise<void> };

/**
 * 单例 Service。浏览器只需要一份 pipeline 实例。
 */
export class EmbeddingRuntime {
  // 足以容纳一轮最多 192 个重排段落和查询文本，避免按批扫描造成 LRU 抖动。
  private static readonly QUERY_CACHE_LIMIT = 256;
  private static readonly queryCache = new Map<string, Promise<Float32Array | null>>();
  private static readonly inferenceQueue: Array<{ task: EmbeddingTask; run: () => Promise<void> }> =
    [];
  private static inferenceRunning = false;
  private static nextBackgroundAt = 0;
  private static wakeCooldown: (() => void) | null = null;
  private static readonly idleWaiters: Array<() => void> = [];
  private static pipeline: FeatureExtractionPipeline | null = null;
  private static status: EmbeddingStatus = 'idle';
  private static initPromise: Promise<void> | null = null;
  private static lastError: Error | null = null;
  private static retryCount = 0;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [3000, 8000, 20000]; // 递增延迟(ms)

  /**
   * WebGPU 初始化是否失败过:失败一次就不再重试,本会话内永久回落 WASM。
   * 避免在无 WebGPU 的浏览器里每次重试都再次触发 WebGPU 探测。
   */
  private static webGpuBlacklisted = false;
  /** 最终加载成功的后端,供 UI 展示 */
  private static activeBackend: EmbeddingBackend | null = null;

  private static readonly events = new EventTarget();

  private static readonly downloadProgress = new EmbeddingDownloadProgress();

  /**
   * 订阅 EmbeddingService 事件:
   * - 'progress': 模型下载进度(transformers.js progress_callback 原样透传)
   * - 'status-changed': 状态切换(idle/loading/ready/failed)
   * - 'ready': pipeline 首次就绪
   * - 'error': 初始化或推理失败
   *
   * 通过 createCustomEventSubscriber 工厂注入共享底层，保留 type 字面量窄化。
   */
  static addEventListener = createCustomEventSubscriber<
    'progress' | 'status-changed' | 'ready' | 'error'
  >(this.events);

  private static setStatus(next: EmbeddingStatus): void {
    if (this.status === next) return;
    this.status = next;
    dispatchCustomEvent(this.events, 'status-changed', { status: next });
  }

  static isReady(): boolean {
    return this.status === 'ready' && this.pipeline !== null;
  }

  /** 当前加载成功的后端,未 init 或失败时返回 null */
  static getActiveBackend(): EmbeddingBackend | null {
    return this.activeBackend;
  }

  /** 按当前会话状态决定本次 init 用什么后端 + dtype */
  private static async pickConfig(): Promise<PipelineConfig> {
    if (!this.webGpuBlacklisted && hasWebGPU()) {
      try {
        const gpu = (
          navigator as Navigator & {
            gpu?: { requestAdapter?: () => Promise<unknown> };
          }
        ).gpu;
        const adapter = await gpu?.requestAdapter?.();
        if (adapter) {
          const device = await (
            adapter as {
              requestDevice: () => Promise<{ destroy: () => void }>;
            }
          ).requestDevice();
          device.destroy();
          return WEBGPU_CONFIG;
        }
      } catch {
        // 先检查适配器，避免失败的 WebGPU session 污染运行时初始化链。
      }
      this.webGpuBlacklisted = true;
    }
    return WASM_CONFIG;
  }

  static getStatus(): EmbeddingStatus {
    return this.status;
  }

  static getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * 懒加载 pipeline。同一时刻多次调用复用同一个 Promise,避免并发下载。
   * 调用方不需要 try/catch,失败会 resolve(静默降级),错误通过 getStatus() 查询。
   */
  static async init(): Promise<void> {
    if (this.status === 'ready') return;
    if (this.initPromise) return this.initPromise;

    // 自动重试和 WebGPU → WASM 回退属于同一次加载，保留已经完成的下载进度。
    if (this.status !== 'loading') this.downloadProgress.reset();
    this.setStatus('loading');
    this.lastError = null;

    this.initPromise = (async () => {
      try {
        // 动态 import — 确保打包器把 @huggingface/transformers 拆出主 bundle
        const transformers = await import('@huggingface/transformers');
        // Worker 内单线程 WASM 不依赖跨源隔离，也为界面和其它应用保留 CPU。
        const wasm = transformers.env?.backends?.onnx?.wasm;
        if (wasm) {
          wasm.numThreads = 1;
          wasm.proxy = false;
        }
        const pipeline = transformers.pipeline as unknown as (
          task: string,
          model: string,
          options: Record<string, unknown>,
        ) => Promise<FeatureExtractionPipeline>;

        // 两个后端共用官方默认压缩文件，优先 WebGPU，失败后回落 WASM。
        const config = await this.pickConfig();
        console.info(`[EmbeddingService] 使用后端 ${config.device} + dtype ${config.dtype}`);
        const extractor = await pipeline('feature-extraction', MODEL_ID, {
          dtype: config.dtype,
          device: config.device,
          progress_callback: (event: EmbeddingProgressEvent) => {
            dispatchCustomEvent(this.events, 'progress', this.downloadProgress.update(event));
          },
        });

        this.pipeline = extractor;
        this.activeBackend = config.device;
        this.retryCount = 0; // 成功后重置重试计数
        this.setStatus('ready');
        dispatchCustomEvent(this.events, 'progress', this.downloadProgress.complete());
        dispatchCustomEvent(this.events, 'ready', {
          modelVersion: MODEL_VERSION,
          backend: config.device,
        });
      } catch (error) {
        this.lastError = error instanceof Error ? error : new Error(String(error));
        this.pipeline = null;
        console.warn(
          `[EmbeddingService] 初始化失败 (${this.retryCount + 1}/${this.MAX_RETRIES + 1}):`,
          this.lastError.message,
        );

        // WebGPU 路径首次失败 → 把它拉黑,下一次 init 直接走 WASM。
        // 不消耗正常重试预算:常见场景是 GPU 驱动不兼容,重试也是失败,不如立刻回落。
        if (!this.webGpuBlacklisted && hasWebGPU()) {
          this.webGpuBlacklisted = true;
          console.info('[EmbeddingService] WebGPU 初始化失败,回落 WASM 重试');
          this.setStatus('loading');
          dispatchCustomEvent(this.events, 'error', {
            error: this.lastError,
            retrying: true,
            fallbackToWasm: true,
          });
          this.initPromise = null;
          await this.init();
          return;
        }

        // 自动重试(递增延迟)
        if (this.retryCount < this.MAX_RETRIES) {
          const delay = this.RETRY_DELAYS[this.retryCount] ?? 20000;
          this.retryCount++;
          this.setStatus('loading'); // 保持 loading 状态表示仍在尝试
          dispatchCustomEvent(this.events, 'error', {
            error: this.lastError,
            retrying: true,
            retryCount: this.retryCount,
          });
          console.info(`[EmbeddingService] 将在 ${delay / 1000}s 后重试...`);
          await new Promise((r) => setTimeout(r, delay));
          this.initPromise = null;
          await this.init(); // 等待本次重试完成，保持并发调用共享同一初始化过程
          return;
        }

        // 重试耗尽,标记失败
        this.setStatus('failed');
        dispatchCustomEvent(this.events, 'error', { error: this.lastError, retrying: false });
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * 重新加载:释放当前 pipeline 后重新初始化。
   * 模型文件已被浏览器 Cache API 缓存,重新加载不需要重新下载。
   */
  static async reload(): Promise<void> {
    if (this.initPromise) await this.initPromise;
    this.setStatus('idle');
    this.clearQueryCache();
    if (this.inferenceRunning) await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
    try {
      await this.pipeline?.dispose?.();
    } catch (error) {
      console.warn('[EmbeddingRuntime] 释放旧模型失败:', error);
    }
    this.pipeline = null;
    this.initPromise = null;
    this.lastError = null;
    this.retryCount = 0;
    this.activeBackend = null;
    this.webGpuBlacklisted = false;
    this.nextBackgroundAt = 0;
    await this.init();
  }

  /**
   * 对单条文本计算 embedding。
   * 返回 384 维 L2 归一化 Float32Array。
   * 未就绪或失败时返回 null(调用方 fallback 到纯关键词 + 时间衰减)。
   *
   * `task` 必填:'query' 用于检索查询,'document' 用于被检索的文档/记忆/章节 chunk。
   * 当前模型按官方契约直接编码原文,两类任务处于同一向量空间。
   */
  static async embed(text: string, task: EmbeddingTask): Promise<Float32Array | null> {
    if (!text || !text.trim()) return null;
    if (!this.isReady()) {
      // 不主动 init — 调用方应先显式 warmup/init
      return null;
    }
    if (task === 'query') {
      const cached = this.getCachedQuery(text);
      if (cached) return cached;
      return this.cacheQuery(text, this.embedSingle(text, task));
    }
    return this.embedSingle(text, task);
  }

  private static async embedSingle(
    text: string,
    task: EmbeddingTask,
  ): Promise<Float32Array | null> {
    const pipeline = this.pipeline!;
    try {
      const output = await this.scheduleInference(task, () =>
        pipeline(prepareTaskText(text, task), { pooling: POOLING, normalize: false }),
      );
      return this.extractFirstVector(output);
    } catch (error) {
      console.warn('[EmbeddingService] embed 失败:', error);
      return null;
    }
  }

  /**
   * 批量 embed。相比逐条调用,transformers.js 会复用 tokenizer + 单次 forward。
   * 返回的数组下标与输入一一对应,失败或空文本对应位置为 null。
   *
   * `task` 必填,所有非空输入都会按与单条 `embed` 相同的模型契约处理。
   * `priority` 只控制调度；前台文档重排可用 query 优先级，并按文档任务独立缓存。
   */
  static async embedBatch(
    texts: string[],
    task: EmbeddingTask,
    priority: EmbeddingTask = task,
  ): Promise<Array<Float32Array | null>> {
    if (!texts || texts.length === 0) return [];
    if (!this.isReady()) return texts.map(() => null);
    if (task === 'query' || priority === 'query') return this.embedQueryBatch(texts, task);
    return this.embedUncachedBatch(texts, task);
  }

  /** 查询只缓存向量，记忆/章节的评分始终使用当前数据。失败结果可重新计算。 */
  static clearQueryCache(): void {
    this.queryCache.clear();
  }

  private static queryKey(text: string, task: EmbeddingTask = 'query'): string {
    return `${MODEL_VERSION}:${task}:${text}`;
  }

  private static getCachedQuery(
    text: string,
    task: EmbeddingTask = 'query',
  ): Promise<Float32Array | null> | undefined {
    const key = this.queryKey(text, task);
    const cached = this.queryCache.get(key);
    if (cached) {
      this.queryCache.delete(key);
      this.queryCache.set(key, cached);
    }
    return cached;
  }

  private static cacheQuery(
    text: string,
    promise: Promise<Float32Array | null>,
    task: EmbeddingTask = 'query',
  ): Promise<Float32Array | null> {
    const key = this.queryKey(text, task);
    this.queryCache.set(key, promise);
    if (this.queryCache.size > this.QUERY_CACHE_LIMIT) {
      const oldest = this.queryCache.keys().next().value;
      if (oldest !== undefined) this.queryCache.delete(oldest);
    }
    void promise.then((vector) => {
      if (!vector && this.queryCache.get(key) === promise) this.queryCache.delete(key);
    });
    return promise;
  }

  private static async embedQueryBatch(
    texts: string[],
    task: EmbeddingTask = 'query',
  ): Promise<Array<Float32Array | null>> {
    const jobs: Array<{ text: string; resolve: (vector: Float32Array | null) => void }> = [];
    const pending = texts.map((text) => {
      if (!text?.trim()) return Promise.resolve(null);
      const cached = this.getCachedQuery(text, task);
      if (cached) return cached;
      const deferred = Promise.withResolvers<Float32Array | null>();
      jobs.push({ text, resolve: deferred.resolve });
      return this.cacheQuery(text, deferred.promise, task);
    });
    if (jobs.length) {
      const vectors = await this.embedUncachedBatch(
        jobs.map((job) => job.text),
        task,
        'query',
      );
      jobs.forEach((job, index) => job.resolve(vectors[index] ?? null));
    }
    return Promise.all(pending);
  }

  /** 同一 pipeline 串行执行；查询可在后台批次之间优先运行。 */
  private static scheduleInference<T>(task: EmbeddingTask, work: () => Promise<T>): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      this.inferenceQueue.push({
        task,
        run: async () => {
          try {
            resolve(await work());
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
      });
    });
    if (task === 'query') this.wakeCooldown?.();
    void this.drainInferenceQueue();
    return result;
  }

  /** 后台计算后的空档跨 RPC 批次保留；查询入队时立即唤醒，不等后台冷却结束。 */
  private static async waitForBackgroundBudget(): Promise<void> {
    const delay = this.nextBackgroundAt - performance.now();
    if (delay <= 0) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.wakeCooldown = null;
        resolve();
      };
      const timer = setTimeout(finish, delay);
      this.wakeCooldown = finish;
    });
  }
  private static async drainInferenceQueue(): Promise<void> {
    if (this.inferenceRunning) return;
    this.inferenceRunning = true;
    try {
      while (this.inferenceQueue.length) {
        let queryIndex = this.inferenceQueue.findIndex((job) => job.task === 'query');
        if (queryIndex < 0) {
          await this.waitForBackgroundBudget();
          queryIndex = this.inferenceQueue.findIndex((job) => job.task === 'query');
        }
        const [job] = this.inferenceQueue.splice(queryIndex < 0 ? 0 : queryIndex, 1);
        if (!job) continue;
        const started = performance.now();
        await job.run();
        if (job.task === 'document') {
          // 默认约一半时间用于后台推理，长批次最多休息 250ms，前台查询可打断休息。
          this.nextBackgroundAt =
            performance.now() + Math.min(250, Math.max(16, performance.now() - started));
        }
      }
    } finally {
      this.inferenceRunning = false;
      this.idleWaiters.splice(0).forEach((resolve) => resolve());
    }
  }

  private static async embedUncachedBatch(
    texts: string[],
    task: EmbeddingTask,
    priority: EmbeddingTask = task,
  ): Promise<Array<Float32Array | null>> {
    // 过滤空文本但保留位置映射
    const indexed: Array<{ idx: number; text: string }> = [];
    texts.forEach((t, idx) => {
      if (t && t.trim()) indexed.push({ idx, text: t });
    });
    if (indexed.length === 0) return texts.map(() => null);

    const result: Array<Float32Array | null> = texts.map(() => null);
    const pipeline = this.pipeline!;
    // 同长度输入合组，减少 padding；保留 idx，输出始终还原调用方顺序。
    indexed.sort((a, b) => a.text.length - b.text.length);
    const maxItems = priority === 'query' ? 8 : 4;
    const charBudget = priority === 'query' ? 2400 : 1200;
    const batches: Array<typeof indexed> = [];
    let batch: typeof indexed = [];
    for (const entry of indexed) {
      if (
        batch.length &&
        (batch.length >= maxItems || entry.text.length * (batch.length + 1) > charBudget)
      ) {
        batches.push(batch);
        batch = [];
      }
      batch.push(entry);
    }
    if (batch.length) batches.push(batch);
    for (const group of batches) {
      if (!this.isReady() || this.pipeline !== pipeline) break;
      try {
        const output = await this.scheduleInference(priority, () => {
          if (!this.isReady() || this.pipeline !== pipeline) return Promise.resolve(null);
          return pipeline(
            group.map((entry) => prepareTaskText(entry.text, task)),
            { pooling: POOLING, normalize: false },
          );
        });
        const vectors = this.extractBatchVectors(output, group.length);
        group.forEach((entry, i) => {
          result[entry.idx] = vectors[i] ?? null;
        });
      } catch (error) {
        console.warn('[EmbeddingRuntime] embedBatch 失败:', error);
      }
    }
    return result;
  }

  /**
   * 从 transformers.js 输出(Tensor 或 { data, dims })中取第一条向量,
   * 取前 DIMENSIONS 维并 L2 归一化。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static extractFirstVector(output: any): Float32Array | null {
    const flat = this.outputToFloat32(output);
    if (!flat) return null;
    // Mean-pooled 输出形状 = [batch, hidden_size];单条输入 batch=1 → 取原生维度
    const hidden = flat.length >= NATIVE_DIMENSIONS ? NATIVE_DIMENSIONS : flat.length;
    const take = Math.min(DIMENSIONS, hidden);
    return this.truncateAndNormalize(flat, 0, take);
  }

  /**
   * 从 transformers.js 批量输出中依次取 batchSize 条向量。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static extractBatchVectors(output: any, batchSize: number): Array<Float32Array | null> {
    const flat = this.outputToFloat32(output);
    if (!flat) return Array.from({ length: batchSize }, () => null);

    // 形状应为 [batchSize, hidden_size]
    const stride = Math.floor(flat.length / batchSize);
    if (stride < DIMENSIONS) {
      // 数据不够 — 视为单条或异常,全部返回 null
      return Array.from({ length: batchSize }, () => null);
    }
    const out: Array<Float32Array | null> = [];
    for (let i = 0; i < batchSize; i++) {
      out.push(this.truncateAndNormalize(flat, i * stride, DIMENSIONS));
    }
    return out;
  }

  /**
   * 把 transformers.js 的输出统一转成 Float32Array。
   * 支持:
   * - Tensor({ data: Float32Array, dims: [...] })
   * - 普通数组
   * - { data: number[] }
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static outputToFloat32(output: any): Float32Array | null {
    if (!output) return null;
    if (output instanceof Float32Array) return output;
    if (output.data instanceof Float32Array) return output.data;
    if (Array.isArray(output)) return new Float32Array(output);
    if (Array.isArray(output.data)) return new Float32Array(output.data);
    return null;
  }

  /**
   * 截取 flat[start ..< start+length],再做 L2 归一化,返回新 Float32Array。
   */
  private static truncateAndNormalize(
    flat: Float32Array,
    start: number,
    length: number,
  ): Float32Array {
    const slice = new Float32Array(length);
    let norm = 0;
    for (let i = 0; i < length; i++) {
      const v = flat[start + i] ?? 0;
      slice[i] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm);
    if (norm === 0) return slice;
    for (let i = 0; i < length; i++) {
      slice[i]! /= norm;
    }
    return slice;
  }

  /**
   * 测试专用:重置内部状态。
   */
  static __resetForTesting(): void {
    this.downloadProgress.reset();
    this.clearQueryCache();
    this.wakeCooldown?.();
    this.nextBackgroundAt = 0;
    this.inferenceQueue.length = 0;
    this.inferenceRunning = false;
    this.idleWaiters.splice(0).forEach((resolve) => resolve());
    this.pipeline = null;
    this.status = 'idle';
    this.initPromise = null;
    this.lastError = null;
    this.retryCount = 0;
    this.activeBackend = null;
    this.webGpuBlacklisted = false;
  }

  /** 测试专用:跳过自动重试 */
  static __disableRetryForTesting(): void {
    this.retryCount = this.MAX_RETRIES;
  }
}
