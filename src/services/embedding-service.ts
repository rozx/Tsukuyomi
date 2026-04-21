/**
 * EmbeddingService — 基于 Transformers.js 的本地特征提取
 *
 * 约定:
 * - 使用 GTE-Multilingual-Base ONNX(Alibaba 2024),305M 参数 BERT-encoder。
 *   体积:WebGPU q4f16 ~465MB / WASM int8 ~340MB。
 *   相比 Qwen3-Embedding-0.6B(decoder + last-token pooling)同硬件下快 3-5×,
 *   因为 encoder 的 forward pass 比同等参数的 decoder 轻很多。
 * - 采用 Matryoshka 表征:从原生 768 维中截取前 256 维,再 L2 归一化。
 * - 模型加载走动态 import,确保 Transformers.js 不进主 bundle。
 * - 失败时静默降级:调用方通过 getStatus() 感知,不会抛到 UI 顶层。
 */

import { cosineSimilarity } from 'src/utils/cosine-similarity';
import { dispatchCustomEvent, subscribeCustomEvent } from 'src/utils/dispatch-custom-event';

// fallow-ignore-next-line unused-export
export const MODEL_ID = 'onnx-community/gte-multilingual-base';
// 模型 id + 截取维度 + 前缀方案 + pooling 方案 共同构成 embedding 空间身份,任一变化必须 bump 版本号,
// EmbeddingQueue backlog 扫描会把版本不匹配的记录当作 stale 自动重算。
export const MODEL_VERSION = 'gte-multilingual-base@256@mean';
export const DIMENSIONS = 256;
const NATIVE_DIMENSIONS = 768;

export type EmbeddingStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * 运行后端:WebGPU 优先,不可用/初始化失败时回落 WASM(CPU)。
 * 两者体积差不多,但 WebGPU 上推理速度可快 5-10 倍(尤其对 0.6B 级别模型)。
 */
export type EmbeddingBackend = 'webgpu' | 'wasm';

interface PipelineConfig {
  device: EmbeddingBackend;
  dtype: 'q4f16' | 'int8';
}

/** WebGPU 上:4-bit 权重 + fp16 激活,gte 的 q4f16 ≈ 465MB。 */
const WEBGPU_CONFIG: PipelineConfig = { device: 'webgpu', dtype: 'q4f16' };
/** WASM 上:8-bit 量化,gte 的 int8 ≈ 340MB,兼容性最好但速度慢于 WebGPU 许多。 */
const WASM_CONFIG: PipelineConfig = { device: 'wasm', dtype: 'int8' };

function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * GTE-Multilingual 官方非对称检索方案(参见 Alibaba-NLP/gte-multilingual-base 模型卡):
 * - query 端:`Represent this sentence for searching relevant passages: {text}`
 * - document 端:原文不加任何前缀 — 直接 encode
 *
 * 两侧必须严格配对:若 query 漏加前缀或 document 误加前缀,余弦相似度会退化。
 * 前缀字面量用英文,文档/查询本体可任意语言(模型原生多语言)。
 */
export type EmbeddingTask = 'query' | 'document';
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

/**
 * Pooling 方案 — gte-multilingual-base 是 encoder-only BERT,官方指定 mean pooling。
 * 单条 embed() 与批处理 embedBatch() 必须使用同一方案,否则 query 向量和 document 向量
 * 落到不同空间,余弦相似度退化成噪声。集中在此常量避免两处手写漂移。
 * 该值也是 MODEL_VERSION 的一部分——变更 pooling 必须同时 bump 版本号。
 */
const POOLING = 'mean' as const;

function applyTaskPrefix(text: string, task: EmbeddingTask): string {
  if (task === 'query') return QUERY_PREFIX + text;
  return text; // document 侧不加前缀
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

  /**
   * WebGPU 初始化是否失败过:失败一次就不再重试,本会话内永久回落 WASM。
   * 避免在无 WebGPU 的浏览器里每次重试都再次触发 WebGPU 探测。
   */
  private static webGpuBlacklisted = false;
  /** 最终加载成功的后端,供 UI 展示(q4f16 / q8 速度差 5-10 倍,用户应该能看到) */
  private static activeBackend: EmbeddingBackend | null = null;

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
    return subscribeCustomEvent(this.events, type, listener);
  }

  private static dispatch(type: string, detail?: unknown): void {
    dispatchCustomEvent(this.events, type, detail);
  }

  private static setStatus(next: EmbeddingStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.dispatch('status-changed', { status: next });
  }

  static isReady(): boolean {
    return this.status === 'ready' && this.pipeline !== null;
  }

  /** 当前加载成功的后端,未 init 或失败时返回 null */
  static getActiveBackend(): EmbeddingBackend | null {
    return this.activeBackend;
  }

  /** 按当前会话状态决定本次 init 用什么后端 + dtype */
  private static pickConfig(): PipelineConfig {
    if (!this.webGpuBlacklisted && hasWebGPU()) return WEBGPU_CONFIG;
    return WASM_CONFIG;
  }

  /**
   * 检测浏览器 Cache Storage 中是否已存在模型文件。
   * Transformers.js 通过 Cache API 持久化模型权重,命中则说明之前在本设备加载过。
   * 用于启动时判断是否可以静默 warmup(无需等用户再次触发下载)。
   */
  // fallow-ignore-next-line unused-class-member
  static async isModelCachedInBrowser(): Promise<boolean> {
    try {
      if (typeof caches === 'undefined') return false;
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        if (keys.some((req) => req.url.toLowerCase().includes('gte-multilingual'))) {
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

        // 按 pickConfig 的结果决定 backend + dtype:
        // - WebGPU 支持: q4f16 (~567MB, 推理 5-10x 快于 WASM)
        // - WASM 回落:  q8  (~614MB, 兼容性最好)
        const config = this.pickConfig();
        console.info(
          `[EmbeddingService] 使用后端 ${config.device} + dtype ${config.dtype}`,
        );
        const extractor = await pipeline('feature-extraction', MODEL_ID, {
          dtype: config.dtype,
          device: config.device,
          progress_callback: (event: EmbeddingProgressEvent) => {
            this.dispatch('progress', this.enrichWithAggregate(event));
          },
        });

        this.pipeline = extractor;
        this.activeBackend = config.device;
        this.retryCount = 0; // 成功后重置重试计数
        this.setStatus('ready');
        this.dispatch('ready', { modelVersion: MODEL_VERSION, backend: config.device });
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
          this.dispatch('error', {
            error: this.lastError,
            retrying: true,
            fallbackToWasm: true,
          });
          this.initPromise = null;
          void this.init();
          return;
        }

        // 自动重试(递增延迟)
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
    this.activeBackend = null;
    // reload 是用户主动触发,清空 WebGPU 黑名单 — 可能他们换了 GPU 驱动或启用了 flag
    this.webGpuBlacklisted = false;
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
        pooling: POOLING,
        normalize: false, // 我们手动处理截断 + 归一化(Matryoshka 截前 DIMENSIONS 维后再 L2)
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
          pooling: POOLING,
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
    this.activeBackend = null;
    this.webGpuBlacklisted = false;
  }

  /** 测试专用:跳过自动重试 */
  static __disableRetryForTesting(): void {
    this.retryCount = this.MAX_RETRIES;
  }
}
