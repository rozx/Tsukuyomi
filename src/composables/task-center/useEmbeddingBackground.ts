import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import {
  EmbeddingQueue,
  type EmbeddingQueueCurrentTask,
  type EmbeddingQueueProgress,
} from 'src/services/embedding-queue';
import { EmbeddingService, type EmbeddingStatus } from 'src/services/embedding-service';
import {
  ChapterEmbeddingService,
  isChapterChunkStale,
} from 'src/services/chapter-embedding-service';
import { MemoryService, isMemoryEmbeddingStale } from 'src/services/memory-service';
import { isLocalEmbeddingEffectivelyEnabled } from 'src/utils/local-embedding';

/** 合并同一批事件的刷新间隔 */
const STATS_REFRESH_DELAY_MS = 100;

type Stats = { embedded: number; total: number };
type StatBreakdown = Stats & { stale: number };

async function loadChapterBreakdown(bookId: string, total: number): Promise<StatBreakdown> {
  try {
    const chunks = await ChapterEmbeddingService.getChunksForBook(bookId);
    // 按章节聚合：有当前版本 chunk 的章节算已嵌入；只有旧版本 chunk 的章节算旧向量
    const statusByChapter = new Map<string, 'current' | 'stale'>();
    for (const chunk of chunks) {
      if (!isChapterChunkStale(chunk)) statusByChapter.set(chunk.chapterId, 'current');
      else if (!statusByChapter.has(chunk.chapterId)) statusByChapter.set(chunk.chapterId, 'stale');
    }
    let embedded = 0;
    let stale = 0;
    for (const status of statusByChapter.values()) {
      if (status === 'current') embedded += 1;
      else stale += 1;
    }
    return { embedded, total, stale };
  } catch (error) {
    console.warn('[EmbeddingBackground] 读取章节向量统计失败:', error);
    return { embedded: 0, total, stale: 0 };
  }
}

async function loadMemoryBreakdown(bookId: string): Promise<StatBreakdown> {
  try {
    const memories = await MemoryService.getAllBookMemories(bookId);
    let embedded = 0;
    let stale = 0;
    for (const memory of memories) {
      if (!memory.embeddings?.some((embedding) => embedding.length > 0)) continue;
      if (isMemoryEmbeddingStale(memory)) stale += 1;
      else embedded += 1;
    }
    return { embedded, total: memories.length, stale };
  } catch (error) {
    console.warn('[EmbeddingBackground] 读取记忆向量统计失败:', error);
    return { embedded: 0, total: 0, stale: 0 };
  }
}

/**
 * 任务中心「后台 · 向量化」区的状态与操作。
 *
 * - 队列进度始终订阅（只更新轻量计数），chip 在任务中心从未打开过时也能判断是否有后台活动；
 * - 本书章节 / 记忆的嵌入统计要读整本书的向量，只在 `visible`（任务中心可见且该区展开）时节流刷新；
 * - 当前书取自书籍详情路由，其他页面不计算本书统计，补齐 / 重建不做任何事。
 */
