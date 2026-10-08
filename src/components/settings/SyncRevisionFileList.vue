<template>
  <div v-if="isLoading" class="text-center py-4" role="status">
    <i class="pi pi-spin pi-spinner text-moon/60" aria-hidden="true" />
    <span class="text-sm text-moon/60 ml-2">{{ t('syncUi.revision.loading') }}</span>
  </div>
  <div v-else-if="groupedFiles.length" class="revision-content">
    <div class="flex flex-wrap items-baseline justify-between gap-1 px-2 pb-3">
      <span class="text-sm text-moon/90">{{ t('syncUi.revision.contentTitle') }}</span>
      <span class="text-xs text-moon/60">
        {{
          t('syncUi.revision.groupSummary', { count: groupedFiles.length, files: files?.length })
        }}
      </span>
    </div>
    <div class="revision-groups">
      <SyncRevisionGroup v-for="group in groupedFiles" :key="group.filename" :group="group" />
    </div>
    <p class="text-xs text-moon/40 px-2 pt-2">{{ t('syncUi.revision.expandHint') }}</p>
  </div>
  <p v-else class="text-sm text-moon/60 text-center py-2">
    {{ t('syncUi.revision.noFiles') }}
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';
import { getGroupedFiles } from 'src/components/settings/sync-revision-display';
import SyncRevisionGroup from './SyncRevisionGroup.vue';
import type { RevisionFile } from 'src/components/settings/sync-revision-display';
import { useI18n } from 'vue-i18n';

interface Props {
  isLoading: boolean;
  files: RevisionFile[] | undefined;
  snapshotBookIds?: string[] | undefined;
}
const props = defineProps<Props>();
const { t } = useI18n();
const booksStore = useBooksStore();
const settingsStore = useSettingsStore();
const groupedFiles = computed(() =>
  getGroupedFiles(
    props.files ?? [],
    booksStore.books,
    settingsStore.uiLocale,
    props.snapshotBookIds,
  ),
);
</script>

<style scoped>
.revision-groups {
  max-height: 28rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}
</style>
