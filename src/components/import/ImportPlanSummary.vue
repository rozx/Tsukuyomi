<script setup lang="ts">
/** 方案的实际变化：目标、段落变化、译文影响、完整性、元信息与章节变化。 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import type { ImportPlan } from 'src/models/import';
import { METADATA_FIELDS } from './import-labels';

const props = defineProps<{ plan: ImportPlan }>();

const CHANGE_LABEL = { insert: '新增', update: '更新', restructure: '重组' } as const;
const MISSING_SHOWN = 12;

const targetLabel = computed(() => {
  const title = props.plan.book.title || '（未命名）';
  return props.plan.targetKind === 'new' ? `新建《${title}》` : `更新《${title}》`;
});
const summary = computed(() => props.plan.summary);
const stats = computed(() => {
  const value = summary.value;
  if (!value) return [];
  return [
    `选中 ${value.selectedChapters} 章`,
    `新增 ${value.insertedParagraphs} 段`,
    `修订 ${value.revisedParagraphs} 段`,
    `移动 ${value.movedParagraphs} 段`,
    `删除 ${value.removedParagraphs} 段`,
  ];
});
const loss = computed(() => {
  const value = summary.value;
  if (!value) return undefined;
  return value.clearedVersions
    ? {
        text: `原文修订的 ${value.clearedParagraphs} 段将清空共 ${value.clearedVersions} 个译文版本`,
        none: false,
      }
    : { text: '不会清空任何已有译文', none: true };
});
const unchanged = computed(() => summary.value !== undefined && !summary.value.hasChanges);

const completenessText = computed(() => {
  const { confirmed, knownTotal, missing } = props.plan.completeness;
  const scope =
    confirmed && knownTotal !== undefined
      ? `目录已确认共 ${knownTotal} 章。`
      : '完整性尚未确认，只能导入当前已发现的范围。';
  if (!missing.length) return scope;
  const listed = missing.slice(0, MISSING_SHOWN).join('、');
  const more = missing.length > MISSING_SHOWN ? ' 等' : '';
  return `${scope}缺失 ${missing.length} 项：${listed}${more}。`;
});

const fieldLabel = (field: string) =>
  METADATA_FIELDS[field as keyof typeof METADATA_FIELDS] ?? field;
const chapterChanges = computed(() => props.plan.chapterChanges ?? []);
</script>

<template>
  <div class="ips-box">
    <div class="ips-target">{{ targetLabel }}</div>
    <div v-if="stats.length" class="ips-stats">
      <span v-for="stat in stats" :key="stat">{{ stat }}</span>
    </div>
    <div v-if="loss" class="ips-loss" :class="{ 'ips-loss--none': loss.none }">
      <i class="pi pi-language" aria-hidden="true" />
      {{ loss.text }}
    </div>
    <div v-if="unchanged" class="ips-text">方案与书库现状一致，没有需要写入的变化。</div>
  </div>

  <div class="ips-block">
    <div class="ips-subtitle">完整性</div>
    <p class="ips-text">{{ completenessText }}</p>
  </div>

  <div v-if="plan.metadataChanges.length" class="ips-block">
    <div class="ips-subtitle">元信息变化</div>
    <ul class="ips-list">
      <li v-for="change in plan.metadataChanges" :key="change.field">
        <span class="ips-field">{{ fieldLabel(change.field) }}</span>
        <template v-if="change.before">
          <span class="ips-before">{{ change.before }}</span>
          <i class="pi pi-arrow-right ips-arrow" aria-hidden="true" />
        </template>
        <span>{{ change.after }}</span>
      </li>
    </ul>
  </div>

  <div v-if="chapterChanges.length" class="ips-block">
    <div class="ips-subtitle">章节变化（{{ chapterChanges.length }}）</div>
    <ul class="ips-list ips-list--scroll">
      <li v-for="change in chapterChanges" :key="change.draftChapterId">
        <Tag :value="CHANGE_LABEL[change.kind]" severity="secondary" />
        <span>{{ change.title }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ips-box {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.75rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.ips-target {
  font-weight: 600;
}

.ips-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.9rem;
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.75);
}

.ips-loss {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: rgb(253, 186, 116);
}

.ips-loss--none {
  color: rgb(134, 239, 172);
}

.ips-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ips-subtitle {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.8);
}

.ips-text {
  font-size: 0.76rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}

.ips-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ips-list li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  flex-wrap: wrap;
}

.ips-list--scroll {
  max-height: 16rem;
  overflow-y: auto;
}

.ips-field {
  color: rgba(226, 232, 240, 0.55);
  min-width: 2.5rem;
}

.ips-before {
  color: rgba(226, 232, 240, 0.45);
  text-decoration: line-through;
}

.ips-arrow {
  font-size: 0.65rem;
  color: rgba(226, 232, 240, 0.4);
}
</style>
