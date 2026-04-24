<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import Drawer from 'primevue/drawer';
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
import { isLocalEmbeddingEffectivelyEnabled } from 'src/utils/local-embedding';
import { isMobileDevice } from 'src/utils/platform';

const route = useRoute();
const router = useRouter();
const booksStore = useBooksStore();
const settingsStore = useSettingsStore();

/** 本地嵌入是否实际可用(手机端强制 off + 用户总开关)。决定 popup 显示哪种视图 */
const isEmbeddingEnabled = computed(() =>
  isLocalEmbeddingEffectivelyEnabled(settingsStore.settings.enableLocalEmbedding),
);
const isMobile = computed(() => isMobileDevice());

const drawerVisible = ref(false);

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
      const hasVec = !!(m.embedding && m.embedding.length > 0);
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
  const id = bookId.value;
  if (!id) {
    resetStats();
    return;
  }
  const chapTotal = countBookChapters(id);
  const [chapter, memory] = await Promise.all([
    loadChapterBreakdown(id, chapTotal),
    loadMemoryBreakdown(id),
  ]);
  chapterStats.value = { embedded: chapter.embedded, total: chapter.total };
  memoryStats.value = { embedded: memory.embedded, total: memory.total };
  staleCounts.value = { chapter: chapter.stale, memory: memory.stale };
}

// 订阅 EmbeddingQueue 进度事件
const unsubscribers: Array<() => void> = [];
onMounted(() => {
  unsubscribers.push(
    EmbeddingQueue.addEventListener('progress', (e) => {
      progress.value = (e.detail as EmbeddingQueueProgress) ?? EmbeddingQueue.getProgress();
    }),
    EmbeddingQueue.addEventListener('batch-complete', () => {
      void refreshStats();
    }),
    EmbeddingQueue.addEventListener('idle', () => {
      void refreshStats();
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
      if (e.detail?.bookId === bookId.value) void refreshStats();
    }),
  );
  void refreshStats();
});
onUnmounted(() => {
  unsubscribers.forEach((u) => u());
  unsubscribers.length = 0;
});

watch(bookId, () => {
  void refreshStats();
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
  activeTask.value?.kind === 'chapter' ? '章节' : '记忆',
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
  if (eta === 0) return '已完成';
  const seconds = Math.round(eta / 1000);
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const restSec = seconds % 60;
  return restSec > 0 ? `约 ${minutes} 分 ${restSec} 秒` : `约 ${minutes} 分`;
});

const statusLabel = computed(() => {
  // 嵌入功能总开关关闭(含手机端强制关)优先显示,避免用"未就绪"误导用户以为是加载问题
  if (!isEmbeddingEnabled.value) {
    return { text: '已禁用', color: 'text-moon/50' };
  }
  switch (embeddingStatus.value) {
    case 'ready':
      return { text: '就绪', color: 'text-green-400' };
    case 'loading':
      return { text: '模型加载中', color: 'text-primary-400' };
    case 'failed':
      return { text: '加载失败', color: 'text-red-400' };
    default:
      return { text: '未就绪', color: 'text-moon-50' };
  }
});

