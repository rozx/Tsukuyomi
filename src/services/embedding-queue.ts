/**
 * EmbeddingQueue — 异步批量嵌入任务队列(支持 memory + chapter 两类目标)
 *
 * 职责:
 * - 将待嵌入的目标(memory / chapter)排队,按 BATCH_SIZE 切片调用 EmbeddingService
 * - 完成批次后按 kind 分流持久化:
 *   · memory → updateMemoryEmbeddingInDB + syncMemoryEmbeddingCaches + dispatchMemoryChanged
 *              (leaf 组合: 写 IDB + 同步进程缓存 + 派发 embedding-updated 事件, 不反向 import
 *              MemoryService, 避免循环依赖)
 *   · chapter → ChapterEmbeddingService.embedChapter(整章一次,不与 memory 混批)
 * - 每批之间 yield 一次事件循环,避免长任务阻塞 UI
 * - 暴露进度事件(含 memory / chapter 分解)、暂停/恢复、ETA
 *
 * 与 EmbeddingService 的关系:
 * - EmbeddingService 负责模型加载与推理
 * - EmbeddingQueue 负责调度顺序、持久化与进度反馈
 *
 * 批处理策略:
 * - memory 摘要独立嵌入，正文切成最多 12 个短段，再按 BATCH_SIZE(8) 嵌入并聚合写入
 * - chapter 因为一章本身就是多 chunk 的一次完整嵌入,每次只处理一个 chapter,不与 memory 同批
 */

import { createCustomEventSubscriber, dispatchCustomEvent } from 'src/utils/dispatch-custom-event';
import { EmbeddingService } from 'src/services/embedding-service';
import {
  getMemoryByIdFromDB,
  getAllBookMemoriesFromDB,
  isMemoryEmbeddingStale,
  updateMemoryEmbeddingInDB,
  lookupMemoryBookId,
  MEMORY_EMBEDDING_VERSION,
} from 'src/utils/memory-embedding-lookup';
import { dispatchMemoryChanged, syncMemoryEmbeddingCaches } from 'src/services/memory-cache';
import { ChapterEmbeddingService } from 'src/services/chapter-embedding-service';
import type { Memory } from 'src/models/memory';
import type { Novel } from 'src/models/novel';
import { splitTextForEmbedding } from 'src/utils/embedding-text-segments';

const BATCH_SIZE = 8;
const ETA_WINDOW_SIZE = 5;

/**
 * 把一本书全部卷里的章节 ID 按顺序收进一个数组（跳过缺失卷/章节）。
 */
function collectAllChapterIds(volumes: NonNullable<Novel['volumes']>): string[] {
  const ids: string[] = [];
  for (const volume of volumes) {
    for (const chapter of volume.chapters ?? []) {
      ids.push(chapter.id);
    }
  }
  return ids;
}

export type QueueKind = 'memory' | 'chapter';

interface QueueItem {
  kind: QueueKind;
  id: string;
  /**
   * 所属书籍 ID。enqueue 时由调用方传入,未传则在进入 run 循环前懒解析并缓存。
   * 未能解析(记录被删、章节无归属)时为 null,将按单独一批处理,不与其它 item 混批。
   */
  bookId?: string | null;
}

export interface EmbeddingQueueBreakdown {
  total: number;
  completed: number;
  pending: number;
}

/**
 * 当前正在处理的批次元信息。用于 UI 跨书籍提示:
 * 用户在 Book A 的面板里看到 currentTask.bookId === Book B 就知道队列在别处忙。
 */
export interface EmbeddingQueueCurrentTask {
  kind: QueueKind;
  bookId: string | null;
  itemCount: number;
}

export interface EmbeddingQueueProgress {
  total: number;
  completed: number;
  pending: number;
  etaMs: number | null;
  running: boolean;
  paused: boolean;
  breakdown: {
    memory: EmbeddingQueueBreakdown;
    chapter: EmbeddingQueueBreakdown;
  };
  currentTask: EmbeddingQueueCurrentTask | null;
}

interface BatchTiming {
  count: number;
  durationMs: number;
}

// memoryNeedsEmbedding 已收敛到 memory-service.isMemoryEmbeddingStale(单一事实源)。
// 其它处也通过该 helper 判定 stale,保证 UI / backlog / 测试三方语义一致。

function buildMemorySegments(memory: Memory): string[] {
  const summary = (memory.summary ?? '').trim();
  const content = (memory.content ?? '').trim();
  const contentSegments = content ? splitTextForEmbedding(content) : [];
  if (!summary) return contentSegments;
  return [summary, ...contentSegments.filter((segment) => segment !== summary)];
}

