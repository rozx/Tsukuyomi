<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import AdaptiveDrawer from 'src/components/layout/AdaptiveDrawer.vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useRouter } from 'vue-router';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import {
  EmbeddingQueue,
  type EmbeddingQueueCurrentTask,
  type EmbeddingQueueProgress,
} from 'src/services/embedding-queue';
import {
  EmbeddingService,
  type EmbeddingStatus,
  type EmbeddingBackend,
  MODEL_VERSION,
} from 'src/services/embedding-service';
import {
  ChapterEmbeddingService,
  CHAPTER_MODEL_VERSION,
  isChapterChunkStale,
} from 'src/services/chapter-embedding-service';
import { MemoryService, isMemoryEmbeddingStale } from 'src/services/memory-service';
import BatchEmbeddingsTestQueryDialog from 'src/components/dialogs/BatchEmbeddingsTestQueryDialog.vue';
import BatchEmbeddingsDisabledNotice from 'src/components/novel/BatchEmbeddingsDisabledNotice.vue';
import BatchEmbeddingsStaleBanner from 'src/components/novel/BatchEmbeddingsStaleBanner.vue';
import BatchEmbeddingsActiveTask from 'src/components/novel/BatchEmbeddingsActiveTask.vue';
import BatchEmbeddingsBackendStatus from 'src/components/novel/BatchEmbeddingsBackendStatus.vue';
import { isLocalEmbeddingEffectivelyEnabled } from 'src/utils/local-embedding';
import { isMobileDevice } from 'src/utils/platform';
const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const booksStore = useBooksStore();
const settingsStore = useSettingsStore();

/** 本地嵌入是否实际可用(手机端强制 off + 用户总开关)。决定 popup 显示哪种视图 */
const isEmbeddingEnabled = computed(() =>
  isLocalEmbeddingEffectivelyEnabled(settingsStore.settings.enableLocalEmbedding),
);
const isMobile = computed(() => isMobileDevice());

const drawerVisible = defineModel<boolean>('visible', { default: false });

// 进度状态
const progress = ref<EmbeddingQueueProgress>(EmbeddingQueue.getProgress());
const embeddingStatus = ref<EmbeddingStatus>(EmbeddingService.getStatus());
const activeBackend = ref<EmbeddingBackend | null>(EmbeddingService.getActiveBackend());

// DB 实际已嵌入统计（独立于 queue session 计数）
const chapterStats = ref<{ embedded: number; total: number }>({ embedded: 0, total: 0 });
const memoryStats = ref<{ embedded: number; total: number }>({ embedded: 0, total: 0 });
// 存在 embedding 但 model 版本与当前 MODEL_VERSION / CHAPTER_MODEL_VERSION 不符的 stale 数量。
// 非零说明 embedding 空间刚升级但 backlog 还没重算完 — 此时 search 会自动把这部分降级,
// UI 要给用户一条横幅解释为什么"已嵌入"数字突然掉到 0 / 需要重建。
const staleCounts = ref<{ chapter: number; memory: number }>({ chapter: 0, memory: 0 });

const bookId = computed(() => route.params.id as string | undefined);
const currentBook = computed(() =>
  bookId.value ? booksStore.getBookById(bookId.value) : undefined,
);

function countBookChapters(id: string): number {
  const book = booksStore.getBookById(id);
  let total = 0;
  for (const v of book?.volumes ?? []) {
    total += v.chapters?.length ?? 0;
  }
  return total;
}

type StatBreakdown = { embedded: number; total: number; stale: number };
let statsTimer: ReturnType<typeof setTimeout> | undefined;
let statsRunning = false;
let statsDirty = true;
let statsRequest = 0;
let disposed = false;

/** 合并同批事件，抽屉关闭时只记录待刷新，不读取全书向量。 */
function scheduleStatsRefresh(): void {
  statsDirty = true;
  if (disposed || !drawerVisible.value || statsRunning || statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = undefined;
    void refreshStats();
  }, 100);
}

