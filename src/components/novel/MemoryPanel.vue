<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import ProgressSpinner from 'primevue/progressspinner';
import MemoryCard from './MemoryCard.vue';
import MemoryDetailDialog from './MemoryDetailDialog.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import type { Novel } from 'src/models/novel';
import type { Memory, MemoryAttachmentType } from 'src/models/memory';
import { MemoryService } from 'src/services/memory-service';
import { useToastWithHistory } from 'src/composables/useToastHistory';

const props = defineProps<{
  book: Novel | null;
}>();

const toast = useToastWithHistory();
const isSaving = ref(false);
const isDeleting = ref(false);
const isLoading = ref(false);

// 搜索关键词
const searchQuery = ref('');

// 筛选状态
const filterType = ref<'all' | MemoryAttachmentType>('all');
const filterEntityId = ref<string | null>(null);

// 标记是否正在通过标签设置筛选（防止 watcher 清除 entityId）
const isSettingFilterFromTag = ref(false);

// 筛选选项
const typeOptions = [
  { label: '全部', value: 'all', icon: 'pi pi-th-large' },
  { label: '书籍级', value: 'book', icon: 'pi pi-book' },
  { label: '角色', value: 'character', icon: 'pi pi-user' },
  { label: '术语', value: 'term', icon: 'pi pi-tag' },
  { label: '章节', value: 'chapter', icon: 'pi pi-file' },
];

