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
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    :header="t('embeddingUi.testQuery')"
    :eyebrow="t('embeddingUi.title')"
    desktop-width="42rem"
    tablet-width="min(42rem, 92vw)"
    tablet-height="auto"
    sheet-min-height="auto"
    dialog-class="vector-query-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="vq-body">
      <p class="vq-intro">{{ t('embeddingUi.queryIntro') }}</p>
      <div class="vq-form">
        <label for="vector-query-input" class="vq-label">{{ t('embeddingUi.query') }}</label>
        <div class="vq-search">
          <i class="pi pi-search vq-search-icon" aria-hidden="true" />
          <InputText
            id="vector-query-input"
            v-model="query"
            :placeholder="t('embeddingUi.queryPlaceholder')"
            aria-describedby="vector-query-hint"
            class="vq-input"
            autofocus
            @keydown.enter.prevent="handleEnter"
          />
        </div>
        <div id="vector-query-hint" class="vq-hint">{{ t('embeddingUi.queryHint') }}</div>
      </div>

      <div class="vq-actions">
        <Button
          :label="t('embeddingUi.queryChapters')"
          icon="pi pi-book"
          severity="secondary"
          :disabled="!canRun"
          :loading="isChapterLoading"
          class="vq-button vq-button-primary"
          @click="() => runQuery('chapter')"
        />
        <Button
          :label="t('embeddingUi.queryMemories')"
          icon="pi pi-bookmark"
          severity="secondary"
          :disabled="!canRun"
          :loading="isMemoryLoading"
          class="vq-button"
          @click="() => runQuery('memory')"
        />
      </div>

      <div v-if="errorMessage" class="vq-error" role="alert">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <span>{{ errorMessage }}</span>
      </div>

      <div v-else-if="loading" class="vq-state" role="status" aria-live="polite">
        <i class="pi pi-spin pi-spinner vq-state-icon" aria-hidden="true" />
        <p class="vq-state-title">{{ t('embeddingUi.queryLoading', { target: targetLabel }) }}</p>
      </div>

      <div v-else-if="showResults" class="vq-results" aria-live="polite">
        <BatchQueryResults
          :results="results"
          :target-label="targetLabel"
          :last-target="lastTarget"
          @select="handleResultClick"
        />
      </div>
      <div v-else class="vq-state">
        <i class="pi pi-book vq-state-icon" aria-hidden="true" />
        <p class="vq-state-title">{{ t('embeddingUi.queryIdleTitle') }}</p>
        <p class="vq-state-hint">{{ t('embeddingUi.queryIdleHint') }}</p>
      </div>
    </div>
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

<style scoped>
.vq-body {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 18px;
  min-width: 0;
}

.vq-intro {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--moon-opacity-60);
}

.vq-form {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.vq-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--moon-opacity-80);
}

.vq-search {
  position: relative;
  min-width: 0;
}

.vq-search-icon {
  position: absolute;
  top: 50%;
  left: 13px;
  transform: translateY(-50%);
  color: var(--moon-opacity-50);
  font-size: 13px;
  pointer-events: none;
}

.vq-input {
  width: 100%;
  min-width: 0;
  padding: 12px 14px 12px 38px;
  border: 1px solid var(--white-opacity-12);
  border-radius: 10px;
  background: var(--white-opacity-4);
  color: var(--moon-opacity-100);
  font-family: inherit;
  font-size: 13px;
  box-shadow: none;
  transition: border-color 150ms ease;
}

.vq-input::placeholder {
  color: var(--moon-opacity-40);
}

.vq-input:enabled:focus {
  border-color: #a3b7cf;
  outline: none;
  box-shadow: 0 0 0 2px rgba(109, 136, 168, 0.12);
}

.vq-hint {
  font-size: 10px;
  line-height: 1.6;
  color: var(--moon-opacity-50);
}

.vq-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.vq-button {
  min-width: 0;
  min-height: 36px;
  padding: 9px 14px;
  gap: 7px;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  color: var(--moon-opacity-80);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  box-shadow: none;
  transition:
    background 150ms ease,
    border-color 150ms ease;
}

.vq-button :deep(.p-button-icon) {
  font-size: 13px;
}

.vq-button :deep(.p-button-label) {
  white-space: normal;
}

.vq-button:not(:disabled):hover {
  background: var(--white-opacity-8);
  border-color: var(--white-opacity-20);
}

.vq-button:focus-visible {
  outline: 2px solid #a3b7cf;
  outline-offset: 3px;
}

.vq-button:disabled {
  opacity: 0.4;
}

.vq-button-primary {
  background: rgba(109, 136, 168, 0.16);
  border-color: rgba(109, 136, 168, 0.32);
  color: #c0d0e2;
}

.vq-button-primary:not(:disabled):hover {
  background: rgba(109, 136, 168, 0.25);
  border-color: rgba(109, 136, 168, 0.5);
}

.vq-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 18px;
  border: 1px dashed var(--white-opacity-10);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.015);
  text-align: center;
}

.vq-state-icon {
  margin-bottom: 4px;
  font-size: 21px;
  color: #a3b7cf;
}

.vq-state-title,
.vq-state-hint {
  margin: 0;
  line-height: 1.6;
}

.vq-state-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--moon-opacity-75);
}

.vq-state-hint {
  font-size: 11px;
  color: var(--moon-opacity-45);
}

.vq-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.vq-error {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(248, 113, 113, 0.25);
  background: rgba(248, 113, 113, 0.06);
  color: #fca5a5;
  font-size: 12px;
  line-height: 1.6;
}

.vq-error i {
  margin-top: 3px;
  flex-shrink: 0;
}
</style>

<style>
.vector-query-dialog.p-dialog.p-component {
  max-width: calc(100vw - 32px);
  max-height: calc(100dvh - 40px);
  background: rgba(14, 17, 22, 0.98);
  border: 1px solid var(--white-opacity-10);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.vector-query-dialog .p-dialog-header {
  padding: 18px 22px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.vector-query-dialog.p-dialog .p-dialog-header .p-dialog-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--moon-opacity-90);
}

.vector-query-dialog .p-dialog-header-actions button {
  width: 30px;
  height: 30px;
  border: 1px solid var(--white-opacity-10);
  border-radius: 50%;
  background: var(--white-opacity-4);
  color: var(--moon-opacity-70);
}

.vector-query-dialog .p-dialog-content {
  padding: 20px 22px;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--white-opacity-20) transparent;
}
</style>
