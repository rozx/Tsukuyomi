<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import { localizedErrorMessage } from 'src/utils/localized-error';

import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import MemoryDetailDialog from 'src/components/novel/MemoryDetailDialog.vue';
import BatchQueryResults from './BatchQueryResults.vue';
import { type TestTarget, type TestResultItem } from './batch-query-types';
import {
  ChapterEmbeddingService,
  type ChapterQueryMatch,
} from 'src/services/chapter-embedding-service';
import { MemoryService } from 'src/services/memory-service';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Memory } from 'src/models/memory';
const { t, locale } = useI18n();

const props = defineProps<{
  visible: boolean;
  bookId?: string | undefined;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const route = useRoute();
const router = useRouter();
const bookDetailsStore = useBookDetailsStore();
const toast = useToastWithHistory();

const QUERY_LIMIT = 5;
const query = ref('');
const lastTarget = ref<TestTarget | null>(null);
const loading = ref(false);
const queryError = ref<unknown>(null);
const errorMessage = computed(() =>
  queryError.value === null
    ? null
    : localizedErrorMessage(
        queryError.value,
        resolveAppLocale(locale.value),
        'embeddingUi.queryFailed',
      ),
);
const results = ref<TestResultItem[]>([]);
let queryRequest = 0;
onUnmounted(() => queryRequest++);

// 记忆详情（子对话框）
const memoryDetailVisible = ref(false);
const selectedMemory = ref<Memory | null>(null);

const canRun = computed(() => !!props.bookId && query.value.trim().length > 0 && !loading.value);

// 回车默认执行章节查询（仅在可执行时触发）
const handleEnter = () => {
  if (canRun.value) void runQuery('chapter');
};

// 各目标独立的加载状态（用于按钮 loading 指示）
const isChapterLoading = computed(() => loading.value && lastTarget.value === 'chapter');
const isMemoryLoading = computed(() => loading.value && lastTarget.value === 'memory');

// 错误优先于结果；仅在无错误且有目标且非加载中时展示结果区
const showResults = computed(() => !!lastTarget.value && !loading.value);

const targetLabel = computed(() => {
  if (lastTarget.value === 'chapter') return t('embeddingUi.chapter');
  if (lastTarget.value === 'memory') return t('embeddingUi.memory');
  return '';
});

watch(
  () => props.visible,
  (next) => {
    if (!next) {
      queryRequest++;
      loading.value = false;
      query.value = '';
      lastTarget.value = null;
      queryError.value = null;
      results.value = [];
      memoryDetailVisible.value = false;
      selectedMemory.value = null;
    }
  },
);

watch(
  () => props.bookId,
  () => {
    queryRequest++;
    loading.value = false;
    lastTarget.value = null;
    queryError.value = null;
    results.value = [];
    memoryDetailVisible.value = false;
    selectedMemory.value = null;
  },
);

// 章节向量查询：将匹配结果映射为展示项
async function queryChaptersForDisplay(id: string, q: string): Promise<TestResultItem[]> {
  const matches: ChapterQueryMatch[] = await ChapterEmbeddingService.queryChapters(
    id,
    q,
    QUERY_LIMIT,
  );
  return matches.map((m) => ({
    kind: 'chapter' as const,
    targetId: m.chapter_id,
    title: m.title || '',
    score: m.score,
    preview: m.preview,
  }));
}

// 记忆查询：直接复用生产环境的 dense + keyword 排名融合，保证测试结果与工具一致。
async function queryMemoriesForDisplay(id: string, q: string): Promise<TestResultItem[]> {
  const matches = await MemoryService.searchMemoriesWithScores(id, q, QUERY_LIMIT);
  return matches.map(({ memory, breakdown }) => ({
    kind: 'memory' as const,
    targetId: memory.id,
    title: (memory.summary ?? '').trim(),
    score: breakdown.total,
    preview: (memory.content ?? '').trim().slice(0, 160),
  }));
}

async function runQuery(target: TestTarget): Promise<void> {
  const id = props.bookId;
  const q = query.value.trim();
  if (!id || !q) return;
  const request = ++queryRequest;
  const isCurrent = () => request === queryRequest && props.bookId === id && props.visible;

  lastTarget.value = target;
  loading.value = true;
  queryError.value = null;
  results.value = [];

  try {
    const found =
      target === 'chapter'
        ? await queryChaptersForDisplay(id, q)
        : await queryMemoriesForDisplay(id, q);
    if (isCurrent()) results.value = found;
  } catch (error) {
    if (isCurrent()) queryError.value = error;
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

function handleResultClick(item: TestResultItem): void {
  if (item.kind === 'chapter') {
    void navigateToChapter(item.targetId);
  } else {
    void openMemoryDetail(item.targetId);
  }
}

async function navigateToChapter(chapterId: string): Promise<void> {
  const id = props.bookId;
  if (!id || !chapterId) return;
  try {
    bookDetailsStore.setSelectedChapter(id, chapterId);
    const targetPath = `/books/${id}`;
    if (route.path !== targetPath) {
      await router.replace(targetPath);
    }
    emit('update:visible', false);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('embeddingUi.navigationFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'embeddingUi.unknownError',
      ),
      life: 3000,
    });
  }
}

async function openMemoryDetail(memoryId: string): Promise<void> {
  const id = props.bookId;
  if (!id || !memoryId) return;
  try {
    const memory = await MemoryService.getMemory(id, memoryId);
    if (!memory) {
      toast.add({
        severity: 'warn',
        summary: t('embeddingUi.memoryMissing'),
        detail: t('embeddingUi.memoryDeleted'),
        life: 3000,
      });
      return;
    }
    selectedMemory.value = memory;
    memoryDetailVisible.value = true;
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('embeddingUi.loadFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'embeddingUi.unknownError',
      ),
      life: 3000,
    });
  }
}

