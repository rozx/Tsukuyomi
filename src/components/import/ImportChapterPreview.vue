<script setup lang="ts">
/**
 * 草稿章节的正文检查：显示实际提取到的段落、关联的原始来源和提取时排除的内容。
 * 未取得正文的章节只显示缺失／失败状态，不显示伪造的正文。
 */
import { computed, ref } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import ImportExcludedList from './ImportExcludedList.vue';
import { CHAPTER_STATUS, readableError } from './import-labels';

const ctx = injectImportPage();
const PAGE = 200;
const shown = ref(PAGE);

const preview = computed(() => ctx.preview.value);
const title = computed(() => preview.value?.title ?? '章节正文');
const status = computed(() => (preview.value ? CHAPTER_STATUS[preview.value.status] : undefined));
const loading = computed(() => ctx.previewLoading.value && !preview.value);
const error = computed(() => (ctx.previewError.value ? readableError(ctx.previewError.value) : ''));
const sources = computed(() => preview.value?.sources ?? []);
const failures = computed(() => (preview.value?.failures ?? []).map(readableError));
const paragraphs = computed(() => preview.value?.paragraphs.slice(0, shown.value) ?? []);
const remaining = computed(() =>
  Math.max(0, (preview.value?.paragraphs.length ?? 0) - shown.value),
);
const excluded = computed(() => preview.value?.excluded ?? []);
const emptyNote = computed(() => {
  if (!preview.value || preview.value.paragraphs.length) return '';
  return preview.value.status === 'ready'
    ? '引用范围内没有正文。'
    : '这一章尚未取得正文，导入时不会生成内容。';
});

/** 空段落保留高度，与导入后的空行一致 */
const displayText = (text: string) => text || String.fromCharCode(0xa0);
const paragraphClass = (kind: string) => ({ 'icp-paragraph--existing': kind === 'existing' });

/** 从正文跳到对应来源：切到来源分区并展开其保存的内容。 */
const locateSource = (sourceId: string) => {
  ctx.section.value = 'sources';
  void ctx.showSource(sourceId);
};
</script>

<template>
  <section class="icp" aria-label="章节正文检查">
    <header class="icp-head">
      <i class="pi pi-eye icp-title-icon" aria-hidden="true" />
      <span class="icp-title">{{ title }}</span>
      <span v-if="status" class="ipl-status" :class="`ipl-status--${status.severity}`">
        {{ status.label }}
      </span>
      <button
        type="button"
        class="icp-close"
        aria-label="关闭正文检查"
        @click="ctx.selectChapter(null)"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>

    <div v-if="loading" class="icp-loading">
      <ProgressSpinner style="width: 28px; height: 28px" stroke-width="5" />
    </div>
    <p v-else-if="error" class="icp-note icp-note--error">{{ error }}</p>
    <template v-else-if="preview">
      <div v-if="sources.length" class="icp-sources">
        <span class="icp-label">来源</span>
        <button
          v-for="source in sources"
          :key="source.id"
          type="button"
          class="icp-source"
          @click="locateSource(source.id)"
        >
          {{ source.relativePath || source.name }}
        </button>
      </div>

      <p v-for="failure in failures" :key="failure" class="icp-note icp-note--error">
        读取失败：{{ failure }}
      </p>
      <p v-if="emptyNote" class="icp-note">{{ emptyNote }}</p>

      <div class="icp-body">
        <p
          v-for="(paragraph, index) in paragraphs"
          :key="index"
          class="icp-paragraph"
          :class="paragraphClass(paragraph.kind)"
        >
          {{ displayText(paragraph.text) }}
        </p>
        <button v-if="remaining" type="button" class="icp-more" @click="shown += PAGE">
          显示更多（剩余 {{ remaining }} 段）
        </button>
      </div>

      <ImportExcludedList v-if="excluded.length" :entries="excluded" />
    </template>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.icp {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
}

.icp-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icp-title-icon {
  font-size: 0.8rem;
  color: rgba(165, 180, 252, 0.9);
}

.icp-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icp-close {
  width: 1.8rem;
  height: 1.8rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.6);
}

.icp-loading {
  display: grid;
  place-items: center;
  padding: 2rem;
}

.icp-note {
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}

.icp-note--error {
  color: rgb(252, 165, 165);
}

.icp-sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.icp-label {
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.5);
}

.icp-source {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.14);
  color: rgb(199, 210, 254);
}

.icp-body {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  overflow-y: auto;
  min-height: 0;
}

.icp-paragraph {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.icp-paragraph--existing {
  color: rgba(226, 232, 240, 0.7);
  border-left: 2px solid rgba(129, 140, 248, 0.45);
  padding-left: 0.5rem;
}

.icp-more {
  align-self: flex-start;
  font-size: 0.75rem;
  color: rgb(165, 180, 252);
}
</style>