async function loadChapterBreakdown(id: string, total: number): Promise<StatBreakdown> {
  try {
    const chunks = await ChapterEmbeddingService.getChunksForBook(id);
    // 按 chapterId 聚合:当前版本 chunk 才算 embedded;完全由 stale chunk 组成的章节计入 stale
    const statusByChapter = new Map<string, 'current' | 'stale'>();
    for (const c of chunks) {
      // 走单一事实源 isChapterChunkStale(避免散落的版本号比对漂移)
      const current = !isChapterChunkStale(c);
      if (current) statusByChapter.set(c.chapterId, 'current');
      else if (!statusByChapter.has(c.chapterId)) statusByChapter.set(c.chapterId, 'stale');
    }
    let embedded = 0;
    let stale = 0;
    for (const status of statusByChapter.values()) {
      if (status === 'current') embedded += 1;
      else stale += 1;
    }
    return { embedded, total, stale };
  } catch (error) {
    console.warn('[BatchEmbeddingsPanel] refresh chapter stats 失败:', error);
    return { embedded: 0, total, stale: 0 };
  }
}

async function loadMemoryBreakdown(id: string): Promise<StatBreakdown> {
  try {
    const memories = await MemoryService.getAllBookMemories(id);
    let embedded = 0;
    let stale = 0;
    for (const m of memories) {
      const hasVec = !!m.embeddings?.some((embedding) => embedding.length > 0);
      if (!hasVec) continue;
      // 有向量但 stale → 计 stale;有向量且非 stale → 计 embedded
      if (isMemoryEmbeddingStale(m)) stale += 1;
      else embedded += 1;
    }
    return { embedded, total: memories.length, stale };
  } catch (error) {
    console.warn('[BatchEmbeddingsPanel] refresh memory stats 失败:', error);
    return { embedded: 0, total: 0, stale: 0 };
  }
}

function resetStats(): void {
  chapterStats.value = { embedded: 0, total: 0 };
  memoryStats.value = { embedded: 0, total: 0 };
  staleCounts.value = { chapter: 0, memory: 0 };
}

async function refreshStats(): Promise<void> {
  if (disposed || !drawerVisible.value) return;
  if (statsRunning) {
    statsDirty = true;
    return;
  }
  const id = bookId.value;
  if (!id) {
    resetStats();
    return;
  }
  const request = statsRequest;
  statsRunning = true;
  statsDirty = false;
  try {
    const chapTotal = countBookChapters(id);
    const [chapter, memory] = await Promise.all([
      loadChapterBreakdown(id, chapTotal),
      loadMemoryBreakdown(id),
    ]);
    if (disposed || request !== statsRequest || bookId.value !== id || !drawerVisible.value) return;
    chapterStats.value = { embedded: chapter.embedded, total: chapter.total };
    memoryStats.value = { embedded: memory.embedded, total: memory.total };
    staleCounts.value = { chapter: chapter.stale, memory: memory.stale };
  } finally {
    statsRunning = false;
    if (statsDirty) scheduleStatsRefresh();
  }
}

// 订阅 EmbeddingQueue 进度事件
const unsubscribers: Array<() => void> = [];
onMounted(() => {
  unsubscribers.push(
    EmbeddingQueue.addEventListener('progress', (e) => {
      progress.value = (e.detail as EmbeddingQueueProgress) ?? EmbeddingQueue.getProgress();
    }),
    EmbeddingQueue.addEventListener('batch-complete', () => {
      scheduleStatsRefresh();
    }),
    EmbeddingQueue.addEventListener('idle', () => {
      scheduleStatsRefresh();
    }),
    EmbeddingService.addEventListener('status-changed', () => {
      embeddingStatus.value = EmbeddingService.getStatus();
      activeBackend.value = EmbeddingService.getActiveBackend();
    }),
    EmbeddingService.addEventListener('ready', () => {
      embeddingStatus.value = EmbeddingService.getStatus();
      activeBackend.value = EmbeddingService.getActiveBackend();
    }),
    MemoryService.addMemoryChangeListener((e) => {
      if (e.detail?.bookId === bookId.value && e.detail.action !== 'accessed')
        scheduleStatsRefresh();
    }),
  );
  scheduleStatsRefresh();
});
onUnmounted(() => {
  disposed = true;
  ++statsRequest;
  if (statsTimer) clearTimeout(statsTimer);
  unsubscribers.forEach((u) => u());
  unsubscribers.length = 0;
});

watch([bookId, drawerVisible], () => {
  ++statsRequest;
  if (statsTimer) clearTimeout(statsTimer);
  statsTimer = undefined;
  scheduleStatsRefresh();
});

