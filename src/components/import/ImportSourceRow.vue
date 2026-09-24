<script setup lang="ts">
/** 来源列表的一行：名称、网址或大小、错误，以及「月詠发现」「仅元信息」与处理状态。 */
import { computed } from 'vue';
import type { ImportSource } from 'src/models/import';
import { SOURCE_ICON, SOURCE_STATUS, readableError } from './import-labels';

const props = defineProps<{
  source: ImportSource;
  depth: number;
  selected: boolean;
  referenced: boolean;
  removeDisabled: boolean;
}>();
const emit = defineEmits<{ open: [sourceId: string]; remove: [sourceId: string] }>();

const rowClass = computed(() => ({
  'isr--selected': props.selected,
  'isr--referenced': props.referenced,
  'isr--child': props.depth > 0,
}));
const indent = computed(() => ({ marginLeft: `${props.depth * 1.1}rem` }));
const label = computed(() => props.source.relativePath || props.source.name);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const detail = computed(() => {
  const { url, name, byteLength } = props.source;
  if (url && url !== name) return url;
  return byteLength !== undefined ? formatBytes(byteLength) : '';
});
const error = computed(() => (props.source.error ? readableError(props.source.error.message) : ''));
const status = computed(() => SOURCE_STATUS[props.source.status]);
</script>

<template>
  <li class="isr" :class="rowClass" :style="indent">
    <button type="button" class="isr-main" @click="emit('open', source.id)">
      <span class="isr-icon" aria-hidden="true"><i :class="SOURCE_ICON[source.kind]" /></span>
      <span class="isr-text">
        <span class="isr-name">{{ label }}</span>
        <span v-if="detail" class="isr-detail">{{ detail }}</span>
        <span v-if="error" class="isr-error">{{ error }}</span>
      </span>
    </button>
    <span class="isr-meta">
      <span v-if="source.origin === 'agent'" class="isr-badge isr-badge--agent">月詠发现</span>
      <span v-if="source.purpose === 'metadata-only'" class="isr-badge">仅元信息</span>
      <span class="ipl-status" :class="`ipl-status--${status.severity}`">{{ status.label }}</span>
      <button
        type="button"
        class="isr-delete"
        :aria-label="`删除来源 ${label}`"
        :title="
          removeDisabled
            ? '请先等待当前操作结束，运行中的任务需先暂停'
            : '删除来源入口，保留草稿章节'
        "
        :disabled="removeDisabled"
        @click="emit('remove', source.id)"
      >
        <i class="pi pi-trash" aria-hidden="true" />
      </button>
    </span>
  </li>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.isr {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: background 150ms ease;
}

.isr:hover {
  background: rgba(255, 255, 255, 0.04);
}

.isr--child {
  border-left: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 0 10px 10px 0;
}

.isr--referenced {
  background: rgba(99, 102, 241, 0.08);
}

.isr--selected {
  border-color: rgba(129, 140, 248, 0.45);
  background: rgba(99, 102, 241, 0.14);
}

.isr-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-align: left;
}

.isr-icon {
  flex-shrink: 0;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 0.85rem;
  color: rgba(165, 180, 252, 0.9);
  background: rgba(99, 102, 241, 0.12);
}

.isr-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.isr-name,
.isr-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.isr-name {
  font-size: 0.84rem;
}

.isr-detail {
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.45);
}

.isr-error {
  font-size: 0.72rem;
  color: rgb(252, 165, 165);
}

.isr-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem 0.5rem;
  flex-shrink: 0;
}

.isr-badge {
  padding: 0 0.4rem;
  border-radius: 6px;
  font-size: 0.66rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.65);
  background: rgba(255, 255, 255, 0.07);
}

.isr-badge--agent {
  color: rgb(199, 210, 254);
  background: rgba(99, 102, 241, 0.16);
}

.isr-delete {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: rgba(226, 232, 240, 0.55);
}

.isr-delete:hover:not(:disabled) {
  color: rgb(252, 165, 165);
  background: rgba(239, 68, 68, 0.12);
}

.isr-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

@media (max-width: 480px) {
  .isr {
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;
  }

  .isr-meta {
    justify-content: flex-start;
    padding-left: 2.5rem;
  }
}
</style>
