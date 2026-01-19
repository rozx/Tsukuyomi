<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import InputSwitch from 'primevue/inputswitch';
import ProgressBar from 'primevue/progressbar';
import { useBooksStore } from 'src/stores/books';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { ChapterSummaryService } from 'src/services/ai/tasks/chapter-summary-service';
import { ChapterService } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import type { Chapter } from 'src/models/novel';

const route = useRoute();
const booksStore = useBooksStore();
const aiProcessingStore = useAIProcessingStore();

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);

// State
const overwrite = ref(false);
const isRunning = ref(false);
const isCancelled = ref(false);
const queue = ref<Chapter[]>([]);
const processing = ref<Map<string, string>>(new Map());
const completed = ref<Set<string>>(new Set());
const failed = ref<Set<string>>(new Set());
const totalTasks = ref(0);
const abortController = ref<AbortController | null>(null);

// Constants
const CONCURRENCY_LIMIT = 3;

// Computed
const bookId = computed(() => route.params.id as string);
const currentBook = computed(() =>
  bookId.value ? booksStore.getBookById(bookId.value) : undefined,
);

const progressPercentage = computed(() => {
  if (totalTasks.value === 0) return 0;
  const processed = completed.value.size + failed.value.size;
  return Math.round((processed / totalTasks.value) * 100);
});

const allChapters = computed(() => {
  if (!currentBook.value?.volumes) return [];
  const chapters: Chapter[] = [];
  for (const volume of currentBook.value.volumes) {
    if (volume.chapters) {
      chapters.push(...volume.chapters);
    }
  }
  return chapters;
});

const missingSummaryCount = computed(() => {
  return allChapters.value.filter((chapter) => !chapter.summary || !chapter.summary.trim()).length;
});

const totalChaptersCount = computed(() => allChapters.value.length);

const isFinished = computed(() => {
  return (
    totalTasks.value > 0 &&
    completed.value.size + failed.value.size === totalTasks.value &&
    !isRunning.value
  );
});

// Methods
const toggle = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const reset = () => {
  if (isRunning.value) {
    stopBatch();
  }
  queue.value = [];
  processing.value.clear();
  completed.value.clear();
  failed.value.clear();
  totalTasks.value = 0;
  isRunning.value = false;
  isCancelled.value = false;
};

const startBatch = () => {
  if (!currentBook.value) return;

  // Reset state
  reset();
  isRunning.value = true;
  abortController.value = new AbortController();

  // Filter chapters
  queue.value = allChapters.value.filter((chapter) => {
    if (overwrite.value) return true;
    return !chapter.summary || !chapter.summary.trim();
  });

  totalTasks.value = queue.value.length;

  if (queue.value.length === 0) {
    isRunning.value = false;
    // Could add toast here if needed
    return;
  }

  // Kick off processing
  processQueue();
};
const stopBatch = () => {
  isRunning.value = false;
  isCancelled.value = true;
  if (abortController.value) {
    abortController.value.abort();
    abortController.value = null;
  }
  // Queue will retain remaining items, but processing loop stops picking them up.
  // Currently running tasks are now also being aborted via the signal.
};

const processQueue = () => {
  if (!isRunning.value) return;

  // If queue is empty and no processing, we are done
  if (queue.value.length === 0 && processing.value.size === 0) {
    isRunning.value = false;
    return;
  }

  // Fill up concurrency slots
  while (isRunning.value && queue.value.length > 0 && processing.value.size < CONCURRENCY_LIMIT) {
    const chapter = queue.value.shift();
    if (chapter) {
      processChapter(chapter);
    }
  }
};

const processChapter = async (chapter: Chapter) => {
  processing.value.set(chapter.id, chapter.title.original);

  try {
    // 1. Ensure content is loaded
    let contentParagraphs = chapter.content;
    if (!chapter.contentLoaded || !contentParagraphs) {
      contentParagraphs = await ChapterContentService.loadChapterContent(chapter.id);
    }

    if (!contentParagraphs || contentParagraphs.length === 0) {
      throw new Error('章节内容为空');
    }

    // 2. Convert to text
    const contentText = ChapterService.getChapterContentText({
      ...chapter,
      content: contentParagraphs,
    });

    if (!contentText.trim()) {
      throw new Error('章节内容文本为空');
    }

    // 3. Generate Summary
    // Note: We use the existing logic which updates `chapter.summary` in the store.
    await ChapterSummaryService.generateSummary(chapter.id, contentText, {
      bookId: bookId.value,
      chapterTitle: chapter.title.original,
      aiProcessingStore, // Pass the store instance for tracking
      force: true, // We already filtered, so force is fine (or implied by overwrite)
      signal: abortController.value?.signal,
    });

    completed.value.add(chapter.id);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`Summary generation for ${chapter.title.original} was aborted.`);
      return; // Case: stopped by user
    }
    console.error(`Failed to summarize chapter ${chapter.title.original}:`, error);
    failed.value.add(chapter.id);
  } finally {
    processing.value.delete(chapter.id);
    // Trigger next task
    processQueue();
  }
};

