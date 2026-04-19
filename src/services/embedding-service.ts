/**
 * EmbeddingService — 基于 Transformers.js 的本地特征提取
 *
 * 约定:
 * - 使用 EmbeddingGemma 300M ONNX(Google Sept 2025),q4 量化 ~195MB
 * - 采用 Matryoshka 表征:从原生 768 维中截取前 256 维,再 L2 归一化
 * - 模型加载走动态 import,确保 Transformers.js 不进主 bundle
 * - 失败时静默降级:调用方通过 getStatus() 感知,不会抛到 UI 顶层
 */

import { cosineSimilarity } from 'src/utils/cosine-similarity';

export const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';
// v2: 引入 EmbeddingGemma 官方要求的非对称 task 前缀(query / document)。
// 旧 embedding 在没有前缀的情况下计算,与 query 不在同一语义空间,必须重算。
export const MODEL_VERSION = 'embeddinggemma-300m@256-v2';
export const DIMENSIONS = 256;
const NATIVE_DIMENSIONS = 768;

export type EmbeddingStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * EmbeddingGemma 官方任务前缀。
 * 模型是非对称检索模型:query 和 document 必须使用不同前缀,否则两侧落在不同的语义空间,
 * 余弦相似度会退化成噪声(参见 Google 模型卡)。
 */
export type EmbeddingTask = 'query' | 'document';
const TASK_PREFIX: Record<EmbeddingTask, string> = {
  query: 'task: search result | query: ',
  document: 'title: none | text: ',
};

function applyTaskPrefix(text: string, task: EmbeddingTask): string {
  return TASK_PREFIX[task] + text;
}