const totalChapters = computed(() => {
  if (!currentBook.value?.volumes) return 0;
  let total = 0;
  for (const v of currentBook.value.volumes) {
    total += v.chapters?.length ?? 0;
  }
  return total;
});

const chapterPendingInQueue = computed(() => progress.value.breakdown.chapter.pending);
const memoryPendingInQueue = computed(() => progress.value.breakdown.memory.pending);

/** 队列当前正在处理的任务(可能属于别的书)。
 * 队列在两批之间会短暂把 currentTask 清成 null,直接绑定会让提示条反复显示/隐藏
 * 造成整条 popup 闪烁。这里在 progress.running 为 true 期间保留最后一次看到的
 * task,仅队列真正 idle 时才清掉,提示条内容随批次更新但容器保持挂载。 */
const stickyTask = ref<EmbeddingQueueCurrentTask | null>(progress.value.currentTask);
watch(
  () => progress.value.currentTask,
  (task) => {
    if (task) stickyTask.value = task;
  },
);
watch(
  () => progress.value.running,
  (running) => {
    if (!running) stickyTask.value = null;
  },
);
const activeTask = computed(() => stickyTask.value);

/** 当 panel 开在 Book A,但队列实际在处理 Book B 时为 true */
const isProcessingOtherBook = computed(() => {
  const task = activeTask.value;
  if (!task || !task.bookId) return false;
  return task.bookId !== bookId.value;
});

const activeBookTitle = computed(() => {
  const task = activeTask.value;
  if (!task?.bookId) return '';
  const book = booksStore.getBookById(task.bookId);
  return book?.title ?? task.bookId;
});

const activeKindLabel = computed(() =>
  activeTask.value?.kind === 'chapter' ? t('embeddingUi.chapter') : t('embeddingUi.memory'),
);

const chapterPercent = computed(() => {
  const { embedded, total } = chapterStats.value;
  if (total === 0) return 100;
  return Math.min(100, Math.round((embedded / total) * 100));
});
const memoryPercent = computed(() => {
  const { embedded, total } = memoryStats.value;
  if (total === 0) return 100;
  return Math.min(100, Math.round((embedded / total) * 100));
});

