<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import InputText from 'primevue/inputtext';
import ProgressSpinner from 'primevue/progressspinner';
import SettingCard from './SettingCard.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import type { Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
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

// Memory 列表
const memories = ref<Memory[]>([]);
const filteredMemories = computed(() => {
  if (!searchQuery.value.trim()) {
    return memories.value;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return memories.value.filter((memory) => {
    const content = memory.content.toLowerCase();
    const summary = (memory.summary || '').toLowerCase();
    return content.includes(query) || summary.includes(query);
  });
});

// 对话框状态
const showAddDialog = ref(false);
const showEditDialog = ref(false);
const showDeleteConfirm = ref(false);
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
import { watch } from 'vue';
watch(
  () => props.book?.id,
  () => {
    loadMemories();
  },
  { immediate: true },
);

// 打开添加对话框
const openAddDialog = () => {
  formData.value = {
    content: '',
    summary: '',
  };
  showAddDialog.value = true;
};

// 打开编辑对话框
const openEditDialog = (memory: Memory) => {
  selectedMemory.value = memory;
  formData.value = {
    content: memory.content,
    summary: memory.summary || '',
  };
  showEditDialog.value = true;
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

// 保存 Memory
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
    if (showAddDialog.value) {
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
    } else if (showEditDialog.value && selectedMemory.value) {
      // 编辑现有 Memory
      await MemoryService.updateMemory(
        props.book.id,
        selectedMemory.value.id,
        formData.value.content.trim(),
        formData.value.summary.trim(),
      );

      toast.add({
        severity: 'success',
        summary: '保存成功',
        detail: '已成功更新 记忆',
        life: 3000,
      });

      showEditDialog.value = false;
    }

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
        message="提示：记忆由 AI 自动管理，用户无需手动创建或编辑。AI 在翻译过程中会根据需要自动创建、更新记忆"
        :closable="false"
      />
      <AppMessage
        severity="warn"
        message="注意：手动添加或编辑的记忆可能会被 AI 覆盖，建议仅在必要时进行手动干预"
        :closable="false"
      />
    </div>

    <!-- 操作栏 -->
    <div
      class="px-6 py-4 border-b border-white/10 flex-none bg-surface-900/95 backdrop-blur support-backdrop-blur:bg-surface-900/50 sticky top-0 z-10"
    >
      <div class="flex items-center justify-between gap-3 flex-nowrap">
        <!-- 左侧：搜索栏 -->
        <div class="flex-1 flex items-center gap-3">
          <InputGroup class="search-input-group min-w-0 flex-shrink">
            <InputGroupAddon>
              <i class="pi pi-search text-base" />
            </InputGroupAddon>
            <InputText
              v-model="searchQuery"
              placeholder="搜索 记忆内容或摘要..."
              class="search-input"
            />
            <InputGroupAddon v-if="searchQuery" class="input-action-addon">
              <Button
                icon="pi pi-times"
                class="p-button-text p-button-sm input-action-button"
                @click="searchQuery = ''"
                title="清除搜索"
              />
            </InputGroupAddon>
          </InputGroup>
        </div>

        <!-- 右侧：操作按钮 -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <Button
            label="导出"
            icon="pi pi-download"
            class="p-button-outlined"
            :disabled="memories.length === 0"
            @click="handleExport"
          />
          <Button
            label="导入"
            icon="pi pi-upload"
            class="p-button-outlined"
            @click="handleImport"
          />
          <Button
            label="添加 记忆"
            icon="pi pi-plus"
            class="p-button-primary"
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
                {{ searchQuery ? '未找到匹配的 记忆' : '暂无 记忆，AI 会在翻译过程中自动创建' }}
              </p>
              <Button
                v-if="!searchQuery && book"
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
            <SettingCard
              v-for="memory in slotProps.items"
              :key="memory.id"
              :title="memory.summary || '无标题'"
              :description="memory.content"
              :translations="`最后访问: ${formatDate(memory.lastAccessedAt)}`"
              @edit="openEditDialog(memory)"
              @delete="handleDelete(memory)"
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
          <InputText
            v-model="formData.summary"
            placeholder="记忆的简短描述..."
            class="w-full"
          />
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
        <Button
          label="保存"
          icon="pi pi-check"
          :loading="isSaving"
          @click="handleSave"
        />
      </template>
    </Dialog>

    <!-- 编辑 Memory 对话框 -->
    <Dialog
      v-model:visible="showEditDialog"
      modal
      header="编辑 记忆"
      :style="{ width: '600px' }"
      :closable="!isSaving"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-moon/90 mb-2">
            摘要 <span class="text-moon/60">(可选)</span>
          </label>
          <InputText
            v-model="formData.summary"
            placeholder="记忆的简短描述..."
            class="w-full"
          />
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
          @click="showEditDialog = false"
          :disabled="isSaving"
        />
        <Button
          label="保存"
          icon="pi pi-check"
          :loading="isSaving"
          @click="handleSave"
        />
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
        <p class="text-moon/90">
          确定要删除这条 记忆吗？
        </p>
        <p v-if="deletingMemory" class="text-sm text-moon/70 truncate">
          {{ deletingMemory.summary || deletingMemory.content.slice(0, 50) }}
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" :disabled="isDeleting" @click="showDeleteConfirm = false" />
        <Button label="删除" class="p-button-danger" :loading="isDeleting" :disabled="isDeleting" @click="confirmDeleteMemory" />
      </template>
    </Dialog>

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
