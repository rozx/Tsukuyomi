<script setup lang="ts">
import { ref, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Select from 'primevue/select';
import { ConflictType, type ConflictItem } from 'src/services/conflict-detection-service';
import { formatRelativeTime } from 'src/utils/format';

export interface ConflictResolution {
  conflictId: string;
  type: ConflictType;
  choice: 'local' | 'remote';
}

const props = defineProps<{
  visible: boolean;
  conflicts: ConflictItem[];
}>();

const emit = defineEmits<{
  resolve: [resolutions: ConflictResolution[]];
  cancel: [];
}>();

const selectedResolutions = ref<Map<string, 'local' | 'remote'>>(new Map());

// 初始化所有冲突的默认选择（选择较新的版本）
const initializeResolutions = () => {
  selectedResolutions.value.clear();
  for (const conflict of props.conflicts) {
    const localTime = conflict.localLastEdited.getTime();
    const remoteTime = conflict.remoteLastEdited.getTime();
    
    // 如果远程不存在（remoteData 为 null 或 remoteLastEdited 为纪元时间），默认选择本地
    if (!conflict.remoteData || remoteTime === 0) {
      selectedResolutions.value.set(conflict.id, 'local');
    } else {
      // 默认选择较新的版本
      selectedResolutions.value.set(conflict.id, remoteTime > localTime ? 'remote' : 'local');
    }
  }
};

// 当对话框显示时初始化
const onShow = () => {
  initializeResolutions();
};

const conflictTypeLabel = (type: ConflictType): string => {
  const labels: Record<ConflictType, string> = {
    [ConflictType.Novel]: '书籍',
    [ConflictType.AIModel]: 'AI 模型',
    [ConflictType.Settings]: '设置',
    [ConflictType.CoverHistory]: '封面历史',
  };
  return labels[type] || type;
};

const formatDate = (date: Date): string => {
  return formatRelativeTime(date.getTime());
};

// 获取冲突的选项
const getConflictOptions = (conflict: ConflictItem) => {
  const isRemoteDeleted = !conflict.remoteData || conflict.remoteLastEdited.getTime() === 0;
  const isLocalNewer = conflict.localLastEdited > conflict.remoteLastEdited;
  const isRemoteNewer = !isRemoteDeleted && conflict.remoteLastEdited > conflict.localLastEdited;

  return [
    {
      label: isLocalNewer ? '本地 (较新)' : '本地',
      value: 'local' as const,
    },
    {
      label: isRemoteDeleted
        ? '删除本地'
        : isRemoteNewer
          ? '远程 (较新)'
          : '远程',
      value: 'remote' as const,
    },
  ];
};

// 获取选项标签
const getOptionLabel = (conflict: ConflictItem, value: 'local' | 'remote') => {
  const options = getConflictOptions(conflict);
  return options.find((opt) => opt.value === value)?.label || value;
};

const handleResolve = () => {
  const resolutions: ConflictResolution[] = [];
  for (const conflict of props.conflicts) {
    const choice = selectedResolutions.value.get(conflict.id);
    if (choice) {
      resolutions.push({
        conflictId: conflict.id,
        type: conflict.type,
        choice,
      });
    }
  }
  emit('resolve', resolutions);
};

const handleCancel = () => {
  emit('cancel');
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '800px' }"
    header="解决同步冲突"
    @show="onShow"
    @hide="handleCancel"
  >
    <div class="space-y-4">
      <p class="text-sm text-moon/80">
        检测到 {{ conflicts.length }} 个冲突。请为每个冲突选择要保留的版本。
      </p>

      <DataTable
        :value="conflicts"
        :paginator="conflicts.length > 10"
        :rows="10"
        class="conflict-table"
      >
        <Column field="type" header="类型" style="width: 100px">
          <template #body="{ data }">
            {{ conflictTypeLabel(data.type) }}
          </template>
        </Column>

        <Column header="本地版本" style="width: 200px">
          <template #body="{ data }">
            <div class="flex flex-col">
              <span class="font-medium">{{ data.localName }}</span>
              <span class="text-xs text-moon/60">{{ formatDate(data.localLastEdited) }}</span>
            </div>
          </template>
        </Column>

        <Column header="远程版本" style="width: 200px">
          <template #body="{ data }">
            <div class="flex flex-col">
              <span class="font-medium">{{ data.remoteName }}</span>
              <span
                v-if="data.remoteLastEdited.getTime() > 0"
                class="text-xs text-moon/60"
              >
                {{ formatDate(data.remoteLastEdited) }}
              </span>
              <span v-else class="text-xs text-moon/60 text-moon/40">
                不存在
              </span>
            </div>
          </template>
        </Column>

        <Column header="选择" style="width: 250px">
          <template #body="{ data }">
            <Select
              :model-value="selectedResolutions.get(data.id) || 'local'"
              :options="getConflictOptions(data)"
              option-label="label"
              option-value="value"
              placeholder="选择版本"
              class="w-full"
              @update:model-value="selectedResolutions.set(data.id, $event)"
            />
          </template>
        </Column>
      </DataTable>

      <div class="flex justify-end gap-2 pt-4 border-t border-white/10">
        <Button label="取消" class="p-button-text" @click="handleCancel" />
        <Button label="应用选择" class="p-button-primary" @click="handleResolve" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
/* 冲突对话框特定样式 */
/* 注意：DataTable、Paginator 和 Dropdown 的主题样式已在全局样式中定义 */
</style>