export class EmbeddingQueue {
  private static pending: QueueItem[] = [];
  private static processing = false;
  private static paused = false;
  private static runScheduled = false;
  private static currentTask: EmbeddingQueueCurrentTask | null = null;
  /**
   * 同步/恢复期间由外部 gate 临时暂停时置位；用于在同步结束后只恢复"由 gate 挂起"的场景,
   * 避免把用户主动点击的 pause 一起解除。
   */
  private static syncGatePaused = false;

  // 分 kind 的会话统计
  private static totalEnqueued = { memory: 0, chapter: 0 };
  private static completed = { memory: 0, chapter: 0 };

  private static recentTimings: BatchTiming[] = [];

  private static readonly events = new EventTarget();

  /**
   * 懒解析 item 的 bookId 并缓存在 item 上。
   * - memory:查 getMemoryByIdFromDB
   * - chapter:扫 booksStore 找所属书
   * 解析失败(记录已删/Pinia 未初始化)返回 null,由批处理策略单独走一批不混批。
   */
  private static async resolveBookId(item: QueueItem): Promise<string | null> {
    if (item.bookId !== undefined) return item.bookId;
    let resolved: string | null = null;
    try {
      if (item.kind === 'memory') {
        const mem = await getMemoryByIdFromDB(item.id);
        resolved = mem?.bookId ?? null;
      } else {
        // 直接从 IndexedDB 反查,避免 import stores/books 形成循环依赖
        const { lookupChapterBookFromDB } = await import('src/utils/chapter-book-lookup');
        const lookup = await lookupChapterBookFromDB(item.id);
        resolved = lookup?.bookId ?? null;
      }
    } catch {
      resolved = null;
    }
    item.bookId = resolved;
    return resolved;
  }

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

  // ==========================================================================
  // 事件订阅
  // 通过 createCustomEventSubscriber 工厂注入共享底层，保留 type 字面量窄化。
  // ==========================================================================
  static addEventListener = createCustomEventSubscriber<
    'progress' | 'batch-complete' | 'error' | 'idle'
  >(this.events);

  private static dispatch(type: string, detail?: unknown): void {
    dispatchCustomEvent(this.events, type, detail);
  }

  private static emitProgress(): void {
    this.dispatch('progress', this.getProgress());
  }

  // ==========================================================================
  // 入队 / 取消
  // ==========================================================================
  /**
   * 兼容旧接口:memory 入队。可选 bookId 用于让队列按书籍串行化批处理;
   * 不传则在 run 循环里懒解析。
   */
  static enqueue(memoryId: string, bookId?: string): void {
    this.enqueueMemory(memoryId, bookId);
  }

  static enqueueMemory(memoryId: string, bookId?: string): void {
    if (!memoryId) return;
    if (this.pending.some((item) => item.kind === 'memory' && item.id === memoryId)) return;
    const item: QueueItem = { kind: 'memory', id: memoryId };
    if (bookId) item.bookId = bookId;
    this.pending.push(item);
    this.totalEnqueued.memory += 1;
    this.emitProgress();
    this.scheduleRun();
  }

  static enqueueChapter(chapterId: string, bookId?: string): void {
    if (!chapterId) return;
    if (this.pending.some((item) => item.kind === 'chapter' && item.id === chapterId)) return;
    const item: QueueItem = { kind: 'chapter', id: chapterId };
    if (bookId) item.bookId = bookId;
    this.pending.push(item);
    this.totalEnqueued.chapter += 1;
    this.emitProgress();
    this.scheduleRun();
  }

  static cancel(memoryId: string): void {
    this.cancelMemory(memoryId);
  }

  static cancelMemory(memoryId: string): void {
    const idx = this.pending.findIndex((item) => item.kind === 'memory' && item.id === memoryId);
    if (idx >= 0) {
      this.pending.splice(idx, 1);
      this.totalEnqueued.memory -= 1;
      this.emitProgress();
    }
  }

  static cancelChapter(chapterId: string): void {
    const idx = this.pending.findIndex((item) => item.kind === 'chapter' && item.id === chapterId);
    if (idx >= 0) {
      this.pending.splice(idx, 1);
      this.totalEnqueued.chapter -= 1;
      this.emitProgress();
    }
  }

