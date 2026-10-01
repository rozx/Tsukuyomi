<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { localizedErrorMessage } from 'src/utils/localized-error';
import { resolveAppLocale } from 'src/models/locale';

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import Textarea from 'primevue/textarea';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import MemoryCard from './MemoryCard.vue';
import MemoryDetailDialog from './MemoryDetailDialog.vue';
import MemoryQueueProgressBanner from './MemoryQueueProgressBanner.vue';
import MemoryListEmptyState from './MemoryListEmptyState.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import type { Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import { MemoryService } from 'src/services/memory-service';
import { SettingsService } from 'src/services/settings-service';
import { EmbeddingQueue } from 'src/services/embedding-queue';
import type { EmbeddingQueueProgress } from 'src/services/embedding-queue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useFilePicker } from 'src/composables/dialogs/useFilePicker';
import { isMemoryEmbeddingStale } from 'src/services/memory-service';
import { useToolbarExpand } from 'src/composables/useToolbarExpand';
const { t, locale } = useI18n();

const props = defineProps<{
  book: Novel | null;
}>();

const toast = useToastWithHistory();
const isSaving = ref(false);
const isDeleting = ref(false);
const isLoading = ref(false);

// 嵌入队列进度
const queueProgress = ref<EmbeddingQueueProgress>(EmbeddingQueue.getProgress());
const showProgressBanner = computed(() => {
  const p = queueProgress.value;
  return p.running || p.paused || p.pending > 0;
});
const progressPercent = computed(() => {
  const p = queueProgress.value;
  if (p.total === 0) return 0;
  return Math.round((p.completed / p.total) * 100);
});
const etaLabel = computed(() => {
  const ms = queueProgress.value.etaMs;
  if (ms == null || ms <= 0) return '';
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return t('memoryUi.etaSeconds', { count: sec });
  return t('memoryUi.etaMinutes', { count: Math.ceil(sec / 60) });
});

// 搜索关键词
const searchQuery = ref('');

// 工具栏展开状态（移动端）
const isToolbarExpanded = ref(false);

// 仅显示未向量化的筛选
const filterUnembeddedOnly = ref(false);

// Memory 列表
const memories = ref<Memory[]>([]);

// 是否有激活的筛选
const hasActiveFilters = computed(() => {
  return searchQuery.value.trim() !== '' || filterUnembeddedOnly.value;
});

function isMemoryUnembedded(memory: Memory): boolean {
  return isMemoryEmbeddingStale(memory);
}

// 混合搜索结果（异步）
const searchResults = ref<Memory[] | null>(null);
const isSearching = ref(false);
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, (query) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  const trimmed = query.trim();
  if (!trimmed) {
    searchResults.value = null;
    return;
  }
  isSearching.value = true;
  searchDebounceTimer = setTimeout(async () => {
    if (!props.book) {
      searchResults.value = [];
      isSearching.value = false;
      return;
    }
    try {
      searchResults.value = await MemoryService.searchMemories(props.book.id, trimmed);
    } catch {
      searchResults.value = [];
    } finally {
      isSearching.value = false;
    }
  }, 300);
});

// 筛选后的记忆列表
const filteredMemories = computed(() => {
  let result = searchResults.value !== null ? searchResults.value : memories.value;

  if (filterUnembeddedOnly.value) {
    result = result.filter(isMemoryUnembedded);
  }

  return result;
});

// 清除所有筛选
function clearFilters() {
  searchQuery.value = '';
  filterUnembeddedOnly.value = false;
}

// 模板内联三元/|| 收敛为 computed，降低模板圈复杂度
const { toolbarExpandIcon, toolbarExpandTitle } = useToolbarExpand(isToolbarExpanded);
const reEmbedDisabled = computed(() => !props.book || memories.value.length === 0);
const deletePreviewText = computed(() => {
  const m = deletingMemory.value;
  if (!m) return '';
  return m.summary || m.content.slice(0, 50);
});
const hasFilteredMemories = computed(() => filteredMemories.value.length > 0);
const exportDisabled = computed(() => memories.value.length === 0);
const bookId = computed(() => props.book?.id ?? '');
const addDisabled = computed(() => !props.book);