const formatCount = (set: Set<string>) => set.size;

defineExpose({
  toggle,
});
</script>

<template>
  <Popover ref="popoverRef" class="batch-summary-popover">
    <!-- dismissable=false keeps it open while clicking inside, but we might want clear explicit close -->
    <div class="flex flex-col gap-4 w-80 p-1">
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 class="font-semibold text-moon-100">批量生成摘要</h3>
        <Button
          v-if="!isRunning"
          icon="pi pi-times"
          class="p-button-text p-button-sm p-button-rounded text-moon-50"
          @click="() => popoverRef?.hide()"
        />
      </div>

      <div v-if="!currentBook" class="text-sm text-center text-moon-50 py-4">
        请在小说详情页使用此功能
      </div>

      <!-- Configuration -->
      <div v-else-if="!isRunning && totalTasks === 0 && !isFinished" class="flex flex-col gap-4">
        <div class="flex flex-col gap-2 p-2 bg-white/5 rounded">
          <div class="text-sm font-medium text-moon-100 book-title-container">
            <i class="pi pi-book mr-2 text-primary-400"></i>
            {{ currentBook.title }}
          </div>
          <div class="flex items-center gap-4 text-xs text-moon-50">
            <span>共 {{ totalChaptersCount }} 章节</span>
            <span :class="missingSummaryCount > 0 ? 'text-amber-400' : 'text-green-400'">
              {{ missingSummaryCount }} 章待生成
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between px-1">
          <label class="text-sm text-moon-70">覆盖现有摘要</label>
          <InputSwitch v-model="overwrite" />
        </div>

        <div class="text-xs text-moon-50 bg-white/5 p-2 rounded">
          将检测整本书的章节。
          <span v-if="overwrite">重新生成所有章节的摘要。</span>
          <span v-else>仅生成缺少摘要的章节。</span>
        </div>

        <Button
          :label="isRunning ? '正在准备...' : '开始生成'"
          icon="pi pi-play"
          @click="startBatch"
          :disabled="!currentBook || (!overwrite && missingSummaryCount === 0)"
        />
      </div>

      <!-- Progress -->
      <div v-else class="flex flex-col gap-3">
        <div class="flex justify-between text-sm mb-1">
          <span class="text-moon-70"
            >进度: {{ completed.size + failed.size }} / {{ totalTasks }}</span
          >
          <span class="text-moon-50">{{ progressPercentage }}%</span>
        </div>
        <ProgressBar :value="progressPercentage" :show-value="false" style="height: 6px" />

        <div
          class="text-xs text-moon-50 mb-2 max-w-[280px] truncate overflow-hidden whitespace-nowrap"
          v-if="currentBook"
        >
          <i class="pi pi-book mr-1"></i> {{ currentBook.title }}
        </div>

        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div class="bg-white/5 p-1 rounded">
            <div class="text-moon-50">进行中</div>
            <div class="font-bold text-primary-400">{{ processing.size }}</div>
          </div>
          <div class="bg-white/5 p-1 rounded">
            <div class="text-moon-50">成功</div>
            <div class="font-bold text-green-400">{{ completed.size }}</div>
          </div>
          <div class="bg-white/5 p-1 rounded">
            <div class="text-moon-50">失败</div>
            <div class="font-bold text-red-400">{{ failed.size }}</div>
          </div>
        </div>

        <!-- Processing Details -->
        <div v-if="processing.size > 0" class="flex flex-col gap-1 mt-1">
          <div class="text-xs text-moon-50">正在处理:</div>
          <div class="flex flex-col gap-1 max-h-32 overflow-y-auto">
            <div
              v-for="[id, title] of Array.from(processing.entries())"
              :key="id"
              class="text-xs text-moon-80 bg-white/5 px-2 py-1 rounded flex items-center gap-2"
            >
              <i class="pi pi-spinner animate-spin text-primary-400 text-[10px] flex-shrink-0"></i>
              <span class="truncate flex-1">{{ title || id }}</span>
            </div>
          </div>
        </div>

        <div v-if="isRunning" class="flex justify-center mt-2">
          <Button
            label="停止"
            severity="danger"
            size="small"
            icon="pi pi-stop"
            @click="stopBatch"
          />
        </div>

        <div v-if="isFinished || isCancelled" class="flex flex-col gap-2 mt-2">
          <div
            class="text-center text-sm font-medium"
            :class="isFinished ? 'text-green-400' : 'text-amber-400'"
          >
            <i :class="isFinished ? 'pi pi-check-circle' : 'pi pi-pause-circle'" class="mr-1"></i>
            {{ isFinished ? '完成' : '已取消' }}
          </div>
          <Button label="返回" severity="secondary" size="small" @click="reset" />
        </div>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
/* Scoped styles if needed */
</style>
