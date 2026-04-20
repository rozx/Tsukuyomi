<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import Textarea from 'primevue/textarea';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import MemoryCard from './MemoryCard.vue';
import MemoryDetailDialog from './MemoryDetailDialog.vue';
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
  if (sec < 60) return `约 ${sec} 秒`;
  return `约 ${Math.ceil(sec / 60)} 分钟`;
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

// 重新向量化本书
const handleReEmbed = async () => {
  if (!props.book) return;
  const added = await EmbeddingQueue.enqueueBacklog(props.book.id);
  if (added > 0) {
    toast.add({
      severity: 'info',
      summary: '向量化已启动',
      detail: `已加入 ${added} 条记忆到嵌入队列`,
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'info',
      summary: '无需向量化',
      detail: '所有记忆已是最新向量版本',
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
      summary: '加载失败',
      detail: '无法加载 记忆列表',
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
      summary: '删除成功',
      detail: `已成功删除 记忆 "${memory.summary || memory.content.slice(0, 20)}..."`,
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
      summary: '删除失败',
      detail: error instanceof Error ? error.message : '删除 记忆时发生未知错误',
      life: 5000,
    });
  } finally {
    isDeleting.value = false;
  }
};

// 保存 Memory（仅用于添加新记忆）
const handleSave = async () => {
  if (!props.book) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '没有选择书籍',
      life: 3000,
    });
    return;
  }

  // 验证必填字段
  if (!formData.value.content.trim()) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '记忆内容不能为空',
      life: 3000,
    });
    return;
  }

  isSaving.value = true;

  try {
    // 添加新 Memory
    const newMemory = await MemoryService.createMemory(
      props.book.id,
      formData.value.content.trim(),
      formData.value.summary.trim(),
    );

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: '已成功添加 记忆',
      life: 3000,
      onRevert: () => MemoryService.deleteMemory(props.book!.id, newMemory.id),
    });

    showAddDialog.value = false;

    // 重新加载列表
    await loadMemories();
  } catch (error) {
    console.error('保存 Memory 失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: error instanceof Error ? error.message : '保存 记忆时发生未知错误',
      life: 5000,
    });
  } finally {
    isSaving.value = false;
  }
};

// 处理删除（保留兼容性，调用新的删除确认函数）
const handleDelete = (memory: Memory) => {
  if (!props.book) return;
  openDeleteConfirm(memory);
};

// 处理从详情对话框保存记忆
async function handleSaveMemory(memoryId: string, summary: string, content: string) {
  if (!props.book) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '没有选择书籍',
      life: 3000,
    });
    return;
  }

  if (!content.trim()) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '记忆内容不能为空',
      life: 3000,
    });
    return;
  }

  isSaving.value = true;

  try {
    await MemoryService.updateMemory(props.book.id, memoryId, content.trim(), summary.trim());

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: '已成功更新 记忆',
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
  } catch (error) {
    console.error('保存 Memory 失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: error instanceof Error ? error.message : '保存 记忆时发生未知错误',
      life: 5000,
    });
  } finally {
    isSaving.value = false;
  }
}

// 格式化时间戳
const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN');
};

// 导出 Memory 为 JSON
const handleExport = () => {
  if (!props.book || memories.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: '导出失败',
      detail: '当前没有可导出的 记忆',
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
      `${props.book.title}-记忆-${new Date().toISOString().split('T')[0]}.json`,
    );

    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: `已成功导出 ${memories.value.length} 条 记忆`,
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: error instanceof Error ? error.message : '导出 记忆时发生未知错误',
      life: 5000,
    });
  }
};

// 处理文件选择
const handleFileSelect = createFileSelectHandler(async (file) => {
  try {
    const data = await SettingsService.readJsonFile(file);
    const importedMemories = data as Partial<Memory>[];

    if (!Array.isArray(importedMemories) || importedMemories.length === 0) {
      toast.add({
        severity: 'warn',
        summary: '导入失败',
        detail: '文件中没有有效的 记忆数据',
        life: 3000,
      });
      return;
    }

    if (!props.book) {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: '没有选择书籍',
        life: 3000,
      });
      return;
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const importedMemory of importedMemories) {
      if (!importedMemory.content) continue;

      const existingMemory = memories.value.find((m) => m.content === importedMemory.content);

      if (existingMemory) {
        // 更新现有 Memory
        await MemoryService.updateMemory(
          props.book.id,
          existingMemory.id,
          importedMemory.content,
          importedMemory.summary || '',
        );
        updatedCount++;
      } else {
        // 添加新 Memory
        await MemoryService.createMemory(
          props.book.id,
          importedMemory.content,
          importedMemory.summary || '',
        );
        addedCount++;
      }
    }

    toast.add({
      severity: 'success',
      summary: '导入成功',
      detail: `已导入 ${importedMemories.length} 条 记忆（新增 ${addedCount} 条，更新 ${updatedCount} 条）`,
      life: 3000,
    });

    // 重新加载列表
    await loadMemories();
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导入失败',
      detail: error instanceof Error ? error.message : '导入 记忆时发生未知错误',
      life: 5000,
    });
  }
});
</script>

