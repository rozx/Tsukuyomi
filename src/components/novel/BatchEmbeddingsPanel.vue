<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useBooksStore } from 'src/stores/books';
import { EmbeddingQueue, type EmbeddingQueueProgress } from 'src/services/embedding-queue';
import { EmbeddingService, type EmbeddingStatus, MODEL_VERSION } from 'src/services/embedding-service';

const route = useRoute();
const booksStore = useBooksStore();

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);

// 进度状态
const progress = ref<EmbeddingQueueProgress>(EmbeddingQueue.getProgress());
const embeddingStatus = ref<EmbeddingStatus>(EmbeddingService.getStatus());

// 订阅 EmbeddingQueue 进度事件
const unsubscribers: Array<() => void> = [];
onMounted(() => {
  unsubscribers.push(
    EmbeddingQueue.addEventListener('progress', (e) => {
      progress.value = (e.detail as EmbeddingQueueProgress) ?? EmbeddingQueue.getProgress();
    }),
    EmbeddingService.addEventListener('status-changed', () => {
      embeddingStatus.value = EmbeddingService.getStatus();
    }),
    EmbeddingService.addEventListener('ready', () => {
      embeddingStatus.value = EmbeddingService.getStatus();
    }),
  );
});
onUnmounted(() => {
  unsubscribers.forEach((u) => u());
  unsubscribers.length = 0;
});

const bookId = computed(() => route.params.id as string | undefined);
const currentBook = computed(() =>
  bookId.value ? booksStore.getBookById(bookId.value) : undefined,
);

const totalChapters = computed(() => {
  if (!currentBook.value?.volumes) return 0;
  let total = 0;
  for (const v of currentBook.value.volumes) {
    total += v.chapters?.length ?? 0;
  }
  return total;
});

const chapterBreakdown = computed(() => progress.value.breakdown.chapter);
const memoryBreakdown = computed(() => progress.value.breakdown.memory);

const chapterPercent = computed(() => {
  const { total, completed } = chapterBreakdown.value;
  if (total === 0) return 100;
  return Math.min(100, Math.round((completed / total) * 100));
});
const memoryPercent = computed(() => {
  const { total, completed } = memoryBreakdown.value;
  if (total === 0) return 100;
  return Math.min(100, Math.round((completed / total) * 100));
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

// 操作
const toggle = (event: Event) => {
  popoverRef.value?.toggle(event);
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

defineExpose({ toggle });
</script>

<template>
  <Popover ref="popoverRef" class="batch-embeddings-popover">
    <div class="flex flex-col gap-4 w-80 p-1">
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 class="font-semibold text-moon-100">本地向量索引</h3>
        <Button
          icon="pi pi-times"
          class="p-button-text p-button-sm p-button-rounded text-moon-50"
          @click="() => popoverRef?.hide()"
        />
      </div>

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

        <!-- 章节 Embedding -->
        <div class="flex flex-col gap-2 p-2 bg-white/5 rounded">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-moon-100">章节 Embedding</div>
            <div class="text-xs text-moon-50">
              已嵌入 {{ chapterBreakdown.completed }} / {{ chapterBreakdown.total }}
            </div>
          </div>
          <ProgressBar :value="chapterPercent" :show-value="false" style="height: 6px" />
          <div class="flex items-center justify-between text-xs text-moon-50">
            <span>待处理: {{ chapterBreakdown.pending }}</span>
            <span v-if="chapterBreakdown.pending > 0">ETA: {{ etaText }}</span>
          </div>
          <div class="flex gap-2 mt-1">
            <Button
              label="回填缺失"
              size="small"
              severity="secondary"
              icon="pi pi-refresh"
              @click="backfillChapters"
              :disabled="embeddingStatus !== 'ready'"
              class="flex-1"
            />
            <Button
              label="全部重算"
              size="small"
              severity="secondary"
              icon="pi pi-sync"
              @click="recomputeAllChapters"
              :disabled="embeddingStatus !== 'ready'"
              class="flex-1"
            />
          </div>
        </div>

        <!-- 记忆 Embedding -->
        <div class="flex flex-col gap-2 p-2 bg-white/5 rounded">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-moon-100">记忆 Embedding</div>
            <div class="text-xs text-moon-50">
              已嵌入 {{ memoryBreakdown.completed }} / {{ memoryBreakdown.total }}
            </div>
          </div>
          <ProgressBar :value="memoryPercent" :show-value="false" style="height: 6px" />
          <div class="flex items-center justify-between text-xs text-moon-50">
            <span>待处理: {{ memoryBreakdown.pending }}</span>
            <span v-if="memoryBreakdown.pending > 0">ETA: {{ etaText }}</span>
          </div>
          <div class="flex gap-2 mt-1">
            <Button
              label="回填缺失"
              size="small"
              severity="secondary"
              icon="pi pi-refresh"
              @click="backfillMemories"
              :disabled="embeddingStatus !== 'ready'"
              class="flex-1"
            />
          </div>
        </div>

        <!-- 全局状态 -->
        <div class="flex flex-col gap-1 text-xs text-moon-50 px-1">
          <div class="flex items-center justify-between">
            <span>模型:</span>
            <span class="font-mono">{{ MODEL_VERSION }}</span>
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
  </Popover>
</template>

<style scoped>
.book-title-container {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
