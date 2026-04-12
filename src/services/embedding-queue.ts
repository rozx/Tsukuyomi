/**
 * EmbeddingQueue — 异步批量嵌入任务队列
 *
 * 职责:
 * - 将待嵌入的 Memory ID 排队,按 BATCH_SIZE 切片调用 EmbeddingService.embedBatch
 * - 完成批次后通过 MemoryService.updateMemoryEmbeddingOnly 持久化,不触发 Gist dirty
 * - 每批之间 yield 一次事件循环,避免长任务阻塞 UI
 * - 暴露进度事件(进度横幅订阅)与暂停/恢复(用户在设置里关闭语义检索时调用)
 *
 * 与 EmbeddingService 的关系:
 * - EmbeddingService 负责模型加载与推理
 * - EmbeddingQueue 负责调度顺序、持久化与进度反馈
 */

import { EmbeddingService, MODEL_VERSION } from 'src/services/embedding-service';
import { MemoryService } from 'src/services/memory-service';
import type { Memory } from 'src/models/memory';

const BATCH_SIZE = 8;
const ETA_WINDOW_SIZE = 5;

export interface EmbeddingQueueProgress {
  total: number; // 本轮会话累计入队数
  completed: number; // 已处理(成功或失败)
  pending: number; // 尚未处理
  etaMs: number | null; // 预计剩余时间(null=无法估算)
  running: boolean;
  paused: boolean;
}

interface BatchTiming {
  count: number;
  durationMs: number;
}

/**
 * 判断一条 Memory 是否需要(重新)嵌入:
 * - 无 embedding 字段
 * - 或 embeddingModel 与当前 MODEL_VERSION 不一致(模型升级 / 旧格式)
 */
function needsEmbedding(memory: Memory): boolean {
  if (!memory.embedding || memory.embedding.length === 0) return true;
  if (memory.embeddingModel !== MODEL_VERSION) return true;
  return false;
}

/**
 * 构造用于嵌入的输入文本。summary + content 简单拼接,最大化语义信号。
 */
function buildInput(memory: Memory): string {
  const summary = (memory.summary ?? '').trim();
  const content = (memory.content ?? '').trim();
  if (!summary && !content) return '';
  if (!summary) return content;
  if (!content) return summary;
  return `${summary}\n\n${content}`;
}

export class EmbeddingQueue {
  private static pending: string[] = [];
  private static processing = false;
  private static paused = false;
  private static runScheduled = false;

  /**
   * 延后到微任务再启动处理循环,确保同步连续的多次 enqueue 能够聚合到同一批次。
   */
  private static scheduleRun(): void {
    if (this.processing || this.paused || this.runScheduled) return;
    if (this.pending.length === 0) return;
    this.runScheduled = true;
    queueMicrotask(() => {
      this.runScheduled = false;
      if (!this.processing && !this.paused && this.pending.length > 0) {
        void this.run();
      }
    });
  }

  private static totalEnqueued = 0;
  private static completed = 0;

  // 滑动窗口 — 最近 N 批的吞吐量用于 ETA 估算
  private static recentTimings: BatchTiming[] = [];

  private static readonly events = new EventTarget();

  // ==========================================================================
  // 事件订阅
  // ==========================================================================
  static addEventListener(
    type: 'progress' | 'batch-complete' | 'error' | 'idle',
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

  private static emitProgress(): void {
    this.dispatch('progress', this.getProgress());
  }

  // ==========================================================================
  // 入队 / 取消
  // ==========================================================================
  /**
   * 将单条 Memory 加入队列。已在队列中则跳过。
   * 若队列空闲,立即启动处理循环(不 await)。
   */
  static enqueue(memoryId: string): void {
    if (!memoryId) return;
    if (this.pending.includes(memoryId)) return;
    this.pending.push(memoryId);
    this.totalEnqueued += 1;
    this.emitProgress();
    this.scheduleRun();
  }

  /**
   * 从队列中移除未开始的任务。已进入当前批次的无法取消(与批处理语义一致)。
   */
  static cancel(memoryId: string): void {
    const idx = this.pending.indexOf(memoryId);
    if (idx >= 0) {
      this.pending.splice(idx, 1);
      // totalEnqueued 保持不变:它代表"本轮会话累计入队",用于显示分母
      // 但让 completed 加一,使进度条正确前进
      this.completed += 1;
      this.emitProgress();
    }
  }

  /**
   * 扫描指定书籍的所有 Memory,把缺失或版本过期的全部入队(lazy backfill)。
   */
  static async enqueueBacklog(bookId: string): Promise<number> {
    if (!bookId) return 0;
    try {
      const memories = await MemoryService.getAllBookMemories(bookId);
      let added = 0;
      for (const mem of memories) {
        if (needsEmbedding(mem) && !this.pending.includes(mem.id)) {
          this.pending.push(mem.id);
          added += 1;
        }
      }
      if (added > 0) {
        this.totalEnqueued += added;
        this.emitProgress();
        this.scheduleRun();
      }
      return added;
    } catch (error) {
      console.warn('[EmbeddingQueue] enqueueBacklog 失败:', error);
      return 0;
    }
  }

  // ==========================================================================
  // 暂停 / 恢复
  // ==========================================================================
  static pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.emitProgress();
  }