<template>
  <div class="memory-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="panel-header border-b border-white/10">
      <h1 class="panel-title font-semibold text-moon-100">记忆管理</h1>
      <p class="panel-desc text-sm text-moon/70">
        管理小说的背景设定和剧情记忆，这些内容会在翻译过程中提供给 AI 作为上下文参考
      </p>
    </div>

    <!-- 操作栏 -->
    <div
      class="panel-toolbar border-b border-white/10 flex-none bg-surface-900/95 backdrop-blur support-backdrop-blur:bg-surface-900/50 sticky top-0 z-10"
      :class="{ 'toolbar-expanded': isToolbarExpanded }"
    >
      <!-- 移动端紧凑操作栏 -->
      <div class="toolbar-mobile-compact">
        <span class="text-sm text-moon/60">{{ filteredMemories.length }} 条记忆</span>
        <Button
          :icon="isToolbarExpanded ? 'pi pi-chevron-up' : 'pi pi-sliders-h'"
          size="small"
          class="p-button-text"
          @click="isToolbarExpanded = !isToolbarExpanded"
          :title="isToolbarExpanded ? '收起' : '搜索与筛选'"
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
            <InputText v-model="searchQuery" placeholder="搜索记忆..." class="search-input" />
            <InputGroupAddon v-if="searchQuery" class="input-action-addon">
              <Button
                icon="pi pi-times"
                class="p-button-text p-button-sm input-action-button"
                @click="searchQuery = ''"
                title="清除搜索"
              />
            </InputGroupAddon>
          </InputGroup>

          <!-- 仅显示未向量化 -->
          <label class="flex items-center gap-2 text-sm text-moon-100/70 whitespace-nowrap">
            <Checkbox v-model="filterUnembeddedOnly" :binary="true" />
            <span>仅显示未向量化</span>
          </label>

          <!-- 清除筛选按钮 -->
          <Button
            v-if="hasActiveFilters"
            icon="pi pi-filter-slash"
            class="p-button-text p-button-sm"
            @click="clearFilters"
            title="清除筛选"
          />
        </div>

        <!-- 右侧：操作按钮 -->
        <div class="toolbar-actions">
          <Button
            icon="pi pi-sync"
            class="p-button-outlined p-button-sm"
            :disabled="!book || memories.length === 0"
            @click="handleReEmbed"
            title="重新向量化本书"
          />
          <Button
            icon="pi pi-upload"
            class="p-button-outlined p-button-sm"
            :disabled="memories.length === 0"
            @click="handleExport"
            title="导出"
          />
          <Button
            icon="pi pi-download"
            class="p-button-outlined p-button-sm"
            @click="handleImport"
            title="导入"
          />
          <Button
            label="添加"
            icon="pi pi-plus"
            class="p-button-primary p-button-sm"
            :disabled="!book"
            @click="openAddDialog"
          />
        </div>
      </div>
      <AppMessage
        severity="info"
        class="panel-message toolbar-expandable"
        message="记忆由 AI 自动管理，会在翻译过程中自动创建和更新。手动编辑的记忆可能会被覆盖，建议仅在必要时干预。"
        :closable="false"
      />
    </div>

    <!-- 嵌入队列进度横幅 -->
    <div
      v-if="showProgressBanner"
      class="flex items-center gap-3 px-6 py-2 bg-blue-500/10 border-b border-blue-500/20 flex-none"
    >
      <span class="pi pi-spin pi-spinner text-blue-400" v-if="!queueProgress.paused"></span>
      <span class="pi pi-pause text-amber-400" v-else></span>
      <span class="text-sm text-moon/80 flex-1">
        向量化进度：{{ queueProgress.completed }} / {{ queueProgress.total }} 条记忆
        <span v-if="etaLabel" class="text-moon/50 ml-2">{{ etaLabel }}</span>
      </span>
      <span class="text-xs text-moon/50 tabular-nums">{{ progressPercent }}%</span>
      <Button
        :label="queueProgress.paused ? '继续' : '暂停'"
        :icon="queueProgress.paused ? 'pi pi-play' : 'pi pi-pause'"
        size="small"
        severity="secondary"
        text
        @click="toggleQueuePause"
      />
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 p-6 min-h-0">
      <!-- Memory 列表 -->
      <DataView
        :value="filteredMemories"
        data-key="id"
        layout="grid"
        :rows="96"
        :paginator="filteredMemories.length > 0"
        :rows-per-page-options="[96, 144, 192, 288]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        class="flex-1 flex flex-col min-h-0"
      >
        <template #empty>
          <div class="text-center py-12">
            <ProgressSpinner v-if="isLoading" />
            <template v-else>
              <i class="pi pi-database text-4xl text-moon/50 mb-4" />
              <p class="text-moon/70">
                {{ hasActiveFilters ? '未找到匹配的记忆' : '暂无 记忆，AI 会在翻译过程中自动创建' }}
              </p>
              <Button
                v-if="hasActiveFilters"
                label="清除筛选"
                icon="pi pi-filter-slash"
                class="p-button-outlined mt-4"
                @click="clearFilters"
              />
              <Button
                v-else-if="!searchQuery && book"
                label="手动添加 记忆"
                icon="pi pi-plus"
                class="p-button-outlined mt-4"
                @click="openAddDialog"
              />
            </template>
          </div>
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
      header="添加 记忆"
      desktop-width="600px"
      eyebrow="MEMORY"
      :closable="!isSaving"
      :dismissable-mask="!isSaving"
      :close-on-escape="!isSaving"
      :sheet-dismiss-on-mask-click="!isSaving"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-moon/90 mb-2">
            摘要 <span class="text-moon/60">(可选)</span>
          </label>
          <InputText v-model="formData.summary" placeholder="记忆的简短描述..." class="w-full" />
        </div>

        <div>
          <label class="block text-sm font-medium text-moon/90 mb-2">
            内容 <span class="text-red-500">*</span>
          </label>
          <Textarea
            v-model="formData.content"
            rows="8"
            placeholder="输入 记忆的详细内容..."
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button
          label="取消"
          icon="pi pi-times"
          text
          @click="showAddDialog = false"
          :disabled="isSaving"
        />
        <Button label="保存" icon="pi pi-check" :loading="isSaving" @click="handleSave" />
      </template>
    </AdaptiveDialog>

    <!-- 确认删除对话框 -->
    <AdaptiveDialog
      v-model:visible="showDeleteConfirm"
      header="确认删除 记忆"
      desktop-width="25rem"
      eyebrow="DELETE"
      sheet-min-height="auto"
    >
      <div class="space-y-4">
        <p class="text-moon/90">确定要删除这条 记忆吗？</p>
        <p v-if="deletingMemory" class="text-sm text-moon/70 truncate">
          {{ deletingMemory.summary || deletingMemory.content.slice(0, 50) }}
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          :disabled="isDeleting"
          @click="showDeleteConfirm = false"
        />
        <Button
          label="删除"
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
      :book-id="book?.id || ''"
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