// 重新向量化本书
const handleReEmbed = async () => {
  if (!props.book) return;
  const added = await EmbeddingQueue.enqueueBacklog(props.book.id);
  if (added > 0) {
    toast.add({
      severity: 'info',
      summary: t('memoryUi.embeddingStarted'),
      detail: t('memoryUi.queuedCount', { count: added }),
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'info',
      summary: t('memoryUi.noEmbeddingNeeded'),
      detail: t('memoryUi.upToDate'),
      life: 3000,
    });
  }
};

const toggleQueuePause = () => {
  if (EmbeddingQueue.isPaused()) {
    EmbeddingQueue.resume();
  } else {
    EmbeddingQueue.pause();
  }
};

// 对话框状态
const showAddDialog = ref(false);
const showDeleteConfirm = ref(false);
const showDetailDialog = ref(false);
const openDetailDialogInEditMode = ref(false);
const selectedMemory = ref<Memory | null>(null);
const deletingMemory = ref<Memory | null>(null);

// 文件输入引用（用于导入 JSON）
const { fileInputRef, triggerFilePicker: handleImport, createFileSelectHandler } = useFilePicker();

// 表单数据
const formData = ref({
  content: '',
  summary: '',
});

// 加载 Memory 列表
const loadMemories = async () => {
  if (!props.book) {
    memories.value = [];
    return;
  }

  isLoading.value = true;
  try {
    const allMemories = await MemoryService.getAllMemories(props.book.id);
    memories.value = allMemories;
  } catch (error) {
    console.error('加载 Memory 失败:', error);
    toast.add({
      severity: 'error',
      summary: t('memoryUi.loadFailed'),
      detail: t('memoryUi.cannotLoad'),
      life: 3000,
    });
  } finally {
    isLoading.value = false;
  }
};

// 监听书籍变化
watch(
  () => props.book?.id,
  () => {
    loadMemories();
    clearFilters();
  },
  { immediate: true },
);

// 监听 Memory 变更（同步/其他入口写入 IndexedDB 时也能刷新 UI）
let unsubscribeMemoryListener: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    // 不阻塞 UI：只要当前有 book，就刷新
    void loadMemories();
  }, 200);
};

let unsubscribeQueueProgress: (() => void) | null = null;

onMounted(() => {
  unsubscribeMemoryListener = MemoryService.addMemoryChangeListener((event) => {
    const currentBookId = props.book?.id;
    if (!currentBookId) return;

    // 只刷新当前书籍的 Memory，避免无谓刷新
    if (event.detail.bookId !== currentBookId) return;

    scheduleRefresh();
  });

  unsubscribeQueueProgress = EmbeddingQueue.addEventListener('progress', (e: CustomEvent) => {
    queueProgress.value = e.detail as EmbeddingQueueProgress;
  });
});

onUnmounted(() => {
  if (unsubscribeMemoryListener) unsubscribeMemoryListener();
  unsubscribeMemoryListener = null;

  if (unsubscribeQueueProgress) unsubscribeQueueProgress();
  unsubscribeQueueProgress = null;

  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
});

// 打开添加对话框
const openAddDialog = () => {
  formData.value = {
    content: '',
    summary: '',
  };
  showAddDialog.value = true;
};

// 打开详情对话框
const openDetailDialog = (memory: Memory, inEditMode: boolean = false) => {
  selectedMemory.value = memory;
  openDetailDialogInEditMode.value = inEditMode;
  showDetailDialog.value = true;
};

// 打开删除确认对话框
const openDeleteConfirm = (memory: Memory) => {
  if (!props.book) return;
  deletingMemory.value = memory;
  showDeleteConfirm.value = true;
};

