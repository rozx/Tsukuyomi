<script setup lang="ts">
/**
 * 同步修订历史 · 展开后的文件变更列表。
 * 从 SyncSettingsTab 抽出以降低修订区块的模板复杂度。样式为全局 Tailwind 工具类。
 */
import { computed } from 'vue';
import { useBooksStore } from 'src/stores/books';
import {
  getGroupedFiles,
  formatFileSize,
  type GroupedRevisionFile,
  type RevisionFileStatus,
} from 'src/components/settings/sync-revision-display';

const props = defineProps<{
  isLoading: boolean;
  files:
    | Array<{
        filename: string;
        status: RevisionFileStatus;
        size?: number;
        sizeDiff?: number;
      }>
    | undefined;
}>();

const booksStore = useBooksStore();

const hasFiles = computed(() => !!props.files && props.files.length > 0);
const groupedFiles = computed<GroupedRevisionFile[]>(() =>
  getGroupedFiles(props.files ?? [], booksStore.books),
);
const sizeText = (file: GroupedRevisionFile) =>
  file.size !== undefined ? formatFileSize(file.size) : '-';
const hasSizeDiff = (file: GroupedRevisionFile) => file.sizeDiff !== undefined;
const sizeDiffClass = (file: GroupedRevisionFile) => {
  if (file.sizeDiff === undefined) return 'text-xs text-moon/60';
  if (file.sizeDiff > 0) return 'text-xs text-green-500';
  if (file.sizeDiff < 0) return 'text-xs text-red-500';
  return 'text-xs text-moon/60';
};
const sizeDiffText = (file: GroupedRevisionFile) =>
  `${file.sizeDiff! > 0 ? '+' : ''}${formatFileSize(Math.abs(file.sizeDiff!))}`;
</script>

<template>
  <div v-if="isLoading" class="text-center py-4">
    <i class="pi pi-spin pi-spinner text-moon/60" />
    <span class="text-sm text-moon/60 ml-2">加载中...</span>
  </div>
  <div v-else-if="hasFiles" class="space-y-2">
    <div
      v-for="file in groupedFiles"
      :key="file.filename"
      class="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5"
    >
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <i :class="[file.icon, 'text-moon/60 text-sm']" />
        <span class="text-sm text-moon/90 truncate">{{ file.displayName }}</span>
      </div>
      <div class="flex items-center gap-2 ml-2">
        <span class="text-xs text-moon/60">{{ sizeText(file) }}</span>
        <span v-if="hasSizeDiff(file)" :class="sizeDiffClass(file)">
          {{ sizeDiffText(file) }}
        </span>
      </div>
    </div>
  </div>
  <p v-else class="text-sm text-moon/60 text-center py-2">无文件变更信息</p>
</template>