<style scoped>
.memory-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 标题区域 */
.panel-header {
  padding: 1.5rem;
}

.panel-title {
  font-family:
    'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 1.625rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 2rem;
  margin-bottom: 0.5rem;
}

.panel-desc {
  margin-bottom: 0.75rem;
}

/* 操作栏 */
.panel-toolbar {
  padding: 1rem 1.5rem;
}

.panel-message {
  margin-top: 0.75rem;
}

/* 工具栏布局 */
.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: nowrap;
}

.toolbar-filters {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* 移动端紧凑操作栏（桌面端隐藏） */
.toolbar-mobile-compact {
  display: none;
}

/* 移动端响应式 */
@media (max-width: 640px) {
  .panel-header {
    display: none;
  }

  .panel-toolbar {
    padding: 0.5rem 1rem;
  }

  .toolbar-mobile-compact {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-toolbar:not(.toolbar-expanded) .toolbar-expandable {
    display: none;
  }

  .toolbar-expanded .toolbar-expandable {
    padding-top: 0.5rem;
    border-top: 1px solid var(--white-opacity-10);
    margin-top: 0.375rem;
  }

  .panel-message :deep(.p-4) {
    padding: 0.5rem 0.75rem;
  }

  .panel-message :deep(.text-sm) {
    font-size: 0.75rem;
    line-height: 1rem;
  }

  .panel-message :deep(.text-lg) {
    font-size: 0.875rem;
  }

  .panel-message :deep(.gap-3) {
    gap: 0.5rem;
  }

  .toolbar-row {
    flex-wrap: wrap;
  }

  .toolbar-filters {
    flex: 1 1 100%;
    flex-wrap: wrap;
  }

  .toolbar-filters .search-input-group {
    flex: 1 1 100%;
    width: auto !important;
    min-width: 0;
  }

  .toolbar-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
    gap: 0.25rem;
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