// 操作 —— 保留 (event, target) 签名供调用方沿用原先的 popover 触发模式；
// 抽屉本身不需要锚点，参数忽略即可。
// refreshStats 会击 IndexedDB + 迭代 chapters/memories，关闭抽屉时不需要做这份工作。
const toggle = (_event?: Event, _target?: Element) => {
  if (!drawerVisible.value) void refreshStats();
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

const hasStale = computed(
  () => staleCounts.value.chapter > 0 || staleCounts.value.memory > 0,
);

// 队列正在处理任何嵌入任务时,禁用会新增队列工作的按钮,避免用户重复触发或与
// 正在进行的重建/回填冲突。
const isBuilding = computed(() => progress.value.running);

// 用户点击"立即重建"后立即隐藏升级横幅,避免在 refreshStats 追上之前横幅还显眼。
// 队列从 running 回落到 idle 时再复位,让 hasStale 决定是否重新显示。
const rebuildDismissed = ref(false);
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
  <Drawer
    v-model:visible="drawerVisible"
    position="right"
    class="batch-embeddings-drawer"
    :show-close-icon="false"
  >
    <template #header>
      <div class="bed-appbar">
        <div class="bed-appbar-icon"><i class="pi pi-bolt" aria-hidden="true" /></div>
        <div class="bed-appbar-text">
          <div class="bed-appbar-title">本地向量索引</div>
          <div class="bed-appbar-sub">BYOK · IndexedDB 本地保存</div>
        </div>
        <button
          type="button"
          class="bed-appbar-close"
          aria-label="关闭"
          @click="close"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </div>
    </template>
    <div class="flex flex-col gap-4 p-1">
      <div v-if="!currentBook" class="text-sm text-center text-moon-50 py-4">
        请在小说详情页使用此功能
      </div>

      <template v-else>
        <div class="flex flex-col gap-2 p-2 bg-white/5 rounded">
          <div class="text-sm font-medium text-moon-100 book-title-container">
            <i class="pi pi-book mr-2 text-primary-400"></i>
            {{ currentBook.title }}
          </div>
          <div class="flex items-center gap-4 text-xs text-moon-50">
            <span>共 {{ totalChapters }} 章节</span>
          </div>
        </div>

        <!-- 功能未启用时的提示 + 前往设置按钮(替代全部操作按钮) -->
        <div
          v-if="!isEmbeddingEnabled"
          class="flex flex-col gap-2 p-3 bg-moon/5 border border-moon/10 rounded text-xs text-moon-50"
        >
          <div class="flex items-start gap-2">
            <i class="pi pi-info-circle mt-0.5 text-amber-300 shrink-0"></i>
            <div class="flex-1 min-w-0">
              <template v-if="isMobile">
                <div class="font-medium text-moon-100">移动设备不支持本地嵌入</div>
                <p class="mt-1">模型过大、WebGPU 在移动浏览器上不稳定,本功能在移动端被强制禁用。
                  请在桌面端开启并生成向量,手机端只读使用。</p>
              </template>
              <template v-else>
                <div class="font-medium text-moon-100">本地嵌入未启用</div>
                <p class="mt-1">启用后可在本地下载嵌入模型(约 340–465 MB),支持语义记忆检索与章节向量搜索。
                  关闭状态下所有相关操作按钮均已隐藏。</p>
              </template>
            </div>
          </div>
          <Button
            v-if="!isMobile"
            label="前往设置开启"
            size="small"
            severity="primary"
            icon="pi pi-cog"
            class="w-full"
            @click="openSettings"
          />
        </div>

        <!-- Embedding 空间升级横幅:存在 stale(版本不匹配)向量时显示,
             解释"已嵌入"数字为什么会掉,并提供一键重建入口 -->
        <div
          v-if="isEmbeddingEnabled && hasStale && !rebuildDismissed"
          class="flex flex-col gap-2 p-3 rounded text-xs bg-amber-500/10 border border-amber-500/30 text-amber-200"
        >
          <div class="flex items-start gap-2">
            <i class="pi pi-exclamation-triangle mt-0.5 text-amber-300 shrink-0"></i>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-amber-100">Embedding 空间已升级</div>
              <p class="mt-1 leading-relaxed text-amber-200/90">
                检测到
                <span v-if="staleCounts.chapter > 0">{{ staleCounts.chapter }} 个章节</span>
                <span v-if="staleCounts.chapter > 0 && staleCounts.memory > 0"> / </span>
                <span v-if="staleCounts.memory > 0">{{ staleCounts.memory }} 条记忆</span>
                使用旧版向量,检索时会自动降级(章节搜索暂不可用)。重建后即可恢复语义召回。
              </p>
            </div>
          </div>
          <Button
            label="立即重建"
            size="small"
            severity="warn"
            icon="pi pi-sync"
            class="w-full"
            :disabled="embeddingStatus !== 'ready' || isBuilding"
            @click="rebuildStale"
          />
        </div>

        <!-- 章节 Embedding -->
        <div v-if="isEmbeddingEnabled" class="flex flex-col gap-2 p-2 bg-white/5 rounded">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-moon-100">章节 Embedding</div>
            <div class="text-xs text-moon-50">
              已嵌入 {{ chapterStats.embedded }} / {{ chapterStats.total }}
            </div>
          </div>
          <ProgressBar :value="chapterPercent" :show-value="false" style="height: 6px" />
          <div class="flex items-center justify-between text-xs text-moon-50">
            <span>待处理: {{ chapterPendingInQueue }}</span>
            <span v-if="chapterPendingInQueue > 0">ETA: {{ etaText }}</span>
          </div>
          <div class="flex gap-2 mt-1">
            <Button
              label="回填缺失"
              size="small"
              severity="secondary"
              icon="pi pi-refresh"
              @click="backfillChapters"
              :disabled="embeddingStatus !== 'ready' || isBuilding"
              class="flex-1"
            />
            <Button
              label="全部重算"
              size="small"
              severity="secondary"
              icon="pi pi-sync"
              @click="recomputeAllChapters"
              :disabled="embeddingStatus !== 'ready' || isBuilding"
              class="flex-1"
            />
          </div>
        </div>

        <!-- 记忆 Embedding -->
        <div v-if="isEmbeddingEnabled" class="flex flex-col gap-2 p-2 bg-white/5 rounded">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-moon-100">记忆 Embedding</div>
            <div class="text-xs text-moon-50">
              已嵌入 {{ memoryStats.embedded }} / {{ memoryStats.total }}
            </div>
          </div>
          <ProgressBar :value="memoryPercent" :show-value="false" style="height: 6px" />
          <div class="flex items-center justify-between text-xs text-moon-50">
            <span>待处理: {{ memoryPendingInQueue }}</span>
            <span v-if="memoryPendingInQueue > 0">ETA: {{ etaText }}</span>
          </div>
          <div class="flex gap-2 mt-1">
            <Button
              label="回填缺失"
              size="small"
              severity="secondary"
              icon="pi pi-refresh"
              @click="backfillMemories"
              :disabled="embeddingStatus !== 'ready' || isBuilding"
              class="flex-1"
            />
          </div>
        </div>

        <!-- 测试查询入口 -->
        <Button
          v-if="isEmbeddingEnabled"
          label="测试向量查询"
          size="small"
          severity="secondary"
          icon="pi pi-search"
          class="w-full"
          :disabled="embeddingStatus !== 'ready'"
          @click="openTestDialog"
        />

        <!-- 队列当前任务提示(跨书时高亮) -->
        <div
          v-if="isEmbeddingEnabled && activeTask && activeTask.bookId"
          :class="[
            'flex items-start gap-2 p-2 rounded text-xs min-w-0',
            isProcessingOtherBook
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
              : 'bg-primary-500/10 border border-primary-500/20 text-primary-300',
          ]"
        >
          <i class="pi pi-spin pi-spinner shrink-0 mt-0.5"></i>
          <div class="flex-1 min-w-0">
            <div v-if="isProcessingOtherBook">
              <div class="truncate">其它书籍 · {{ activeKindLabel }} ×{{ activeTask.itemCount }}</div>
              <div class="truncate font-medium mt-0.5">{{ activeBookTitle }}</div>
            </div>
            <div v-else class="truncate">
              本书 {{ activeKindLabel }} ×{{ activeTask.itemCount }}
            </div>
          </div>
        </div>

        <!-- 全局状态 -->
        <div class="flex flex-col gap-1 text-xs text-moon-50 px-1">
          <div class="flex items-start justify-between gap-2">
            <span class="shrink-0">模型:</span>
            <span class="font-mono text-right min-w-0 break-all">{{ MODEL_VERSION }}<span class="text-moon-300">(章节: @{{ CHAPTER_MODEL_VERSION.split('@').pop() }})</span></span>
          </div>
          <div class="flex items-center justify-between">
            <span>后端:</span>
            <span
              :class="
                activeBackend === 'webgpu'
                  ? 'text-green-400 font-medium'
                  : activeBackend === 'wasm'
                    ? 'text-amber-300'
                    : 'text-moon-50'
              "
            >
              <template v-if="activeBackend === 'webgpu'">WebGPU</template>
              <template v-else-if="activeBackend === 'wasm'">WASM (慢)</template>
              <template v-else>—</template>
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span>状态:</span>
            <span :class="statusLabel.color">● {{ statusLabel.text }}</span>
          </div>
          <div v-if="progress.running || progress.paused" class="flex justify-end mt-2">
            <Button
              v-if="!progress.paused"
              label="暂停"
              size="small"
              severity="warning"
              icon="pi pi-pause"
              @click="pauseQueue"
            />
            <Button
              v-else
              label="恢复"
              size="small"
              severity="success"
              icon="pi pi-play"
              @click="resumeQueue"
            />
          </div>
        </div>
      </template>
    </div>
  </Drawer>

  <BatchEmbeddingsTestQueryDialog v-model:visible="testDialogVisible" :book-id="bookId" />
