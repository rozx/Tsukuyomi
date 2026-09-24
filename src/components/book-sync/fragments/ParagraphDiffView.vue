<script setup lang="ts">
/**
 * 段落级差异：逐段标出修订、新增、移除、移动的段落，以及哪些段落的译文会被清空。
 * 未变化的段落只计数不展示，避免长章节淹没真正的变化。
 */
import { computed } from 'vue';
import type { ImportParagraphChange } from 'src/models/import';

const props = defineProps<{ changes: ImportParagraphChange[] }>();

const KIND_LABEL: Record<ImportParagraphChange['kind'], string> = {
  revise: '修订',
  insert: '新增',
  remove: '移除',
  move: '移动',
  retain: '未变化',
};

const shown = computed(() => props.changes.filter((change) => change.kind !== 'retain'));
const retained = computed(() => props.changes.length - shown.value.length);
</script>

<template>
  <div class="pdv">
    <p v-if="shown.length === 0" class="pdv-empty">段落结构没有变化</p>
    <ol v-else class="pdv-list">
      <li
        v-for="change in shown"
        :key="`${change.kind}:${change.paragraphId}`"
        class="pdv-item"
        :data-kind="change.kind"
      >
        <div class="pdv-head">
          <span class="pdv-kind" :class="`pdv-kind--${change.kind}`">
            {{ KIND_LABEL[change.kind] }}
          </span>
          <span v-if="change.clearedVersions > 0" class="pdv-loss">
            清空 {{ change.clearedVersions }} 个译文版本
          </span>
        </div>
        <p v-if="change.before && change.kind !== 'insert'" class="pdv-text pdv-text--before">
          {{ change.before }}
        </p>
        <p v-if="change.after && change.kind !== 'remove'" class="pdv-text pdv-text--after">
          {{ change.after }}
        </p>
      </li>
    </ol>
    <p v-if="retained > 0" class="pdv-retained">其余 {{ retained }} 段未变化</p>
  </div>
</template>

<style scoped>
.pdv {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 22rem;
  overflow-y: auto;
  scrollbar-width: thin;
}

.pdv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.pdv-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.pdv-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.pdv-kind {
  padding: 0.02rem 0.4rem;
  border-radius: 6px;
  font-size: 0.66rem;
  font-weight: 600;
}

.pdv-kind--revise,
.pdv-kind--move {
  color: rgb(147, 197, 253);
  background: rgba(59, 130, 246, 0.14);
}

.pdv-kind--insert {
  color: rgb(134, 239, 172);
  background: rgba(34, 197, 94, 0.12);
}

.pdv-kind--remove {
  color: rgb(252, 165, 165);
  background: rgba(239, 68, 68, 0.12);
}

.pdv-loss {
  font-size: 0.68rem;
  color: rgb(253, 186, 116);
}

.pdv-text {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.pdv-text--before {
  color: rgba(252, 165, 165, 0.8);
  text-decoration: line-through;
  text-decoration-color: rgba(252, 165, 165, 0.45);
}

.pdv-text--after {
  color: rgba(226, 232, 240, 0.9);
}

.pdv-empty,
.pdv-retained {
  margin: 0;
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.5);
}
</style>