// 实体筛选选项（根据类型动态生成）
const entityOptions = computed(() => {
  if (!props.book || filterType.value === 'all') return [];

  const options: Array<{ label: string; value: string; count: number }> = [];

  switch (filterType.value) {
    case 'character':
      props.book.characterSettings?.forEach((char) => {
        const count = memories.value.filter((m) =>
          m.attachedTo?.some((a) => a.type === 'character' && a.id === char.id),
        ).length;
        if (count > 0) {
          // 优先使用翻译，如果没有则使用原文
          const label = char.translation?.translation || char.name;
          options.push({ label, value: char.id, count });
        }
      });
      break;
    case 'term':
      props.book.terminologies?.forEach((term) => {
        const count = memories.value.filter((m) =>
          m.attachedTo?.some((a) => a.type === 'term' && a.id === term.id),
        ).length;
        if (count > 0) {
          // 优先使用翻译，如果没有则使用原文
          const label = term.translation?.translation || term.name;
          options.push({ label, value: term.id, count });
        }
      });
      break;
    case 'chapter':
      props.book.volumes?.forEach((volume) => {
        volume.chapters?.forEach((chapter) => {
          const count = memories.value.filter((m) =>
            m.attachedTo?.some((a) => a.type === 'chapter' && a.id === chapter.id),
          ).length;
          if (count > 0) {
            // 优先使用翻译，如果没有则使用原文
            let chapterTitle: string;
            if (typeof chapter.title === 'string') {
              chapterTitle = chapter.title;
            } else {
              chapterTitle = chapter.title.translation?.translation || chapter.title.original;
            }
            options.push({ label: chapterTitle, value: chapter.id, count });
          }
        });
      });
      break;
  }

  // 确保当前选中的实体也在选项列表中（即使计数为0）
  if (filterEntityId.value && !options.some((o) => o.value === filterEntityId.value)) {
    const selectedEntity = findEntityById(filterEntityId.value, filterType.value);
    if (selectedEntity) {
      options.push(selectedEntity);
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
});

// 根据ID查找实体信息
function findEntityById(
  id: string,
  type: MemoryAttachmentType,
): { label: string; value: string; count: number } | null {
  if (!props.book) return null;

  switch (type) {
    case 'character': {
      const char = props.book.characterSettings?.find((c) => c.id === id);
      if (char) {
        return {
          label: char.translation?.translation || char.name,
          value: char.id,
          count: 0,
        };
      }
      break;
    }
    case 'term': {
      const term = props.book.terminologies?.find((t) => t.id === id);
      if (term) {
        return {
          label: term.translation?.translation || term.name,
          value: term.id,
          count: 0,
        };
      }
      break;
    }
    case 'chapter': {
      for (const volume of props.book.volumes || []) {
        const chapter = volume.chapters?.find((c) => c.id === id);
        if (chapter) {
          const chapterTitle =
            typeof chapter.title === 'string'
              ? chapter.title
              : chapter.title.translation?.translation || chapter.title.original;
          return {
            label: chapterTitle,
            value: chapter.id,
            count: 0,
          };
        }
      }
      break;
    }
  }
  return null;
}

// 类型筛选计数
const typeCounts = computed(() => {
  const counts = {
    all: memories.value.length,
    book: 0,
    character: 0,
    term: 0,
    chapter: 0,
  };

  memories.value.forEach((memory) => {
    memory.attachedTo?.forEach((att) => {
      if (counts[att.type] !== undefined) {
        counts[att.type]++;
      }
    });
  });

  return counts;
});

// 是否有激活的筛选
const hasActiveFilters = computed(() => {
  return (
    filterType.value !== 'all' || filterEntityId.value !== null || searchQuery.value.trim() !== ''
  );
});

// Memory 列表
const memories = ref<Memory[]>([]);

// 筛选后的记忆列表
const filteredMemories = computed(() => {
  let result = memories.value;

  // 类型筛选
  if (filterType.value !== 'all') {
    result = result.filter((memory) => memory.attachedTo?.some((a) => a.type === filterType.value));
  }

  // 实体筛选
  if (filterEntityId.value) {
    result = result.filter((memory) =>
      memory.attachedTo?.some((a) => a.id === filterEntityId.value),
    );
  }

  // 搜索筛选
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    result = result.filter((memory) => {
      const content = memory.content.toLowerCase();
      const summary = (memory.summary || '').toLowerCase();
      return content.includes(query) || summary.includes(query);
    });
  }

  return result;
});

// 清除所有筛选
function clearFilters() {
  filterType.value = 'all';
  filterEntityId.value = null;
  searchQuery.value = '';
}

// 当类型改变时，清除实体筛选
watch(filterType, (newType, oldType) => {
  // 只有当类型真正改变且不是通过标签设置时才清除实体筛选
  if (newType !== oldType && !isSettingFilterFromTag.value) {
    filterEntityId.value = null;
  }
});

// 对话框状态
const showAddDialog = ref(false);
const showDeleteConfirm = ref(false);
const showDetailDialog = ref(false);
const openDetailDialogInEditMode = ref(false);
const selectedMemory = ref<Memory | null>(null);
const deletingMemory = ref<Memory | null>(null);

// 文件输入引用（用于导入 JSON）
const fileInputRef = ref<HTMLInputElement | null>(null);

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

onMounted(() => {
  unsubscribeMemoryListener = MemoryService.addMemoryChangeListener((event) => {
    const currentBookId = props.book?.id;
    if (!currentBookId) return;

    // 只刷新当前书籍的 Memory，避免无谓刷新
    if (event.detail.bookId !== currentBookId) return;

    scheduleRefresh();
  });
});

onUnmounted(() => {
  if (unsubscribeMemoryListener) unsubscribeMemoryListener();
  unsubscribeMemoryListener = null;

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

// 处理按附件筛选
async function handleFilterByAttachment(type: string, id: string) {
  isSettingFilterFromTag.value = true;
  filterType.value = type as MemoryAttachmentType;
  filterEntityId.value = id;
  // 等待下一个 tick 后重置标志
  await nextTick();
  isSettingFilterFromTag.value = false;
}

// 处理导航（从详情对话框）
function handleNavigate(type: MemoryAttachmentType, id: string) {
  // 关闭详情对话框
  showDetailDialog.value = false;
  // 应用筛选
  handleFilterByAttachment(type, id);
}

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
      attachedTo: m.attachedTo,
      createdAt: m.createdAt,
      lastAccessedAt: m.lastAccessedAt,
    }));

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${props.book.title}-记忆-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

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