</template>

<style scoped>
.book-title-container {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

<!-- 非 scoped:PrimeVue Drawer 会 teleport 到 document.body,scoped 的 :deep 选择器
     找不到宿主组件的 data-v-hash 祖先,所有针对 .p-drawer / .p-drawer-header /
     .p-drawer-content 的规则都会静默失效。用 .batch-embeddings-drawer 前缀限定作用域。 -->
<style>
/* 抽屉宽度限制:PrimeVue 默认 100%,桌面给 400px,手机 min(92vw, 400px)。
   PrimeVue 4 的 Drawer 会把根 class(batch-embeddings-drawer)放到外层 mask 上,
   实际面板是其后代 .p-drawer,所以这里用后代选择器。 */
.batch-embeddings-drawer .p-drawer {
  width: min(400px, 92vw);
}

/* 紧凑 appbar —— 与 AppChatPanelDesktop / AppProgressPanelDesktop 的 appbar 同构 */
.batch-embeddings-drawer .p-drawer-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
}

/* 抽屉 body padding 收紧,和 chat/progress panel 对齐;
   overflow-x 兜底防止任何长字串(如 font-mono 版本号)撑出横向滚动条 */
.batch-embeddings-drawer .p-drawer-content {
  padding: 14px 16px;
  overflow-x: hidden;
}
</style>