async function handleMemorySave(memoryId: string, summary: string, content: string): Promise<void> {
  const id = props.bookId;
  if (!id) return;
  try {
    const updated = await MemoryService.updateMemory(id, memoryId, content, summary);
    // 同步结果列表里的展示
    const idx = results.value.findIndex((r) => r.kind === 'memory' && r.targetId === memoryId);
    if (idx >= 0) {
      const existing = results.value[idx]!;
      results.value[idx] = {
        ...existing,
        title: summary.trim(),
        preview: content.trim().slice(0, 160),
      };
    }
    if (selectedMemory.value?.id === memoryId) {
      selectedMemory.value = updated;
    }
    toast.add({
      severity: 'success',
      summary: t('embeddingUi.saved'),
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('embeddingUi.saveFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'embeddingUi.unknownError',
      ),
      life: 3000,
    });
  }
}

async function handleMemoryDelete(memory: Memory): Promise<void> {
  const id = props.bookId;
  if (!id) return;
  try {
    await MemoryService.deleteMemory(id, memory.id);
    results.value = results.value.filter((r) => !(r.kind === 'memory' && r.targetId === memory.id));
    memoryDetailVisible.value = false;
    selectedMemory.value = null;
    toast.add({
      severity: 'success',
      summary: t('embeddingUi.deleted'),
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('embeddingUi.deleteFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'embeddingUi.unknownError',
      ),
      life: 3000,
    });
  }
}

const handleClose = () => emit('update:visible', false);
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    :header="t('embeddingUi.testQuery')"
    :eyebrow="t('embeddingUi.title')"
    desktop-width="52rem"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4 min-w-0">
      <div class="space-y-2">
        <label class="text-sm text-moon/80">{{ t('embeddingUi.query') }}</label>
        <InputText
          v-model="query"
          :placeholder="t('embeddingUi.queryPlaceholder')"
          class="w-full"
          autofocus
          @keydown.enter.prevent="handleEnter"
        />
        <div class="text-xs text-moon/60">{{ t('embeddingUi.queryHint') }}</div>
      </div>

      <div class="flex gap-2">
        <Button
          :label="t('embeddingUi.queryChapters')"
          icon="pi pi-book"
          severity="secondary"
          :disabled="!canRun"
          :loading="isChapterLoading"
          class="flex-1"
          @click="() => runQuery('chapter')"
        />
        <Button
          :label="t('embeddingUi.queryMemories')"
          icon="pi pi-bookmark"
          severity="secondary"
          :disabled="!canRun"
          :loading="isMemoryLoading"
          class="flex-1"
          @click="() => runQuery('memory')"
        />
      </div>

      <div
        v-if="errorMessage"
        class="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2"
      >
        <i class="pi pi-exclamation-triangle mr-1"></i>{{ errorMessage }}
      </div>

      <BatchQueryResults
        v-else-if="showResults"
        :results="results"
        :target-label="targetLabel"
        :last-target="lastTarget"
        @select="handleResultClick"
      />
    </div>

    <template #footer>
      <Button
        :label="t('embeddingUi.close')"
        icon="pi pi-times"
        class="p-button-text"
        @click="handleClose"
      />
    </template>
  </AdaptiveDialog>

  <MemoryDetailDialog
    v-if="bookId"
    v-model:visible="memoryDetailVisible"
    :memory="selectedMemory"
    :book-id="bookId"
    @save="handleMemorySave"
    @delete="handleMemoryDelete"
  />
</template>