export function createEmbeddingBackground(options: { visible: MaybeRefOrGetter<boolean> }) {
  const route = useRoute();
  const router = useRouter();
  const books = useBooksStore();
  const settings = useSettingsStore();

  const enabled = computed(() =>
    isLocalEmbeddingEffectivelyEnabled(settings.settings.enableLocalEmbedding),
  );
  const visible = computed(() => enabled.value && toValue(options.visible));

  // ---------- 队列与模型状态 ----------
  const progress = ref<EmbeddingQueueProgress>(EmbeddingQueue.getProgress());
  const embeddingStatus = ref<EmbeddingStatus>(EmbeddingService.getStatus());

  /** 有待处理或正在处理的项，且没有被用户暂停或同步挂起 */
  const active = computed(
    () =>
      enabled.value &&
      !progress.value.paused &&
      (progress.value.running || progress.value.pending > 0),
  );

  // 队列在两批之间会短暂把 currentTask 清成 null：运行期间保留最后一次看到的任务，避免整行闪烁
  const currentTask = ref<EmbeddingQueueCurrentTask | null>(progress.value.currentTask);
  watch(
    () => progress.value.currentTask,
    (task) => {
      if (task) currentTask.value = task;
    },
  );
  watch(
    () => progress.value.running,
    (running) => {
      if (!running) currentTask.value = null;
    },
  );

  // ---------- 当前书 ----------
  const bookId = computed(() =>
    route.path.startsWith('/books/') && typeof route.params.id === 'string'
      ? route.params.id
      : undefined,
  );
  const book = computed(() => (bookId.value ? books.getBookById(bookId.value) : undefined));
  const processingOtherBook = computed(() => {
    const task = currentTask.value;
    return !!task?.bookId && task.bookId !== bookId.value;
  });
  const currentTaskBookTitle = computed(() => {
    const id = currentTask.value?.bookId;
    if (!id) return '';
    return books.getBookById(id)?.title ?? id;
  });

  // ---------- 本书统计（只在可见时刷新） ----------
  const chapterStats = ref<Stats>({ embedded: 0, total: 0 });
  const memoryStats = ref<Stats>({ embedded: 0, total: 0 });
  const staleCounts = ref({ chapter: 0, memory: 0 });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let dirty = true;
  let request = 0;
  let disposed = false;

  const resetStats = () => {
    chapterStats.value = { embedded: 0, total: 0 };
    memoryStats.value = { embedded: 0, total: 0 };
    staleCounts.value = { chapter: 0, memory: 0 };
  };

  /** 合并同批事件；不可见时只记下需要刷新，不读取全书向量 */
  const scheduleRefresh = () => {
    dirty = true;
    if (disposed || !visible.value || running || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, STATS_REFRESH_DELAY_MS);
  };

  const countChapters = (id: string) =>
    (books.getBookById(id)?.volumes ?? []).reduce(
      (sum, volume) => sum + (volume.chapters?.length ?? 0),
      0,
    );

  async function refresh(): Promise<void> {
    if (disposed || !visible.value) return;
    if (running) {
      dirty = true;
      return;
    }
    const id = bookId.value;
    if (!id) {
      resetStats();
      return;
    }
    const current = request;
    running = true;
    dirty = false;
    try {
      const [chapter, memory] = await Promise.all([
        loadChapterBreakdown(id, countChapters(id)),
        loadMemoryBreakdown(id),
      ]);
      if (disposed || current !== request || bookId.value !== id || !visible.value) return;
      chapterStats.value = { embedded: chapter.embedded, total: chapter.total };
      memoryStats.value = { embedded: memory.embedded, total: memory.total };
      staleCounts.value = { chapter: chapter.stale, memory: memory.stale };
    } finally {
      running = false;
      if (dirty) scheduleRefresh();
    }
  }

  watch([bookId, visible], () => {
    ++request;
    if (timer) clearTimeout(timer);
    timer = undefined;
    scheduleRefresh();
  });

  const unsubscribers = [
    EmbeddingQueue.addEventListener('progress', (event) => {
      progress.value = (event.detail as EmbeddingQueueProgress) ?? EmbeddingQueue.getProgress();
    }),
    EmbeddingQueue.addEventListener('batch-complete', scheduleRefresh),
    EmbeddingQueue.addEventListener('idle', scheduleRefresh),
    EmbeddingService.addEventListener('status-changed', () => {
      embeddingStatus.value = EmbeddingService.getStatus();
    }),
    EmbeddingService.addEventListener('ready', () => {
      embeddingStatus.value = EmbeddingService.getStatus();
    }),
    MemoryService.addMemoryChangeListener((event) => {
      if (event.detail?.bookId === bookId.value && event.detail.action !== 'accessed') {
        scheduleRefresh();
      }
    }),
  ];
  onScopeDispose(() => {
    disposed = true;
    ++request;
    if (timer) clearTimeout(timer);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  // ---------- 旧向量提示 ----------
  // 点击「重建」后先隐藏提示，统计追上之前不再显眼；队列跑完回到空闲时复位
  const staleDismissed = ref(false);
  watch(
    () => progress.value.running,
    (now, before) => {
      if (before && !now) staleDismissed.value = false;
    },
  );
  const showStale = computed(
    () => !staleDismissed.value && (staleCounts.value.chapter > 0 || staleCounts.value.memory > 0),
  );

  // ---------- 操作 ----------
  /** 模型未就绪或队列正在处理时，不再新增队列工作 */
  const actionsDisabled = computed(
    () => embeddingStatus.value !== 'ready' || progress.value.running,
  );
  const testDisabled = computed(() => embeddingStatus.value !== 'ready');

  const backfill = () => {
    if (!bookId.value) return;
    void EmbeddingQueue.enqueueChapterBacklog(bookId.value);
    void EmbeddingQueue.enqueueBacklog(bookId.value);
  };
  const rebuildChapters = () => {
    if (!bookId.value) return;
    void EmbeddingQueue.enqueueAllChaptersForRecompute(bookId.value);
  };
  /** 旧向量在 backlog 扫描里会被判为需要重算，按类型各扫一次即可全部入队 */
  const rebuildStale = () => {
    if (!bookId.value) return;
    staleDismissed.value = true;
    if (staleCounts.value.chapter > 0) void EmbeddingQueue.enqueueChapterBacklog(bookId.value);
    if (staleCounts.value.memory > 0) void EmbeddingQueue.enqueueBacklog(bookId.value);
  };
  const pause = () => EmbeddingQueue.pause();
  const resume = () => EmbeddingQueue.resume();

  // 测试查询对话框挂在 MainLayout dispatcher，查询的是当前书；换书或离开书籍页时关闭
  const testQueryVisible = ref(false);
  const openTestQuery = () => {
    if (bookId.value) testQueryVisible.value = true;
  };
  watch(bookId, () => {
    testQueryVisible.value = false;
  });
  /** 打开设置页的嵌入分区（`?tab=embedding`，设置页已打开时也会切过去） */
  const openSettings = async () => {
    await router.push({ path: '/settings', query: { tab: 'embedding' } });
  };

  return {
    enabled,
    progress,
    active,
    userPaused: computed(() => progress.value.userPaused),
    syncGated: computed(() => progress.value.syncGated),
    embeddingStatus,
    currentTask,
    processingOtherBook,
    currentTaskBookTitle,
    bookId,
    book,
    chapterStats,
    memoryStats,
    staleCounts,
    showStale,
    actionsDisabled,
    testDisabled,
    backfill,
    rebuildChapters,
    rebuildStale,
    pause,
    resume,
    testQueryVisible,
    openTestQuery,
    openSettings,
  };
}

export type EmbeddingBackground = ReturnType<typeof createEmbeddingBackground>;