// 确认删除 Memory
const confirmDeleteMemory = async () => {
  if (!props.book || !deletingMemory.value || isDeleting.value) return;

  const memory = deletingMemory.value;
  isDeleting.value = true;

  try {
    await MemoryService.deleteMemory(props.book.id, memory.id);

    toast.add({
      severity: 'success',
      summary: t('memoryUi.deleteSuccess'),
      detail: t('memoryUi.deleted', { name: memory.summary || memory.content.slice(0, 20) }),
      life: 3000,
    });

    // 从列表中移除
    memories.value = memories.value.filter((m) => m.id !== memory.id);
    showDeleteConfirm.value = false;
    showDetailDialog.value = false;
    deletingMemory.value = null;
  } catch (error) {
    console.error('删除 Memory 失败:', error);
    toast.add({
      severity: 'error',
      summary: t('memoryUi.deleteFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'memoryUi.deleteUnknown',
      ),
      life: 5000,
    });
  } finally {
    isDeleting.value = false;
  }
};

function getMemorySaveBookId(content: string): string | null {
  const errorKey = !props.book
    ? 'memoryUi.noBook'
    : !content.trim()
      ? 'memoryUi.contentRequired'
      : null;
  if (errorKey) {
    toast.add({
      severity: 'error',
      summary: t('memoryUi.saveFailed'),
      detail: t(errorKey),
      life: 3000,
    });
    return null;
  }
  return props.book!.id;
}

async function runMemorySave(operation: () => Promise<void>): Promise<void> {
  isSaving.value = true;
  try {
    await operation();
  } catch (error) {
    console.error('保存 Memory 失败:', error);
    toast.add({
      severity: 'error',
      summary: t('memoryUi.saveFailed'),
      detail: localizedErrorMessage(error, resolveAppLocale(locale.value), 'memoryUi.saveUnknown'),
      life: 5000,
    });
  } finally {
    isSaving.value = false;
  }
}

// 保存 Memory（仅用于添加新记忆）
const handleSave = async () => {
  const bookId = getMemorySaveBookId(formData.value.content);
  if (bookId === null) return;
  await runMemorySave(async () => {
    // 添加新 Memory
    const newMemory = await MemoryService.createMemory(
      bookId,
      formData.value.content.trim(),
      formData.value.summary.trim(),
    );

    toast.add({
      severity: 'success',
      summary: t('memoryUi.saveSuccess'),
      detail: t('memoryUi.added'),
      life: 3000,
      onRevert: () => MemoryService.deleteMemory(bookId, newMemory.id),
    });

    showAddDialog.value = false;

    // 重新加载列表
    await loadMemories();
  });
};

// 处理删除（保留兼容性，调用新的删除确认函数）
const handleDelete = (memory: Memory) => {
  if (!props.book) return;
  openDeleteConfirm(memory);
};

// 处理从详情对话框保存记忆
async function handleSaveMemory(memoryId: string, summary: string, content: string) {
  const bookId = getMemorySaveBookId(content);
  if (bookId === null) return;
  await runMemorySave(async () => {
    await MemoryService.updateMemory(bookId, memoryId, content.trim(), summary.trim());

    toast.add({
      severity: 'success',
      summary: t('memoryUi.saveSuccess'),
      detail: t('memoryUi.updated'),
      life: 3000,
    });

    // 更新本地数据
    const index = memories.value.findIndex((m) => m.id === memoryId);
    if (index !== -1) {
      memories.value[index] = {
        ...memories.value[index],
        summary: summary.trim(),
        content: content.trim(),
      } as Memory;
    }

    // 更新选中的记忆
    if (selectedMemory.value?.id === memoryId) {
      selectedMemory.value = {
        ...selectedMemory.value,
        summary: summary.trim(),
        content: content.trim(),
      } as Memory;
    }
  });
}

