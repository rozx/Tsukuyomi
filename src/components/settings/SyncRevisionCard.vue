<script setup lang="ts">
/**
 * 同步修订历史 · 单条修订卡片（行 + 展开后的文件列表）。
 * 从 SyncSettingsTab 抽出。行布局样式（.revision-row 等）保留在本组件 scoped 样式中。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { formatRelativeTime } from 'src/utils/format';
import type { RevisionFileStatus } from 'src/components/settings/sync-revision-display';
import SyncRevisionFileList from './SyncRevisionFileList.vue';

const props = defineProps<{
  version: string;
  committedAt: string;
  additions: number;
  deletions: number;
  files:
    | Array<{ filename: string; status: RevisionFileStatus; size?: number; sizeDiff?: number }>
    | undefined;
  isExpanded: boolean;
  isLoadingDetails: boolean;
  isReverting: boolean;
  isRestoreDisabled: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  revert: [event: Event];
}>();

const shortVersion = computed(() => props.version.substring(0, 7));
const relativeTime = computed(() => formatRelativeTime(new Date(props.committedAt).getTime()));
const localTime = computed(() => new Date(props.committedAt).toLocaleString('zh-CN'));
const chevronIcon = computed(() =>
  props.isExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right',
);
// 阻止冒泡，避免触发整行的 toggle
const onRevertClick = (event: Event) => {
  event.stopPropagation();
  event.preventDefault();
  emit('revert', event);
};
</script>

<template>
  <div class="border border-white/10 rounded-lg overflow-hidden">
    <div
      class="revision-row flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
      @click="emit('toggle')"
    >
      <div class="revision-info flex items-center gap-3 flex-1 min-w-0">
        <i :class="[chevronIcon, 'text-moon/60 text-sm flex-shrink-0']" />
        <code class="text-xs bg-white/5 px-2 py-1 rounded flex-shrink-0">{{ shortVersion }}</code>
        <div class="flex flex-col flex-1 min-w-0">
          <span class="text-sm text-moon/90 truncate">{{ relativeTime }}</span>
          <span class="text-xs text-moon/60 truncate">{{ localTime }}</span>
        </div>
        <div class="revision-stats flex items-center gap-2 flex-shrink-0">
          <span class="text-green-500 text-sm">+{{ additions }}</span>
          <span class="text-red-500 text-sm">-{{ deletions }}</span>
        </div>
      </div>
      <div class="revision-actions flex items-center gap-2 ml-4 flex-shrink-0">
        <Button
          label="恢复"
          icon="pi pi-undo"
          class="p-button-text p-button-sm"
          :disabled="isRestoreDisabled"
          :loading="isReverting"
          @click="onRevertClick"
        />
      </div>
    </div>

    <!-- 展开的文件变更列表 -->
    <div v-if="isExpanded" class="border-t border-white/10 bg-white/5 p-3">
      <SyncRevisionFileList :is-loading="isLoadingDetails" :files="files" />
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 640px) {
  .revision-row {
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem !important;
  }

  .revision-info {
    flex: 1 1 100%;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .revision-stats {
    margin-left: auto;
  }

  .revision-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
    margin-left: 0 !important;
  }
}
</style>