const etaText = computed(() => {
  const eta = progress.value.etaMs;
  if (eta == null) return '—';
  if (eta === 0) return t('embeddingUi.completed');
  const seconds = Math.round(eta / 1000);
  if (seconds < 60) return t('embeddingUi.etaSeconds', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  const restSec = seconds % 60;
  return restSec > 0
    ? t('embeddingUi.etaMinutesSeconds', { minutes, seconds: restSec })
    : t('embeddingUi.etaMinutes', { count: minutes });
});

const statusLabel = computed(() => {
  // 嵌入功能总开关关闭(含手机端强制关)优先显示,避免用"未就绪"误导用户以为是加载问题
  if (!isEmbeddingEnabled.value) {
    return { text: t('embeddingUi.disabled'), color: 'text-moon/50' };
  }
  switch (embeddingStatus.value) {
    case 'ready':
      return { text: t('embeddingUi.ready'), color: 'text-green-400' };
    case 'loading':
      return { text: t('embeddingUi.loading'), color: 'text-primary-400' };
    case 'failed':
      return { text: t('embeddingUi.loadFailed'), color: 'text-red-400' };
    default:
      return { text: t('embeddingUi.notReady'), color: 'text-moon-50' };
  }
});

// 操作 —— 保留 (event, target) 签名供调用方沿用原先的 popover 触发模式；
// 抽屉本身不需要锚点，参数忽略即可。
// refreshStats 会击 IndexedDB + 迭代 chapters/memories，关闭抽屉时不需要做这份工作。
const toggle = (_event?: Event, _target?: Element) => {
  drawerVisible.value = !drawerVisible.value;
};

const close = () => {
  drawerVisible.value = false;
};

const backfillChapters = () => {
  if (!bookId.value) return;
  void EmbeddingQueue.enqueueChapterBacklog(bookId.value);
};

const recomputeAllChapters = () => {
  if (!bookId.value) return;
  void EmbeddingQueue.enqueueAllChaptersForRecompute(bookId.value);
};

const backfillMemories = () => {
  if (!bookId.value) return;
  void EmbeddingQueue.enqueueBacklog(bookId.value);
};

const pauseQueue = () => EmbeddingQueue.pause();
const resumeQueue = () => EmbeddingQueue.resume();

const hasStale = computed(() => staleCounts.value.chapter > 0 || staleCounts.value.memory > 0);

// 队列正在处理任何嵌入任务时,禁用会新增队列工作的按钮,避免用户重复触发或与
// 正在进行的重建/回填冲突。
const isBuilding = computed(() => progress.value.running);

// 用户点击"立即重建"后立即隐藏升级横幅,避免在 refreshStats 追上之前横幅还显眼。
// 队列从 running 回落到 idle 时再复位,让 hasStale 决定是否重新显示。
const rebuildDismissed = ref(false);

// 模板内联 && / || / !== 收敛为 computed，降低模板圈复杂度
const showStaleBanner = computed(
  () => isEmbeddingEnabled.value && hasStale.value && !rebuildDismissed.value,
);
const actionsDisabled = computed(() => embeddingStatus.value !== 'ready' || isBuilding.value);
const testDisabled = computed(() => embeddingStatus.value !== 'ready');
const showActiveTask = computed(
  () => isEmbeddingEnabled.value && !!activeTask.value && !!activeTask.value.bookId,
);
const chapterEtaVisible = computed(() => chapterPendingInQueue.value > 0);
const memoryEtaVisible = computed(() => memoryPendingInQueue.value > 0);
watch(isBuilding, (running, wasRunning) => {
  if (wasRunning && !running) {
    rebuildDismissed.value = false;
  }
});

// 一键重建 stale:本质就是 backlog 扫描(版本不匹配已被判为 needs-embed),
// 对章节和记忆各跑一次即可把 stale 全部入队。
const rebuildStale = () => {
  if (!bookId.value) return;
  rebuildDismissed.value = true;
  if (staleCounts.value.chapter > 0) {
    void EmbeddingQueue.enqueueChapterBacklog(bookId.value);
  }
  if (staleCounts.value.memory > 0) {
    void EmbeddingQueue.enqueueBacklog(bookId.value);
  }
};

// 测试查询对话框
const testDialogVisible = ref(false);
const openTestDialog = () => {
  close();
  testDialogVisible.value = true;
};

const openSettings = () => {
  close();
  void router.push('/settings');
};

defineExpose({ toggle });
</script>

<template>
  <AdaptiveDrawer
    v-model:visible="drawerVisible"
    :title="t('embeddingUi.title')"
    class="batch-embeddings-drawer"
  >
    <template #header>
      <div class="bed-appbar">
        <div class="bed-appbar-icon"><i class="pi pi-bolt" aria-hidden="true" /></div>
        <div class="bed-appbar-text">
          <div class="bed-appbar-title">{{ t('embeddingUi.title') }}</div>
          <div class="bed-appbar-sub">{{ t('embeddingUi.storage') }}</div>
        </div>
        <span class="bed-appbar-status" :class="statusLabel.color">● {{ statusLabel.text }}</span>
        <button
          type="button"
          class="bed-appbar-close"
          :aria-label="t('embeddingUi.close')"
          @click="close"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </div>
    </template>
    <div class="bed-body">
      <div v-if="!currentBook" class="text-sm text-center text-moon-50 py-4">
        {{ t('embeddingUi.openBook') }}
      </div>

      <template v-else>
        <div class="bed-book">
          <i class="pi pi-book bed-book-icon" aria-hidden="true" />
          <div class="bed-book-text">
            <div class="book-title-container" :title="currentBook.title">
              {{ currentBook.title }}
            </div>
            <div class="bed-book-meta">
              {{ t('embeddingUi.chapterCount', { count: totalChapters }) }}
            </div>
          </div>
        </div>

        <!-- 功能未启用时的提示 + 前往设置按钮(替代全部操作按钮) -->
        <BatchEmbeddingsDisabledNotice
          v-if="!isEmbeddingEnabled"
          :is-mobile="isMobile"
          @open-settings="openSettings"
        />

        <!-- Embedding 空间升级横幅:存在 stale(版本不匹配)向量时显示,
             解释"已嵌入"数字为什么会掉,并提供一键重建入口 -->
        <BatchEmbeddingsStaleBanner
          v-if="showStaleBanner"
          :chapter-stale="staleCounts.chapter"
          :memory-stale="staleCounts.memory"
          :disabled="actionsDisabled"
          @rebuild="rebuildStale"
        />

        <!-- 章节 Embedding -->
        <template v-if="isEmbeddingEnabled">
          <section class="bed-section">
            <div class="bed-section-heading">
              <div class="bed-section-title">
                {{ t('embeddingUi.chapterEmbeddings') }}
              </div>
              <div class="bed-section-count">
                {{
                  t('embeddingUi.embeddedCount', {
                    completed: chapterStats.embedded,
                    total: chapterStats.total,
                  })
                }}
              </div>
            </div>
            <ProgressBar :value="chapterPercent" :show-value="false" class="bed-progress" />
            <div class="bed-section-meta">
              <span>{{ t('embeddingUi.pendingCount', { count: chapterPendingInQueue }) }}</span>
              <span v-if="chapterEtaVisible">ETA: {{ etaText }}</span>
            </div>
            <div class="bed-actions">
              <Button
                :label="t('embeddingUi.fillMissing')"
                size="small"
                severity="secondary"
                icon="pi pi-refresh"
                @click="backfillChapters"
                :disabled="actionsDisabled"
                class="bed-action"
              />
              <Button
                :label="t('embeddingUi.rebuildAll')"
                size="small"
                severity="secondary"
                icon="pi pi-sync"
                @click="recomputeAllChapters"
                :disabled="actionsDisabled"
                class="bed-action"
              />
            </div>
          </section>

          <!-- 记忆 Embedding -->
          <section class="bed-section">
            <div class="bed-section-heading">
              <div class="bed-section-title">
                {{ t('embeddingUi.memoryEmbeddings') }}
              </div>
              <div class="bed-section-count">
                {{
                  t('embeddingUi.embeddedCount', {
                    completed: memoryStats.embedded,
                    total: memoryStats.total,
                  })
                }}
              </div>
            </div>
            <ProgressBar :value="memoryPercent" :show-value="false" class="bed-progress" />
            <div class="bed-section-meta">
              <span>{{ t('embeddingUi.pendingCount', { count: memoryPendingInQueue }) }}</span>
              <span v-if="memoryEtaVisible">ETA: {{ etaText }}</span>
            </div>
            <div class="bed-actions bed-actions-single">
              <Button
                :label="t('embeddingUi.fillMissing')"
                size="small"
                severity="secondary"
                icon="pi pi-refresh"
                @click="backfillMemories"
                :disabled="actionsDisabled"
                class="bed-action"
              />
            </div>
          </section>

          <!-- 测试查询入口 -->
          <Button
            :label="t('embeddingUi.testQuery')"
            size="small"
            severity="secondary"
            icon="pi pi-search"
            class="bed-action bed-query-action"
            :disabled="testDisabled"
            @click="openTestDialog"
          />
        </template>

        <!-- 队列当前任务提示(跨书时高亮) -->
        <BatchEmbeddingsActiveTask
          v-if="showActiveTask && activeTask"
          :active-task="activeTask"
          :is-processing-other-book="isProcessingOtherBook"
          :kind-label="activeKindLabel"
          :book-title="activeBookTitle"
        />

        <!-- 全局状态 -->
        <BatchEmbeddingsBackendStatus
          class="bed-backend"
          :model-version="MODEL_VERSION"
          :chapter-model-version="CHAPTER_MODEL_VERSION"
          :active-backend="activeBackend"
          :status-color="statusLabel.color"
          :status-text="statusLabel.text"
          :running="progress.running"
          :paused="progress.paused"
          @pause="pauseQueue"
          @resume="resumeQueue"
        />
      </template>
    </div>
  </AdaptiveDrawer>

  <BatchEmbeddingsTestQueryDialog v-model:visible="testDialogVisible" :book-id="bookId" />
</template>

<style scoped>
.bed-body {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 14px;
  min-width: 0;
}

.bed-body > * {
  min-width: 0;
}

.bed-book {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--white-opacity-8);
  border-radius: 10px;
}