export interface EmbeddingProgressEvent {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  /**
   * 所有已见过的模型文件聚合后的"总字节进度"——用于 UI 展示单根稳定向前的
   * 下载进度条。transformers.js 原生只给每个文件的局部进度，切文件时会回到 0；
   * 这里统一在 service 侧维护 `loaded_i / total_i` 的 Map 并求和。
   *
   * `aggregateTotal` 随下载过程中发现新文件而增长，因此 `aggregatePercent`
   * 单调递增，不会在切文件瞬间回跳。
   */
  aggregateLoaded?: number;
  aggregateTotal?: number;
  aggregatePercent?: number;
}

 
type FeatureExtractionPipeline = (
  input: string | string[],
  options?: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

/**
 * 单例 Service。浏览器只需要一份 pipeline 实例。
 */
export class EmbeddingService {
  private static pipeline: FeatureExtractionPipeline | null = null;
  private static status: EmbeddingStatus = 'idle';
  private static initPromise: Promise<void> | null = null;
  private static lastError: Error | null = null;
  private static retryCount = 0;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [3000, 8000, 20000]; // 递增延迟(ms)

  private static readonly events = new EventTarget();

  /**
   * 聚合进度跟踪：file → { loaded, total }
   * transformers.js 每切一个文件会把 progress 重置为 0，导致进度条回跳；
   * 这里按文件维度累积字节，产出单根单调递增的进度条。
   */
  private static readonly progressByFile = new Map<string, { loaded: number; total: number }>();

  /** 重置聚合进度——init 开始时调用 */
  private static resetProgressAggregate(): void {
    this.progressByFile.clear();
  }

  /**
   * 根据一条原始 transformers progress event 更新内部聚合，并返回应广播的事件对象
   */
  private static enrichWithAggregate(event: EmbeddingProgressEvent): EmbeddingProgressEvent {
    const file = event.file;
    if (file && typeof event.total === 'number' && event.total > 0) {
      const loaded = typeof event.loaded === 'number' ? event.loaded : 0;
      this.progressByFile.set(file, { loaded, total: event.total });
    } else if (file && event.status === 'done') {
      // 完成事件不带 total——把该文件置为"已完成"
      const existing = this.progressByFile.get(file);
      if (existing) {
        this.progressByFile.set(file, { loaded: existing.total, total: existing.total });
      }
    }

    let aggLoaded = 0;
    let aggTotal = 0;
    for (const { loaded, total } of this.progressByFile.values()) {
      aggLoaded += loaded;
      aggTotal += total;
    }
    const aggPercent = aggTotal > 0 ? Math.min(100, Math.round((aggLoaded / aggTotal) * 100)) : 0;

    return {
      ...event,
      aggregateLoaded: aggLoaded,
      aggregateTotal: aggTotal,
      aggregatePercent: aggPercent,
    };
  }

  /**
   * 订阅 EmbeddingService 事件:
   * - 'progress': 模型下载进度(transformers.js progress_callback 原样透传)
   * - 'status-changed': 状态切换(idle/loading/ready/failed)
   * - 'ready': pipeline 首次就绪
   * - 'error': 初始化或推理失败
   */
  static addEventListener(
    type: 'progress' | 'status-changed' | 'ready' | 'error',
    listener: (event: CustomEvent) => void,
  ): () => void {
    const handler = (e: Event) => listener(e as CustomEvent);
    this.events.addEventListener(type, handler);
    return () => this.events.removeEventListener(type, handler);
  }

  private static dispatch(type: string, detail?: unknown): void {
    const hasCustomEvent = typeof (globalThis as any).CustomEvent !== 'undefined';
    const event = hasCustomEvent
      ? new CustomEvent(type, { detail })
      : Object.assign(new Event(type), { detail });
    this.events.dispatchEvent(event as Event);
  }

  private static setStatus(next: EmbeddingStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.dispatch('status-changed', { status: next });
  }

  static isReady(): boolean {
    return this.status === 'ready' && this.pipeline !== null;
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
        if (keys.some((req) => req.url.includes('embeddinggemma'))) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
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

    this.setStatus('loading');
    this.lastError = null;
    this.resetProgressAggregate();

    this.initPromise = (async () => {
      try {
        // 动态 import — 确保打包器把 @huggingface/transformers 拆出主 bundle
        const transformers = await import('@huggingface/transformers');
        const pipeline = transformers.pipeline as unknown as (
          task: string,
          model: string,
          options: Record<string, unknown>,
        ) => Promise<FeatureExtractionPipeline>;

        const extractor = await pipeline('feature-extraction', MODEL_ID, {
          dtype: 'q4',
          device: 'auto',
          progress_callback: (event: EmbeddingProgressEvent) => {
            this.dispatch('progress', this.enrichWithAggregate(event));
          },
        });

        this.pipeline = extractor;
        this.retryCount = 0; // 成功后重置重试计数
        this.setStatus('ready');
        this.dispatch('ready', { modelVersion: MODEL_VERSION });
      } catch (error) {
        this.lastError = error instanceof Error ? error : new Error(String(error));
        this.pipeline = null;
        console.warn(
          `[EmbeddingService] 初始化失败 (${this.retryCount + 1}/${this.MAX_RETRIES + 1}):`,
          this.lastError.message,
        );

        // 自动重试(递增延迟）
        if (this.retryCount < this.MAX_RETRIES) {
          const delay = this.RETRY_DELAYS[this.retryCount] ?? 20000;
          this.retryCount++;
          this.setStatus('loading'); // 保持 loading 状态表示仍在尝试
          this.dispatch('error', { error: this.lastError, retrying: true, retryCount: this.retryCount });
          console.info(`[EmbeddingService] 将在 ${delay / 1000}s 后重试...`);
          await new Promise((r) => setTimeout(r, delay));
          this.initPromise = null;
          void this.init(); // 重新触发 init
          return;
        }

        // 重试耗尽,标记失败
        this.setStatus('failed');
        this.dispatch('error', { error: this.lastError, retrying: false });
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * 预热:和 init() 行为一致,但名字更直观,供设置页的"立即下载"按钮使用。
   */
  static async warmup(): Promise<void> {
    await this.init();
  }

  /**
   * 重新加载:释放当前 pipeline 后重新初始化。
   * 模型文件已被浏览器 Cache API 缓存,重新加载不需要重新下载。
   */
  static async reload(): Promise<void> {
    this.pipeline = null;
    this.status = 'idle';
    this.initPromise = null;
    this.lastError = null;
    this.retryCount = 0;
    this.setStatus('idle');
    await this.init();
  }

  /**
   * 对单条文本计算 embedding。
   * 返回 256 维 L2 归一化 Float32Array。
   * 未就绪或失败时返回 null(调用方 fallback 到纯关键词 + 时间衰减)。
   *
   * `task` 必填:'query' 用于检索查询,'document' 用于被检索的文档/记忆/章节 chunk。
   * 两者走不同 prompt 前缀,必须与写入端严格一致,否则相似度会退化成噪声。
   */
  static async embed(text: string, task: EmbeddingTask): Promise<Float32Array | null> {
    if (!text || !text.trim()) return null;
    if (!this.isReady()) {
      // 不主动 init — 调用方应先显式 warmup/init
      return null;
    }
    try {

      const output = await this.pipeline!(applyTaskPrefix(text, task), {
        pooling: 'mean',
        normalize: false, // 我们手动处理截断 + 归一化
      });
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
   * `task` 必填,会给所有非空输入统一加前缀(见 `embed` 说明)。
   */
  static async embedBatch(
    texts: string[],
    task: EmbeddingTask,
  ): Promise<Array<Float32Array | null>> {
    if (!texts || texts.length === 0) return [];
    if (!this.isReady()) return texts.map(() => null);

    // 过滤空文本但保留位置映射
    const indexed: Array<{ idx: number; text: string }> = [];
    texts.forEach((t, idx) => {
      if (t && t.trim()) indexed.push({ idx, text: t });
    });
    if (indexed.length === 0) return texts.map(() => null);

    const result: Array<Float32Array | null> = texts.map(() => null);
    try {

      const output = await this.pipeline!(
        indexed.map((e) => applyTaskPrefix(e.text, task)),
        {
          pooling: 'mean',
          normalize: false,
        },
      );
      const vectors = this.extractBatchVectors(output, indexed.length);
      indexed.forEach((entry, i) => {
        result[entry.idx] = vectors[i] ?? null;
      });
    } catch (error) {
      console.warn('[EmbeddingService] embedBatch 失败:', error);
    }
    return result;
  }

  /**
   * 从 transformers.js 输出(Tensor 或 { data, dims })中取第一条向量,
   * 截取前 256 维并 L2 归一化。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static extractFirstVector(output: any): Float32Array | null {
    const flat = this.outputToFloat32(output);
    if (!flat) return null;
    // mean-pooled 输出形状 = [batch, hidden_size];单条输入 batch=1 → 取前 NATIVE_DIMENSIONS 维
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
   * 静态工具:两个已归一化向量的余弦相似度(= 点积),clamp 到 [0, 1]。
   * 长度不匹配或任一为空返回 0。
   */
  static cosineSimilarity(
    a: Float32Array | number[] | null | undefined,
    b: Float32Array | number[] | null | undefined,
  ): number {
    return cosineSimilarity(a, b);
  }

  /**
   * 测试专用:重置内部状态。
   */
  static __resetForTesting(): void {
    this.pipeline = null;
    this.status = 'idle';
    this.initPromise = null;
    this.lastError = null;
    this.retryCount = 0;
  }

  /** 测试专用:跳过自动重试 */
  static __disableRetryForTesting(): void {
    this.retryCount = this.MAX_RETRIES;
  }
}
