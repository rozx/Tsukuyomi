<script setup lang="ts">
/**
 * 同步状态面板的「恢复已删除项目」对话框。从 SyncStatusBody 拆出，
 * 把 v-for + 图标三元等搬进子组件，降低父模板圈复杂度。
 */
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import { formatRelativeTime } from 'src/utils/format';
import type { RestorableItem } from 'src/services/sync-data-service';

interface Props {
  visible: boolean;
  restorableItems: RestorableItem[];
  selectedRestoreItems: string[];
  isRestoringRevision: boolean;
  nowMs: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:selectedRestoreItems': [value: string[]];
  skip: [];
  confirm: [];
}>();

const TYPE_ICON: Record<RestorableItem['type'], string> = {
  novel: 'pi pi-book',
  model: 'pi pi-cog',
  cover: 'pi pi-image',
  // memory 在原模板的三元里走 else 分支，落到 pi-image，保持逐字一致
  memory: 'pi pi-image',
};

const TYPE_LABEL: Record<RestorableItem['type'], string> = {
  novel: '书籍',
  model: 'AI 模型',
  cover: '封面',
  // memory 在原 getItemTypeLabel 的 default 分支返回「项目」，保持逐字一致
  memory: '项目',
};

const onSelectedUpdate = (value: string[]) => emit('update:selectedRestoreItems', value);
const onVisibleUpdate = (value: boolean) => emit('update:visible', value);
const formatDeletedTime = (timestamp: number) => formatRelativeTime(timestamp, props.nowMs);
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    header="发现已删除的项目"
    desktop-width="450px"
    eyebrow="RESTORE"
    @update:visible="onVisibleUpdate"
  >
    <div class="space-y-4">
      <p class="text-moon/80">远程存在以下您之前删除的项目，您可以选择恢复它们：</p>

      <div class="max-h-60 overflow-y-auto space-y-2">
        <div
          v-for="item in restorableItems"
          :key="item.id"
          class="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
        >
          <Checkbox
            :model-value="selectedRestoreItems"
            :input-id="item.id"
            :value="item.id"
            :disabled="isRestoringRevision"
            @update:model-value="onSelectedUpdate"
          />
          <label :for="item.id" class="flex-1 cursor-pointer">
            <div class="flex items-center gap-2">
              <i :class="[TYPE_ICON[item.type], 'text-moon/70']" />
              <span class="text-moon/90">{{ item.title }}</span>
              <span class="text-xs text-moon/50"> ({{ TYPE_LABEL[item.type] }}) </span>
            </div>
            <div class="text-xs text-moon/50 mt-1">
              删除于: {{ formatDeletedTime(item.deletedAt) }}
            </div>
          </label>
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="跳过" class="p-button-text" :disabled="isRestoringRevision" @click="emit('skip')" />
      <Button
        label="恢复选中项目"
        class="p-button-primary"
        :disabled="isRestoringRevision || selectedRestoreItems.length === 0"
        @click="emit('confirm')"
      />
    </template>
  </AdaptiveDialog>
</template>