  /**
   * 扫描指定书籍的所有 Memory,把缺失或版本过期的全部入队。
   */
  static async enqueueBacklog(bookId: string): Promise<number> {
    if (!bookId) return 0;
    try {
      const memories = await getAllBookMemoriesFromDB(bookId);
      let added = 0;
      for (const mem of memories) {
        if (!isMemoryEmbeddingStale(mem)) continue;
        if (this.pending.some((item) => item.kind === 'memory' && item.id === mem.id)) continue;
        this.pending.push({ kind: 'memory', id: mem.id, bookId });
        added += 1;
      }
      if (added > 0) {
        this.totalEnqueued.memory += added;
        this.emitProgress();
        this.scheduleRun();
      }
      return added;
    } catch (error) {
      console.warn('[EmbeddingQueue] enqueueBacklog 失败:', error);
      return 0;
    }
  }

  /**
   * 把一组章节 ID 中尚未入队的全部追加进 pending（去重），返回新增数量。
   * enqueueChapterBacklog / enqueueAllChaptersForRecompute 共用。
   */
  private static enqueueUniqueChapterIds(chapterIds: string[], bookId: string): number {
    let added = 0;
    for (const chId of chapterIds) {
      if (this.pending.some((item) => item.kind === 'chapter' && item.id === chId)) continue;
      this.pending.push({ kind: 'chapter', id: chId, bookId });
      added += 1;
    }
    return added;
  }

  /**
   * 扫描指定书籍的所有章节,把缺失或 model 版本过期的全部入队。
   */
  static async enqueueChapterBacklog(bookId: string): Promise<number> {
    if (!bookId) return 0;
    try {
      const chapterIds = await ChapterEmbeddingService.findChaptersNeedingEmbedding(bookId);
      const added = this.enqueueUniqueChapterIds(chapterIds, bookId);
      if (added > 0) {
        this.totalEnqueued.chapter += added;
        this.emitProgress();
        this.scheduleRun();
      }
      return added;
    } catch (error) {
      console.warn('[EmbeddingQueue] enqueueChapterBacklog 失败:', error);
      return 0;
    }
  }

