<template>
  <details class="revision-group" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
    <summary class="revision-summary">
      <i class="pi pi-chevron-right revision-chevron" aria-hidden="true" />
      <i :class="[group.icon, 'text-moon/60']" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 min-w-0">
          <span class="revision-title text-sm text-moon/90" :title="group.displayName">
            {{ group.displayName }}
          </span>
          <span v-if="group.status === 'removed'" class="revision-badge text-red-400">
            {{ t('syncUi.revision.removed') }}
          </span>
          <span v-else-if="group.status === 'added'" class="revision-badge text-green-400">
            {{ t('syncUi.revision.added') }}
          </span>
        </div>
        <div class="text-xs text-moon/50 mt-1">
          {{ group.description }}
        </div>
      </div>
      <div class="revision-size">
        <span v-if="group.size !== undefined" class="text-xs text-moon/70">
          {{ formatFileSize(group.size) }}
        </span>
        <span v-if="group.sizeDiff" data-size-diff :class="diffClass(group.sizeDiff)">
          {{ diffText(group.sizeDiff) }}
        </span>
      </div>
    </summary>
    <ul v-if="expanded" class="revision-files">
      <li v-for="file in group.files" :key="file.filename" class="revision-file">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-xs text-moon/70">
            <span>{{ file.displayName }}</span>
            <span v-if="file.status === 'removed'" class="text-red-400">
              {{ t('syncUi.revision.removed') }}
            </span>
            <span v-else-if="file.status === 'added'" class="text-green-400">
              {{ t('syncUi.revision.added') }}
            </span>
          </div>
          <code class="block text-xs text-moon/40 truncate mt-1" :title="file.filename">
            {{ file.filename }}
          </code>
        </div>
        <div class="revision-size">
          <span v-if="file.size !== undefined" class="text-xs text-moon/60">
            {{ formatFileSize(file.size) }}
          </span>
          <span v-if="file.sizeDiff" data-size-diff :class="diffClass(file.sizeDiff)">
            {{ diffText(file.sizeDiff) }}
          </span>
        </div>
      </li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatFileSize } from 'src/components/settings/sync-revision-display';
import type { GroupedRevisionFile } from 'src/components/settings/sync-revision-display';

interface Props {
  group: GroupedRevisionFile;
}
defineProps<Props>();
const { t } = useI18n();
const expanded = ref(false);
const diffClass = (diff: number) => `text-xs ${diff > 0 ? 'text-green-400' : 'text-red-400'}`;
const diffText = (diff: number) => `${diff > 0 ? '+' : '−'}${formatFileSize(Math.abs(diff))}`;
</script>

<style scoped>
.revision-group + .revision-group {
  border-top: 1px solid rgb(255 255 255 / 5%);
}
.revision-summary {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 0.5rem;
  cursor: pointer;
  list-style: none;
  border-radius: 0.375rem;
}
.revision-summary::-webkit-details-marker {
  display: none;
}
.revision-summary:hover {
  background: rgb(255 255 255 / 4%);
}
.revision-summary:focus-visible {
  outline: 2px solid rgb(148 163 184 / 70%);
  outline-offset: -2px;
}
.revision-chevron {
  color: rgb(255 255 255 / 40%);
  font-size: 0.625rem;
}
.revision-group[open] .revision-chevron {
  transform: rotate(90deg);
}
.revision-badge {
  flex-shrink: 0;
  font-size: 0.625rem;
}
.revision-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.revision-group[open] .revision-title {
  -webkit-line-clamp: unset;
}
.revision-size {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
  gap: 0.25rem;
  font-variant-numeric: tabular-nums;
}
.revision-files {
  margin: 0 0.5rem 0.5rem 1rem;
  padding: 0 0 0 0.75rem;
  border-left: 1px solid rgb(255 255 255 / 10%);
  list-style: none;
}
.revision-file {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}
</style>