// 导出 Memory 为 JSON
const handleExport = () => {
  if (!props.book || memories.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: t('memoryUi.exportFailed'),
      detail: t('memoryUi.noExport'),
      life: 3000,
    });
    return;
  }

  try {
    const exportData = memories.value.map((m) => ({
      id: m.id,
      summary: m.summary,
      content: m.content,
      createdAt: m.createdAt,
      lastAccessedAt: m.lastAccessedAt,
    }));

    SettingsService.downloadJson(
      exportData,
      t('memoryUi.exportFilename', {
        title: props.book.title,
        date: new Date().toISOString().split('T')[0]!,
      }),
    );

    toast.add({
      severity: 'success',
      summary: t('memoryUi.exportSuccess'),
      detail: t('memoryUi.exported', { count: memories.value.length }),
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('memoryUi.exportFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'memoryUi.exportUnknown',
      ),
      life: 5000,
    });
  }
};

// 执行 Memory 导入：content 相同的更新，否则新增。content 缺失的条目跳过
const executeMemoriesImport = async (
  bookId: string,
  importedMemories: Partial<Memory>[],
  existingMemories: Memory[],
): Promise<{ addedCount: number; updatedCount: number }> => {
  let addedCount = 0;
  let updatedCount = 0;
  for (const importedMemory of importedMemories) {
    if (!importedMemory.content) continue;

    const existingMemory = existingMemories.find((m) => m.content === importedMemory.content);
    if (existingMemory) {
      await MemoryService.updateMemory(
        bookId,
        existingMemory.id,
        importedMemory.content,
        importedMemory.summary || '',
      );
      updatedCount++;
    } else {
      await MemoryService.createMemory(
        bookId,
        importedMemory.content,
        importedMemory.summary || '',
      );
      addedCount++;
    }
  }
  return { addedCount, updatedCount };
};

// 处理文件选择
const handleFileSelect = createFileSelectHandler(async (file) => {
  try {
    const data = await SettingsService.readJsonFile(file);
    const importedMemories = data as Partial<Memory>[];

    if (!Array.isArray(importedMemories) || importedMemories.length === 0) {
      toast.add({
        severity: 'warn',
        summary: t('memoryUi.importFailed'),
        detail: t('memoryUi.invalidFile'),
        life: 3000,
      });
      return;
    }

    if (!props.book) {
      toast.add({
        severity: 'error',
        summary: t('memoryUi.importFailed'),
        detail: t('memoryUi.noBook'),
        life: 3000,
      });
      return;
    }

    const { addedCount, updatedCount } = await executeMemoriesImport(
      props.book.id,
      importedMemories,
      memories.value,
    );

    toast.add({
      severity: 'success',
      summary: t('memoryUi.importSuccess'),
      detail: t('memoryUi.imported', {
        count: importedMemories.length,
        added: addedCount,
        updated: updatedCount,
      }),
      life: 3000,
    });

    // 重新加载列表
    await loadMemories();
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('memoryUi.importFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'memoryUi.importUnknown',
      ),
      life: 5000,
    });
  }
});
</script>