// 导入 Memory
const handleImport = () => {
  fileInputRef.value?.click();
};

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const content = await file.text();
    const importedMemories = JSON.parse(content) as Partial<Memory>[];

    if (!Array.isArray(importedMemories) || importedMemories.length === 0) {
      toast.add({
        severity: 'warn',
        summary: '导入失败',
        detail: '文件中没有有效的 记忆数据',
        life: 3000,
      });
      target.value = '';
      return;
    }

    if (!props.book) {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: '没有选择书籍',
        life: 3000,
      });
      target.value = '';
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

  // 清空输入
  target.value = '';
};
</script>

<template>
  <div class="memory-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="p-6 border-b border-white/10">
      <h1 class="text-2xl font-semibold text-moon-100 mb-2">记忆管理</h1>
      <p class="text-sm text-moon/70 mb-3">
        管理小说的背景设定和剧情记忆，这些内容会在翻译过程中提供给 AI 作为上下文参考
      </p>
      <AppMessage
        severity="info"
        message="记忆由 AI 自动管理，会在翻译过程中自动创建和更新。手动编辑的记忆可能会被覆盖，建议仅在必要时干预。"
        :closable="false"
      />
    </div>

    <!-- 操作栏 -->
    <div
      class="px-6 py-4 border-b border-white/10 flex-none bg-surface-900/95 backdrop-blur support-backdrop-blur:bg-surface-900/50 sticky top-0 z-10"
    >
      <div class="flex items-center justify-between gap-3">
        <!-- 左侧：搜索和筛选 -->
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <!-- 搜索栏 -->
          <InputGroup class="search-input-group flex-shrink-0" style="width: 240px">
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

          <!-- 类型筛选 -->
          <Dropdown
            v-model="filterType"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            placeholder="类型"
            class="w-32"
          >
            <template #option="slotProps">
              <div class="flex items-center gap-2">
                <i :class="slotProps.option.icon"></i>
                <span>{{ slotProps.option.label }}</span>
                <span class="ml-auto text-xs text-moon-100/40">
                  {{ typeCounts[slotProps.option.value as keyof typeof typeCounts] }}
                </span>
              </div>
            </template>
          </Dropdown>

          <!-- 实体筛选（仅在选择了类型时显示） -->
          <Dropdown
            v-if="filterType !== 'all'"
            v-model="filterEntityId"
            :options="entityOptions"
            option-label="label"
            option-value="value"
            placeholder="实体"
            class="w-40"
            show-clear
          >
            <template #option="slotProps">
              <div class="flex items-center gap-2">
                <span>{{ slotProps.option.label }}</span>
                <span class="ml-auto text-xs text-moon-100/40">
                  {{ slotProps.option.count }}
                </span>
              </div>
            </template>
          </Dropdown>

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
        <div class="flex items-center gap-2 flex-shrink-0">
          <Button
            icon="pi pi-download"
            class="p-button-outlined p-button-sm"
            :disabled="memories.length === 0"
            @click="handleExport"
            title="导出"
          />
          <Button
            icon="pi pi-upload"
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
              @filter-by-attachment="handleFilterByAttachment"
            />
          </div>
        </template>
      </DataView>
    </div>

    <!-- 添加 Memory 对话框 -->
    <Dialog
      v-model:visible="showAddDialog"
      modal
      header="添加 记忆"
      :style="{ width: '600px' }"
      :closable="!isSaving"
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
    </Dialog>

    <!-- 确认删除对话框 -->
    <Dialog
      v-model:visible="showDeleteConfirm"
      modal
      header="确认删除 记忆"
      :style="{ width: '25rem' }"
      :draggable="false"
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
    </Dialog>

    <!-- 详情对话框 -->
    <MemoryDetailDialog
      v-model:visible="showDetailDialog"
      :memory="selectedMemory"
      :book-id="book?.id || ''"
      :initial-edit-mode="openDetailDialogInEditMode"
      @save="handleSaveMemory"
      @delete="openDeleteConfirm"
      @navigate="handleNavigate"
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