.bed-book-icon {
  color: var(--moon-opacity-60);
  font-size: 15px;
  flex-shrink: 0;
}

.bed-book-text {
  flex: 1;
  min-width: 0;
}

.book-title-container {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--moon-opacity-90);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.bed-book-meta {
  margin-top: 3px;
  color: var(--moon-opacity-50);
  font-size: 11px;
}

.bed-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--white-opacity-6);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.015);
}

.bed-section-heading,
.bed-section-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.bed-section-title {
  color: var(--moon-opacity-90);
  font-size: 12px;
  font-weight: 600;
}

.bed-section-count {
  font-size: 11px;
  color: var(--moon-opacity-70);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bed-section-meta {
  color: var(--moon-opacity-50);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.bed-progress {
  height: 4px;
  border-radius: 3px;
  background: var(--white-opacity-6);
}

.bed-progress :deep(.p-progressbar-value) {
  background: #a3b7cf;
  border-radius: inherit;
}

.bed-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 2px;
}

.bed-actions-single {
  grid-template-columns: minmax(0, 1fr);
}

.bed-action {
  min-width: 0;
  min-height: 34px;
  padding: 7px 10px;
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  background: var(--white-opacity-4);
  color: var(--moon-opacity-80);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  box-shadow: none;
  gap: 6px;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.bed-action :deep(.p-button-label) {
  white-space: normal;
  line-height: 1.4;
}

.bed-action :deep(.p-button-icon) {
  font-size: 12px;
}

.bed-action:not(:disabled):hover {
  background: var(--white-opacity-8);
  border-color: var(--white-opacity-20);
  color: var(--moon-opacity-100);
}

.bed-action:focus-visible,
.bed-appbar-close:focus-visible {
  outline: 2px solid #a3b7cf;
  outline-offset: 3px;
}

.bed-action:disabled {
  opacity: 0.4;
}

.bed-query-action {
  width: 100%;
  min-height: 38px;
  background: rgba(109, 136, 168, 0.15);
  border-color: rgba(109, 136, 168, 0.3);
  color: #c0d0e2;
}

.bed-query-action:not(:disabled):hover {
  background: rgba(109, 136, 168, 0.24);
  border-color: rgba(109, 136, 168, 0.45);
}

.bed-backend {
  margin-top: 2px;
  padding: 12px 2px 0;
  border-top: 1px solid var(--white-opacity-6);
  color: var(--moon-opacity-50);
  font-size: 10px;
  line-height: 1.7;
}

.bed-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.bed-appbar-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(109, 136, 168, 0.15);
  border: 1px solid rgba(109, 136, 168, 0.3);
  color: #a3b7cf;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bed-appbar-icon i {
  font-size: 13px;
}

.bed-appbar-text {
  flex: 1;
  min-width: 0;
}

.bed-appbar-status {
  flex-shrink: 0;
  font-size: 10px;
  white-space: nowrap;
}

.bed-appbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-opacity-100);
  line-height: 1.2;
}