<template>
  <div class="memory-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="panel-header border-b border-white/10">
      <h1 class="panel-title font-semibold text-moon-100">{{ t('memoryUi.title') }}</h1>
      <p class="panel-desc text-sm text-moon/70">{{ t('memoryUi.description') }}</p>
    </div>

    <!-- 操作栏 -->
    <div
      class="panel-toolbar border-b border-white/10 flex-none bg-surface-900/95 backdrop-blur support-backdrop-blur:bg-surface-900/50 sticky top-0 z-10"
      :class="{ 'toolbar-expanded': isToolbarExpanded }"
    >
      <!-- 移动端紧凑操作栏 -->
      <div class="toolbar-mobile-compact">
        <span class="text-sm text-moon/60">{{
          t('memoryUi.count', { count: filteredMemories.length })
        }}</span>
        <Button
          :icon="toolbarExpandIcon"
          size="small"
          class="p-button-text"
          @click="isToolbarExpanded = !isToolbarExpanded"
          :title="toolbarExpandTitle"
        />
      </div>
      <!-- 可折叠内容（搜索 + 操作） -->
      <div class="toolbar-row toolbar-expandable">
        <!-- 左侧：搜索和筛选 -->
        <div class="toolbar-filters">
          <!-- 搜索栏 -->
          <InputGroup class="search-input-group" style="width: 240px">
            <InputGroupAddon>
              <i class="pi pi-search text-base" />
            </InputGroupAddon>
            <InputText
              v-model="searchQuery"
              :placeholder="t('memoryUi.searchPlaceholder')"
              class="search-input"
            />
            <InputGroupAddon v-if="searchQuery" class="input-action-addon">
              <Button
                icon="pi pi-times"
                class="p-button-text p-button-sm input-action-button"
                @click="searchQuery = ''"
                :title="t('memoryUi.clearSearch')"
              />
            </InputGroupAddon>
          </InputGroup>

          <!-- 仅显示未向量化 -->
          <label class="flex items-center gap-2 text-sm text-moon-100/70 whitespace-nowrap">
            <Checkbox v-model="filterUnembeddedOnly" :binary="true" />
            <span>{{ t('memoryUi.onlyUnembedded') }}</span>
          </label>

          <!-- 清除筛选按钮 -->
          <Button
            v-if="hasActiveFilters"
            icon="pi pi-filter-slash"
            class="p-button-text p-button-sm"
            @click="clearFilters"
            :title="t('memoryUi.clearFilters')"
          />
        </div>

        <!-- 右侧：操作按钮 -->
        <div class="toolbar-actions">
          <Button
            icon="pi pi-sync"
            class="p-button-outlined p-button-sm"
            :disabled="reEmbedDisabled"
            @click="handleReEmbed"
            :title="t('memoryUi.reembedBook')"
          />
          <Button
            icon="pi pi-upload"
            class="p-button-outlined p-button-sm"
            :disabled="exportDisabled"
            @click="handleExport"
            :title="t('memoryUi.export')"
          />
          <Button
            icon="pi pi-download"
            class="p-button-outlined p-button-sm"
            @click="handleImport"
            :title="t('memoryUi.import')"
          />
          <Button
            :label="t('memoryUi.add')"
            icon="pi pi-plus"
            class="p-button-primary p-button-sm"
            :disabled="addDisabled"
            @click="openAddDialog"
          />
        </div>
      </div>
      <AppMessage
        severity="info"
        class="panel-message toolbar-expandable"
        :message="t('memoryUi.aiHint')"
        :closable="false"
      />
    </div>

    <!-- 嵌入队列进度横幅 -->
    <MemoryQueueProgressBanner
      v-if="showProgressBanner"
      :queue-progress="queueProgress"
      :eta-label="etaLabel"
      :progress-percent="progressPercent"
      @toggle-pause="toggleQueuePause"
    />

    <!-- 内容区域 -->
    <div class="flex-1 p-6 min-h-0">
      <!-- Memory 列表 -->
      <DataView
        :value="filteredMemories"
        data-key="id"
        layout="grid"
        :rows="96"
        :paginator="hasFilteredMemories"
        :rows-per-page-options="[96, 144, 192, 288]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        class="flex-1 flex flex-col min-h-0"
      >
        <template #empty>
          <MemoryListEmptyState
            :is-loading="isLoading"
            :has-active-filters="hasActiveFilters"
            :has-query="!!searchQuery"
            :has-book="!!book"
            @clear="clearFilters"
            @add="openAddDialog"
          />
        </template>

        <template #grid="slotProps">
          <div
            class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 pb-4"
            style="grid-template-columns: repeat(auto-fill, minmax(300px, min(1fr, 500px)))"
          >
            <MemoryCard
              v-for="memory in slotProps.items"
              :key="memory.id"
              :memory="memory"
              :book-id="book?.id || ''"
              @click="openDetailDialog"
              @delete="handleDelete"
            />
          </div>
        </template>
      </DataView>
    </div>

    <!-- 添加 Memory 对话框 -->
    <AdaptiveDialog
      v-model:visible="showAddDialog"
      :header="t('memoryUi.addMemory')"
      desktop-width="600px"
      :eyebrow="t('memoryUi.memoryCategory')"
      :closable="!isSaving"
      :dismissable-mask="!isSaving"
      :close-on-escape="!isSaving"
      :sheet-dismiss-on-mask-click="!isSaving"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-moon/90 mb-2"
            >{{ t('memoryUi.summary')
            }}<span class="text-moon/60">{{ t('memoryUi.optional') }}</span>
          </label>
          <InputText
            v-model="formData.summary"
            :placeholder="t('memoryUi.shortDescription')"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-moon/90 mb-2"
            >{{ t('memoryUi.content') }}<span class="text-red-500">*</span>
          </label>
          <Textarea
            v-model="formData.content"
            rows="8"
            :placeholder="t('memoryUi.contentPlaceholder')"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          :label="t('memoryUi.cancel')"
          icon="pi pi-times"
          text
          @click="showAddDialog = false"
          :disabled="isSaving"
        />
        <Button
          :label="t('memoryUi.save')"
          icon="pi pi-check"
          :loading="isSaving"
          @click="handleSave"
        />
      </template>
    </AdaptiveDialog>

    <!-- 确认删除对话框 -->
    <AdaptiveDialog
      v-model:visible="showDeleteConfirm"
      :header="t('memoryUi.confirmDelete')"
      desktop-width="25rem"
      eyebrow="DELETE"
      sheet-min-height="auto"
    >
      <div class="space-y-4">
        <p class="text-moon/90">{{ t('memoryUi.deleteQuestion') }}</p>
        <p v-if="deletingMemory" class="text-sm text-moon/70 truncate">
          {{ deletePreviewText }}
        </p>
        <p class="text-sm text-moon/70">{{ t('memoryUi.cannotUndo') }}</p>
      </div>
      <template #footer>
        <Button
          :label="t('memoryUi.cancel')"
          class="p-button-text"
          :disabled="isDeleting"
          @click="showDeleteConfirm = false"
        />
        <Button
          :label="t('memoryUi.delete')"
          class="p-button-danger"
          :loading="isDeleting"
          :disabled="isDeleting"
          @click="confirmDeleteMemory"
        />
      </template>
    </AdaptiveDialog>

    <!-- 详情对话框 -->
    <MemoryDetailDialog
      v-model:visible="showDetailDialog"
      :memory="selectedMemory"
      :book-id="bookId"
      :initial-edit-mode="openDetailDialogInEditMode"
      @save="handleSaveMemory"
      @delete="openDeleteConfirm"
    />

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="handleFileSelect"
    />
  </div>
</template>

<!-- 标题区样式（五个设置面板共享），详见 panel-header.css -->
<style scoped src="./panel-header.css"></style>
<!-- 工具栏外壳通用样式（三个设置面板共享），详见 setting-panel.css -->
<style scoped src="./setting-panel.css"></style>

<style scoped>
.memory-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 本面板独有：过滤器区容器 */
.toolbar-filters {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

/* 移动端响应式（本面板独有部分） */
@media (max-width: 640px) {
  .toolbar-filters {
    flex: 1 1 100%;
    flex-wrap: wrap;
  }

  .toolbar-filters .search-input-group {
    flex: 1 1 100%;
    width: auto !important;
    min-width: 0;
  }
}

/* 使 DataView 使用 flex 布局，内容可滚动，分页器固定在底部 */
:deep(.p-dataview) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-paginator) {
  flex-shrink: 0;
  margin-top: auto;
}
</style>