  /**
   * 把一本书的所有章节强制全部入队(不判断是否已嵌入)。
   */
  static async enqueueAllChaptersForRecompute(bookId: string): Promise<number> {
    if (!bookId) return 0;
    try {
      // 直接从 IndexedDB 加载 book 元数据,避免 import stores/books 形成循环依赖
      const { loadBookMetaFromDB } = await import('src/utils/chapter-book-lookup');
      const book = await loadBookMetaFromDB(bookId);
      if (!book?.volumes) return 0;
      const added = this.enqueueUniqueChapterIds(collectAllChapterIds(book.volumes), bookId);
      if (added > 0) {
        this.totalEnqueued.chapter += added;
        this.emitProgress();
        this.scheduleRun();
      }
      return added;
    } catch (error) {
      console.warn('[EmbeddingQueue] enqueueAllChaptersForRecompute 失败:', error);
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

  /**
   * 同步/恢复期间的外部 gate：
   * - shouldPause=true 时,若队列当前未暂停则挂起,并记下"挂起是 gate 触发的"
   * - shouldPause=false 时,只解除由 gate 造成的挂起;若用户通过 UI 主动 pause 过就保留
   *
   * 这是为了避免 sync 结束后把用户手动点击的暂停一起抹掉(BatchEmbeddingsPanel / MemoryPanel
   * 暴露了手动 pause/resume 按钮)。
   */
  static applySyncGate(shouldPause: boolean): void {
    if (shouldPause) {
      if (this.paused) return;
      this.paused = true;
      this.syncGatePaused = true;
      this.emitProgress();
      return;
    }
    if (!this.syncGatePaused) return;
    this.syncGatePaused = false;
    this.paused = false;
    this.emitProgress();
    this.scheduleRun();
  }

  /**
   * 尝试消费现有 pending。用户在 Settings 里重新开启本地嵌入时调用,
   * 这样之前 mid-run 被总开关打断后保留下来的 item 能自动继续处理,
   * 不必让用户再手动 enqueue 一次。
   *
   * - pending 为空 → 没事发生
   * - 已在 processing → scheduleRun 内部短路,无害
   * - pending 有东西且未 paused → 启动 run(run 内部会等 EmbeddingService 就绪)
   */
  static tryResume(): void {
    this.scheduleRun();
  }

  // ==========================================================================
  // 进度
  // ==========================================================================
  static getProgress(): EmbeddingQueueProgress {
    let pendingMem = 0;
    let pendingChap = 0;
    for (const item of this.pending) {
      if (item.kind === 'memory') pendingMem += 1;
      else pendingChap += 1;
    }
    const breakdown = {
      memory: {
        total: this.totalEnqueued.memory,
        completed: this.completed.memory,
        pending: pendingMem,
      },
      chapter: {
        total: this.totalEnqueued.chapter,
        completed: this.completed.chapter,
        pending: pendingChap,
      },
    };
    return {
      total: breakdown.memory.total + breakdown.chapter.total,
      completed: breakdown.memory.completed + breakdown.chapter.completed,
      pending: breakdown.memory.pending + breakdown.chapter.pending,
      etaMs: this.estimateEtaMs(),
      running: this.processing,
      paused: this.paused,
      breakdown,
      currentTask: this.currentTask,
    };
  }

  private static estimateEtaMs(): number | null {
    if (this.pending.length === 0) return 0;
    if (this.recentTimings.length === 0) return null;
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
  // 处理循环
  // ==========================================================================
  /**
   * 检查总电源 `enableLocalEmbedding` — 关闭时 run 直接退出,pending 保留待重开。
   * 读 store 放在 try/catch 里,兼容测试环境(未初始化 Pinia)和启动早期路径。
   */
  private static async isLocalEmbeddingEnabled(): Promise<boolean> {
    try {
      // 直接从 IndexedDB 读 settings,避免 import stores/settings 形成循环依赖
      const { readEnableLocalEmbeddingFromDB } = await import('src/utils/settings-lookup');
      const { isLocalEmbeddingEffectivelyEnabled } = await import('src/utils/local-embedding');
      const value = await readEnableLocalEmbeddingFromDB();
      return isLocalEmbeddingEffectivelyEnabled(value);
    } catch {
      // 读取失败时,按"未启用"保守处理,避免测试环境误触发下载
      return false;
    }
  }

  private static async takeNextBatch(): Promise<{
    head: QueueItem;
    headBookId: string | null;
    batchItems: QueueItem[];
  }> {
    // 取下一批:同 kind + 同 bookId 连续合批(memory 合到 BATCH_SIZE;chapter 单个)。
    // 串行化到单本书是为了让 UI 面板有清晰的"当前在处理哪本书"语义——避免 A/B 两本书
    // 的 chunk 交叉穿插让进度条来回跳。bookId 解析不出(记录已删)的 item 单独一批。
    const head = this.pending[0]!;
    const headBookId = await this.resolveBookId(head);
    if (head.kind !== 'memory') {
      return { head, headBookId, batchItems: [this.pending.shift()!] };
    }
    const take = Math.min(BATCH_SIZE, this.pending.length);
    const batchItems: QueueItem[] = [];
    for (let i = 0; i < take; i++) {
      const item = this.pending[i]!;
      if (item.kind !== 'memory') break;
      const itemBook = await this.resolveBookId(item);
      if (itemBook !== headBookId) break;
      batchItems.push(item);
    }
    this.pending.splice(0, batchItems.length);
    return { head, headBookId, batchItems };
  }

  private static async runNextBatch(
    head: QueueItem,
    headBookId: string | null,
    batchItems: QueueItem[],
  ): Promise<void> {
    // 广播 currentTask,让 UI 能感知"队列在处理哪本书"
    this.currentTask = {
      kind: head.kind,
      bookId: headBookId,
      itemCount: batchItems.length,
    };
    this.emitProgress();

    const startedAt = Date.now();
    try {
      if (head.kind === 'memory') {
        await this.processMemoryBatch(batchItems.map((item) => item.id));
      } else {
        await this.processChapter(batchItems[0]!.id);
      }
    } catch (error) {
      console.warn('[EmbeddingQueue] 批处理失败,继续下一批:', error);
      this.dispatch('error', { error, batchItems });
      if (head.kind === 'memory') this.completed.memory += batchItems.length;
      else this.completed.chapter += 1;
    }
    const durationMs = Date.now() - startedAt;
    this.recordTiming(batchItems.length, durationMs);
    this.currentTask = null;
    this.dispatch('batch-complete', {
      kind: head.kind,
      batchSize: batchItems.length,
      durationMs,
      remaining: this.pending.length,
    });
    this.emitProgress();
  }

  private static async run(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    this.emitProgress();

    try {
      if (!(await this.isLocalEmbeddingEnabled())) {
        // 总电源关 → 保留 pending,等用户开启后 resume() / scheduleRun() 再消费
        console.info('[EmbeddingQueue] 本地嵌入未启用,保留 pending 任务');
        this.processing = false;
        this.emitProgress();
        return;
      }

      if (!EmbeddingService.isReady()) {
        await EmbeddingService.init();
      }
      if (!EmbeddingService.isReady()) {
        console.warn('[EmbeddingQueue] EmbeddingService 未就绪,等待下次触发');
        this.processing = false;
        this.emitProgress();
        return;
      }

      while (this.pending.length > 0 && !this.paused) {
        // 每轮循环开始时重新读取总开关:用户在 UI 上关闭嵌入应该立刻停下一批工作,
        // 不能让队列把剩下的 pending 全部跑完。正在跑的这一批无法中途 abort
        // (Transformers.js pipeline 调用不支持),所以只能做到"当前批次完成后立即停"。
        if (!(await this.isLocalEmbeddingEnabled())) {
          console.info('[EmbeddingQueue] 本地嵌入被关闭,停止处理剩余 pending');
          break;
        }
        const { head, headBookId, batchItems } = await this.takeNextBatch();
        await this.runNextBatch(head, headBookId, batchItems);
        await new Promise((r) => setTimeout(r, 0));
      }

      if (this.pending.length === 0) {
        this.dispatch('idle', {
          totalProcessed: this.completed.memory + this.completed.chapter,
        });
        this.totalEnqueued = { memory: 0, chapter: 0 };
        this.completed = { memory: 0, chapter: 0 };
        this.recentTimings = [];
      }
    } finally {
      this.processing = false;
      this.currentTask = null;
      this.emitProgress();
    }
  }

  /**
   * 处理一批 memory id
   */
  private static async processMemoryBatch(ids: string[]): Promise<void> {
    const memories: Array<{ id: string; segments: string[] } | null> = await Promise.all(
      ids.map(async (id) => {
        try {
          const mem = await getMemoryByIdFromDB(id);
          if (!mem) return null;
          const segments = buildMemorySegments(mem);
          if (segments.length === 0) return null;
          return { id, segments };
        } catch {
          return null;
        }
      }),
    );

    const valid = memories.filter(
      (memory): memory is { id: string; segments: string[] } => memory !== null,
    );
    if (valid.length === 0) {
      this.completed.memory += ids.length;
      return;
    }

    const segmentJobs = valid.flatMap((memory) =>
      memory.segments.map((text) => ({ memoryId: memory.id, text })),
    );
    const vectorsByMemory = new Map<string, number[][]>();
    for (let index = 0; index < segmentJobs.length; index += BATCH_SIZE) {
      const batch = segmentJobs.slice(index, index + BATCH_SIZE);
      const vectors = await EmbeddingService.embedBatch(
        batch.map((job) => job.text),
        'document',
      );
      batch.forEach((job, vectorIndex) => {
        const vector = vectors[vectorIndex];
        if (!vector) return;
        const memoryVectors = vectorsByMemory.get(job.memoryId) ?? [];
        memoryVectors.push(Array.from(vector));
        vectorsByMemory.set(job.memoryId, memoryVectors);
      });
    }

    await Promise.all(
      valid.map(async (entry) => {
        const embeddings = vectorsByMemory.get(entry.id);
        if (!embeddings?.length) return;
        try {
          // 写 IDB（leaf）+ 同步进程内缓存 + 派发 'embedding-updated' 事件。
          // 全部走叶子模块（memory-embedding-lookup / memory-cache），避免 EmbeddingQueue
          // 反向 import MemoryService 形成循环依赖。
          await updateMemoryEmbeddingInDB(entry.id, embeddings, MEMORY_EMBEDDING_VERSION);
          const bookId = await lookupMemoryBookId(entry.id);
          if (bookId) {
            syncMemoryEmbeddingCaches(bookId, entry.id, embeddings, MEMORY_EMBEDDING_VERSION);
            dispatchMemoryChanged({ bookId, memoryId: entry.id, action: 'embedding-updated' });
          }
        } catch (error) {
          console.warn(`[EmbeddingQueue] 持久化 memory embedding 失败 (${entry.id}):`, error);
        }
      }),
    );

    this.completed.memory += ids.length;
  }

  /**
   * 处理单个 chapter(内部切 chunk、batch embed、原子写入)
   */
  private static async processChapter(chapterId: string): Promise<void> {
    try {
      await ChapterEmbeddingService.embedChapter(chapterId);
    } finally {
      this.completed.chapter += 1;
    }
  }

  // ==========================================================================
  // 测试辅助
  // ==========================================================================
  static __resetForTesting(): void {
    this.pending = [];
    this.processing = false;
    this.paused = false;
    this.syncGatePaused = false;
    this.runScheduled = false;
    this.currentTask = null;
    this.totalEnqueued = { memory: 0, chapter: 0 };
    this.completed = { memory: 0, chapter: 0 };
    this.recentTimings = [];
  }
}
