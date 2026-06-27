<script setup lang="ts">
import { ref, computed, watch } from 'vue';
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
import { EmbeddingService } from 'src/services/embedding-service';
import { isMemoryEmbeddingStale } from 'src/services/memory-service';
import { cosineSimilarity } from 'src/utils/cosine-similarity';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Memory } from 'src/models/memory';

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
const errorMessage = ref<string | null>(null);
const results = ref<TestResultItem[]>([]);

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
  if (lastTarget.value === 'chapter') return '章节';
  if (lastTarget.value === 'memory') return '记忆';
  return '';
});

watch(
  () => props.visible,
  (next) => {
    if (!next) {
      query.value = '';
      lastTarget.value = null;
      errorMessage.value = null;
      results.value = [];
      memoryDetailVisible.value = false;
      selectedMemory.value = null;
    }
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
    title: m.title || '(无标题)',
    score: m.score,
    preview: m.preview,
  }));
}

// 记忆向量查询：对本地嵌入做余弦相似度打分，按分数降序取前 QUERY_LIMIT 条
function scoreMemories(memories: Memory[], queryVec: Float32Array): TestResultItem[] {
  const scored: TestResultItem[] = [];
  for (const m of memories) {
    if (isMemoryEmbeddingStale(m)) continue;
    scored.push({
      kind: 'memory' as const,
      targetId: m.id,
      title: (m.summary ?? '').trim() || '(无摘要)',
      score: cosineSimilarity(queryVec, m.embedding),
      preview: (m.content ?? '').trim().slice(0, 160),
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function queryMemoriesForDisplay(id: string, q: string): Promise<TestResultItem[]> {
  if (!EmbeddingService.isReady()) {
    throw new Error('EmbeddingService 未就绪');
  }
  const queryVec = await EmbeddingService.embed(q, 'query');
  if (!queryVec) throw new Error('query embedding 计算失败');
  const memories = await MemoryService.getAllBookMemories(id);
  return scoreMemories(memories, queryVec).slice(0, QUERY_LIMIT);
}

async function runQuery(target: TestTarget): Promise<void> {
  const id = props.bookId;
  const q = query.value.trim();
  if (!id || !q) return;

  lastTarget.value = target;
  loading.value = true;
  errorMessage.value = null;
  results.value = [];

  try {
    results.value =
      target === 'chapter'
        ? await queryChaptersForDisplay(id, q)
        : await queryMemoriesForDisplay(id, q);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
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
      summary: '跳转失败',
      detail: error instanceof Error ? error.message : String(error),
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
        summary: '记忆不存在',
        detail: '该记忆可能已被删除',
        life: 3000,
      });
      return;
    }
    selectedMemory.value = memory;
    memoryDetailVisible.value = true;
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '加载失败',
      detail: error instanceof Error ? error.message : String(error),
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
        title: summary.trim() || '(无摘要)',
        preview: content.trim().slice(0, 160),
      };
    }
    if (selectedMemory.value?.id === memoryId) {
      selectedMemory.value = updated;
    }
    toast.add({
      severity: 'success',
      summary: '已保存',
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: error instanceof Error ? error.message : String(error),
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
      summary: '已删除',
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '删除失败',
      detail: error instanceof Error ? error.message : String(error),
      life: 3000,
    });
  }
}

const handleClose = () => emit('update:visible', false);
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    header="测试向量查询"
    eyebrow="EMBEDDING"
    desktop-width="52rem"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4 min-w-0">
      <div class="space-y-2">
        <label class="text-sm text-moon/80">查询语句</label>
        <InputText
          v-model="query"
          placeholder="例：主角与神明订立契约的场景"
          class="w-full"
          autofocus
          @keydown.enter.prevent="handleEnter"
        />
        <div class="text-xs text-moon/60">
          回车默认执行章节查询；记忆查询仅匹配当前模型版本的条目。
        </div>
      </div>

      <div class="flex gap-2">
        <Button
          label="查询章节"
          icon="pi pi-book"
          severity="secondary"
          :disabled="!canRun"
          :loading="isChapterLoading"
          class="flex-1"
          @click="() => runQuery('chapter')"
        />
        <Button
          label="查询记忆"
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
      <Button label="关闭" icon="pi pi-times" class="p-button-text" @click="handleClose" />
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
