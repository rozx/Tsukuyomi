<script setup lang="ts">
/** 来源列表的一行：名称、网址、错误以及「用户提供／月詠发现」「仅元信息」和处理状态。 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import type { ImportSource } from 'src/models/import';
import { SOURCE_ICON, SOURCE_STATUS, readableError } from './import-labels';

const props = defineProps<{
  source: ImportSource;
  depth: number;
  selected: boolean;
  referenced: boolean;
}>();
const emit = defineEmits<{ open: [sourceId: string] }>();

const rowClass = computed(() => ({
  'isr--selected': props.selected,
  'isr--referenced': props.referenced,
}));
const indent = computed(() => ({ paddingLeft: `${0.6 + props.depth * 1.1}rem` }));
const label = computed(() => props.source.relativePath || props.source.name);
const url = computed(() =>
  props.source.url && props.source.url !== props.source.name ? props.source.url : '',
);
const error = computed(() => (props.source.error ? readableError(props.source.error.message) : ''));
const origin = computed(() =>
  props.source.origin === 'user'
    ? { value: '用户提供', severity: 'secondary' as const }
    : { value: '月詠发现', severity: 'info' as const },
);
const metadataOnly = computed(() => props.source.purpose === 'metadata-only');
const status = computed(() => SOURCE_STATUS[props.source.status]);
</script>

<template>
  <li class="isr" :class="rowClass" :style="indent">
    <button type="button" class="isr-main" @click="emit('open', source.id)">
      <i :class="SOURCE_ICON[source.kind]" class="isr-icon" aria-hidden="true" />
      <span class="isr-text">
        <span class="isr-name">{{ label }}</span>
        <span v-if="url" class="isr-url">{{ url }}</span>
        <span v-if="error" class="isr-error">{{ error }}</span>
      </span>
    </button>
    <span class="isr-tags">
      <Tag :value="origin.value" :severity="origin.severity" />
      <Tag v-if="metadataOnly" value="仅元信息" severity="secondary" />
      <Tag :value="status.label" :severity="status.severity" />
    </span>
  </li>
</template>

<style scoped>
.isr {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 10px;
  border: 1px solid transparent;
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
  align-items: flex-start;
  gap: 0.5rem;
  text-align: left;
}

.isr-icon {
  margin-top: 0.2rem;
  font-size: 0.85rem;
  color: rgba(165, 180, 252, 0.9);
}

.isr-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.isr-name,
.isr-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.isr-name {
  font-size: 0.85rem;
}

.isr-url {
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.45);
}

.isr-error {
  font-size: 0.72rem;
  color: rgb(252, 165, 165);
}

.isr-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
}

.isr-tags :deep(.p-tag) {
  font-size: 0.62rem;
  padding: 0.1rem 0.35rem;
}

@media (max-width: 480px) {
  .isr {
    flex-direction: column;
    align-items: stretch;
  }

  .isr-tags {
    justify-content: flex-start;
    padding-left: 1.4rem;
  }
}
</style>
