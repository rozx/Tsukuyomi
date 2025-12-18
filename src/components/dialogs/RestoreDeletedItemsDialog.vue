<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Checkbox from 'primevue/checkbox';
import type { Novel } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { CoverHistoryItem } from 'src/models/novel';

export interface DeletableItem {
  id: string;
  type: 'novel' | 'model' | 'cover';
  title: string;
  deletedAt: number;
  data: Novel | AIModel | CoverHistoryItem;
}

const props = withDefaults(
  defineProps<{
    visible: boolean;
    items: DeletableItem[];
  }>(),
  {
    items: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'restore', items: DeletableItem[]): void;
  (e: 'cancel'): void;
}>();

const selectedItems = ref<Set<string>>(new Set());

// DataTable 需要的数组格式
const selectedItemsArray = computed({
  get: () => {
    return props.items.filter((item) => selectedItems.value.has(item.id));
  },
  set: (value: DeletableItem[]) => {
    selectedItems.value = new Set(value.map((item) => item.id));
  },
});

// 默认选中所有项目
const selectAll = computed({
  get: () => {
    return props.items.length > 0 && selectedItems.value.size === props.items.length;
  },
  set: (value: boolean) => {
    if (value) {
      selectedItems.value = new Set(props.items.map((item) => item.id));
    } else {
      selectedItems.value.clear();
    }
  },
});

const visible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

const selectedItemsList = computed(() => {
  return props.items.filter((item) => selectedItems.value.has(item.id));
});

const handleRestore = () => {
  emit('restore', selectedItemsList.value);
  selectedItems.value.clear();
};

const handleCancel = () => {
  selectedItems.value.clear();
  emit('cancel');
};

// 格式化删除时间
const formatDeletedAt = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 获取类型标签
const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'novel':
      return '书籍';
    case 'model':
      return 'AI 模型';
    case 'cover':
      return '封面';
    default:
      return type;
  }
};

// 初始化时选中所有项目
watch(
  () => props.visible,
  (newValue) => {
    if (newValue && props.items.length > 0) {
      selectedItems.value = new Set(props.items.map((item) => item.id));
    }
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    :modal="true"
    :closable="true"
    :draggable="false"
    :style="{ width: '600px' }"
    header="恢复已删除的项目"
    @update:visible="visible = $event"
  >
    <div class="flex flex-col gap-4">
      <p class="text-sm text-gray-600">
        以下项目在远程存在，但在本地已被删除。请选择要恢复的项目：
      </p>

      <DataTable
        :value="items"
        v-model:selection="selectedItemsArray"
        selection-mode="multiple"
        data-key="id"
        :scrollable="true"
        scroll-height="400px"
        class="w-full"
      >
        <Column selection-mode="multiple" :header-style="{ width: '3rem' }" />
        <Column field="type" header="类型" :style="{ width: '80px' }">
          <template #body="{ data }">
            <span class="text-sm">{{ getTypeLabel(data.type) }}</span>
          </template>
        </Column>
        <Column field="title" header="名称" />
        <Column field="deletedAt" header="删除时间" :style="{ width: '160px' }">
          <template #body="{ data }">
            <span class="text-sm text-gray-500">{{ formatDeletedAt(data.deletedAt) }}</span>
          </template>
        </Column>
      </DataTable>

      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <Checkbox v-model="selectAll" :binary="true" input-id="select-all" />
          <label for="select-all" class="text-sm">全选</label>
        </div>
        <div class="text-sm text-gray-500">
          已选择 {{ selectedItems.size }} / {{ items.length }} 项
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button label="取消" icon="pi pi-times" class="p-button-text" @click="handleCancel" />
        <Button
          label="恢复选中项"
          icon="pi pi-check"
          :disabled="selectedItems.size === 0"
          @click="handleRestore"
        />
      </div>
    </template>
  </Dialog>
</template>

