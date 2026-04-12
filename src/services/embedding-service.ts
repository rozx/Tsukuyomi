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
export const MODEL_VERSION = 'embeddinggemma-300m@256';
export const DIMENSIONS = 256;
const NATIVE_DIMENSIONS = 768;

export type EmbeddingStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface EmbeddingProgressEvent {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  private static readonly events = new EventTarget();

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
            this.dispatch('progress', event);
          },
        });

        this.pipeline = extractor;
        this.setStatus('ready');
        this.dispatch('ready', { modelVersion: MODEL_VERSION });
      } catch (error) {
        this.lastError = error instanceof Error ? error : new Error(String(error));
        this.pipeline = null;
        this.setStatus('failed');
        this.dispatch('error', { error: this.lastError });
        console.warn('[EmbeddingService] 初始化失败:', this.lastError.message);
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
    this.setStatus('idle');
    await this.init();
  }

  /**
   * 对单条文本计算 embedding。
   * 返回 256 维 L2 归一化 Float32Array。
   * 未就绪或失败时返回 null(调用方 fallback 到纯关键词 + 时间衰减)。
   */
  static async embed(text: string): Promise<Float32Array | null> {
    if (!text || !text.trim()) return null;
    if (!this.isReady()) {
      // 不主动 init — 调用方应先显式 warmup/init
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const output = await this.pipeline!(text, {
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
   */
  static async embedBatch(texts: string[]): Promise<Array<Float32Array | null>> {
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const output = await this.pipeline!(
        indexed.map((e) => e.text),
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
  }
}