.bed-appbar-sub {
  font-size: 10px;
  color: var(--moon-opacity-50);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bed-appbar-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-4);
  color: rgba(192, 198, 209, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.bed-appbar-close i {
  font-size: 11px;
}

.bed-appbar-close:hover,
.bed-appbar-close:active {
  background: var(--white-opacity-8);
  color: #e9edf5;
}
</style>

<!-- 抽屉传送到 body，使用自身 class 限定 PrimeVue 容器样式。 -->
<style>
/* 与助手 / 翻译进度面板保持相同的默认宽度和表面颜色。class 位于抽屉根节点。 */
.batch-embeddings-drawer.p-drawer.p-component {
  width: min(24rem, 92vw);
  background: rgba(14, 16, 20, 0.96);
  border: none;
  border-left: 1px solid var(--white-opacity-8);
  box-shadow: none;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

/* 紧凑 appbar —— 与 AppChatPanelDesktop / AppProgressPanelDesktop 的 appbar 同构 */
.batch-embeddings-drawer .p-drawer-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
  background: transparent;
  flex-shrink: 0;
}

/* 抽屉 body padding 收紧,和 chat/progress panel 对齐;
   overflow-x 兜底防止任何长字串(如 font-mono 版本号)撑出横向滚动条 */
.batch-embeddings-drawer .p-drawer-content {
  padding: 14px 16px;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--white-opacity-20) transparent;
}
</style>