  static resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.emitProgress();
    this.scheduleRun();
  }

  static isPaused(): boolean {
    return this.paused;
  }

  static isRunning(): boolean {
    return this.processing;
  }

  // ==========================================================================
  // 进度
  // ==========================================================================
  static getProgress(): EmbeddingQueueProgress {
    const pending = this.pending.length;
    const completed = this.completed;
    const total = this.totalEnqueued;
    return {
      total,
      completed,
      pending,
      etaMs: this.estimateEtaMs(),
      running: this.processing,
      paused: this.paused,
    };
  }

  private static estimateEtaMs(): number | null {
    if (this.pending.length === 0) return 0;
    if (this.recentTimings.length === 0) return null;
    // 计算最近 N 批的 平均 "每条耗时"
    let totalCount = 0;
    let totalMs = 0;
    for (const t of this.recentTimings) {
      totalCount += t.count;
      totalMs += t.durationMs;
    }
    if (totalCount === 0) return null;
    const perItemMs = totalMs / totalCount;
    return Math.round(perItemMs * this.pending.length);
  }

  private static recordTiming(count: number, durationMs: number): void {
    this.recentTimings.push({ count, durationMs });
    if (this.recentTimings.length > ETA_WINDOW_SIZE) {
      this.recentTimings.shift();
    }
  }

  // ==========================================================================
  // 处理循环(核心)
  // ==========================================================================
  private static async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    this.emitProgress();

    try {
      // 确保 pipeline 已就绪;未就绪则尝试 init,仍失败则清空队列返回
      if (!EmbeddingService.isReady()) {
        await EmbeddingService.init();
      }
      if (!EmbeddingService.isReady()) {
        console.warn('[EmbeddingQueue] EmbeddingService 未就绪,清空队列等待重试');
        // 不丢弃队列 — 让下次 resume/enqueue 触发时重试
        this.processing = false;
        this.emitProgress();
        return;
      }

      while (this.pending.length > 0 && !this.paused) {
        const batchIds = this.pending.splice(0, BATCH_SIZE);
        const startedAt = Date.now();
        try {
          await this.processBatch(batchIds);
        } catch (error) {
          console.warn('[EmbeddingQueue] 批处理失败,继续下一批:', error);
          this.dispatch('error', { error, batchIds });
          // 失败的批也计入 completed,避免进度卡住
          this.completed += batchIds.length;
        }
        const durationMs = Date.now() - startedAt;
        this.recordTiming(batchIds.length, durationMs);
        this.dispatch('batch-complete', {
          batchSize: batchIds.length,
          durationMs,
          remaining: this.pending.length,
        });
        this.emitProgress();

        // yield 给事件循环,避免长时间阻塞 UI
        await new Promise((r) => setTimeout(r, 0));
      }

      if (this.pending.length === 0) {
        // 全部完成 — 重置会话统计,让下一轮从 0 开始
        this.dispatch('idle', {
          totalProcessed: this.completed,
        });
        this.totalEnqueued = 0;
        this.completed = 0;
        this.recentTimings = [];
      }
    } finally {
      this.processing = false;
      this.emitProgress();
    }
  }

  /**
   * 处理一批 memory id:查 DB → embedBatch → 持久化。
   */
  private static async processBatch(ids: string[]): Promise<void> {
    // 先拉取 memory 数据(带 content/summary)
    const memories: Array<{ id: string; text: string } | null> = await Promise.all(
      ids.map(async (id) => {
        try {
          const mem = await MemoryService.getMemoryByIdOnly(id);
          if (!mem) return null;
          const text = buildInput(mem);
          if (!text) return null;
          return { id, text };
        } catch {
          return null;
        }
      }),
    );

    const valid = memories.filter((m): m is { id: string; text: string } => m !== null);
    if (valid.length === 0) {
      this.completed += ids.length;
      return;
    }

    const vectors = await EmbeddingService.embedBatch(valid.map((m) => m.text));

    // 持久化:成功的写入,失败的计入 completed
    await Promise.all(
      valid.map(async (entry, idx) => {
        const vec = vectors[idx];
        if (!vec) return;
        try {
          await MemoryService.updateMemoryEmbeddingOnly(
            entry.id,
            Array.from(vec),
            MODEL_VERSION,
          );
        } catch (error) {
          console.warn(`[EmbeddingQueue] 持久化 embedding 失败 (${entry.id}):`, error);
        }
      }),
    );

    this.completed += ids.length;
  }

  // ==========================================================================
  // 测试辅助
  // ==========================================================================
  static __resetForTesting(): void {
    this.pending = [];
    this.processing = false;
    this.paused = false;
    this.runScheduled = false;
    this.totalEnqueued = 0;
    this.completed = 0;
    this.recentTimings = [];
  }
}
