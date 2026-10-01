<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Checkbox from 'primevue/checkbox';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import type { Novel } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { CoverHistoryItem } from 'src/models/novel';
import type { Memory } from 'src/models/memory';

export interface DeletableItem {
  id: string;
  type: 'novel' | 'model' | 'cover' | 'memory';
  title: string;
  deletedAt: number;
  data: Novel | AIModel | CoverHistoryItem | Memory;
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
  return date.toLocaleString(locale.value, {
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
      return t('structureUi.book');
    case 'model':
      return t('structureUi.model');
    case 'cover':
      return t('structureUi.cover');
    case 'memory':
      return t('structureUi.memory');
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
  <AdaptiveDialog
    :visible="visible"
    :header="t('structureUi.restoreHeader')"
    desktop-width="600px"
    :eyebrow="t('structureUi.restore')"
    @update:visible="visible = $event"
  >
    <div class="flex flex-col gap-4">
      <p class="text-sm text-gray-600">{{ t('structureUi.restoreIntro') }}</p>

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
        <Column field="type" :header="t('structureUi.type')" :style="{ width: '80px' }">
          <template #body="{ data }">
            <span class="text-sm">{{ getTypeLabel(data.type) }}</span>
          </template>
        </Column>
        <Column field="title" :header="t('structureUi.name')" />
        <Column field="deletedAt" :header="t('structureUi.deletedAt')" :style="{ width: '160px' }">
          <template #body="{ data }">
            <span class="text-sm text-gray-500">{{ formatDeletedAt(data.deletedAt) }}</span>
          </template>
        </Column>
      </DataTable>

      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <Checkbox v-model="selectAll" :binary="true" input-id="select-all" />
          <label for="select-all" class="text-sm">{{ t('structureUi.selectAll') }}</label>
        </div>
        <div class="text-sm text-gray-500">
          {{
            t('structureUi.selectedCount', { selected: selectedItems.size, total: items.length })
          }}
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button
          :label="t('structureUi.cancel')"
          icon="pi pi-times"
          class="p-button-text"
          @click="handleCancel"
        />
        <Button
          :label="t('structureUi.restoreSelected')"
          icon="pi pi-check"
          :disabled="selectedItems.size === 0"
          @click="handleRestore"
        />
      </div>
    </template>
  </AdaptiveDialog>
</template>
