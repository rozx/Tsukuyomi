<script setup lang="ts">
/**
 * 草稿章节的正文检查：显示实际提取到的段落、关联的原始来源和提取时排除的内容。
 * 未取得正文的章节只显示缺失／失败状态，不显示伪造的正文。
 */
import { computed, ref } from 'vue';
import Tag from 'primevue/tag';
import ProgressSpinner from 'primevue/progressspinner';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { CHAPTER_STATUS, readableError } from './import-labels';

const ctx = injectImportPage();
const PAGE = 200;
const shown = ref(PAGE);
const preview = computed(() => ctx.preview.value);
const paragraphs = computed(() => preview.value?.paragraphs.slice(0, shown.value) ?? []);
const showExcluded = ref(false);

/** 空段落保留高度，与导入后的空行一致 */
const displayText = (text: string) => text || String.fromCharCode(0xa0);

/** 从正文跳到对应来源：切到来源分区并展开其保存的内容。 */
const locateSource = (sourceId: string) => {
  ctx.section.value = 'sources';
  void ctx.showSource(sourceId);
};
</script>

<template>
  <section class="icp" aria-label="章节正文检查">
    <header class="icp-head">
      <span class="icp-title">{{ preview?.title ?? '章节正文' }}</span>
      <Tag
        v-if="preview"
        :value="CHAPTER_STATUS[preview.status].label"
        :severity="CHAPTER_STATUS[preview.status].severity"
      />
      <button
        type="button"
        class="icp-close"
        aria-label="关闭正文检查"
        @click="ctx.selectChapter(null)"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>

    <div v-if="ctx.previewLoading.value && !preview" class="icp-loading">
      <ProgressSpinner style="width: 28px; height: 28px" stroke-width="5" />
    </div>
    <p v-else-if="ctx.previewError.value" class="icp-note icp-note--error">
      {{ readableError(ctx.previewError.value) }}
    </p>
    <template v-else-if="preview">
      <div v-if="preview.sources.length" class="icp-sources">
        <span class="icp-label">来源</span>
        <button
          v-for="source in preview.sources"
          :key="source.id"
          type="button"
          class="icp-source"
          @click="locateSource(source.id)"
        >
          {{ source.relativePath || source.name }}
        </button>
      </div>

      <p v-for="failure in preview.failures" :key="failure" class="icp-note icp-note--error">
        读取失败：{{ readableError(failure) }}
      </p>

      <p v-if="!preview.paragraphs.length" class="icp-note">
        {{
          preview.status === 'ready'
            ? '引用范围内没有正文。'
            : '这一章尚未取得正文，导入时不会生成内容。'
        }}
      </p>
      <div v-else class="icp-body">
        <p
          v-for="(paragraph, index) in paragraphs"
          :key="index"
          class="icp-paragraph"
          :class="{ 'icp-paragraph--existing': paragraph.kind === 'existing' }"
        >
          {{ displayText(paragraph.text) }}
        </p>
        <button
          v-if="preview.paragraphs.length > shown"
          type="button"
          class="icp-more"
          @click="shown += PAGE"
        >
          显示更多（剩余 {{ preview.paragraphs.length - shown }} 段）
        </button>
      </div>

      <div v-if="preview.excluded.length" class="icp-excluded">
        <button type="button" class="icp-toggle" @click="showExcluded = !showExcluded">
          <i
            :class="['pi', showExcluded ? 'pi-chevron-down' : 'pi-chevron-right']"
            aria-hidden="true"
          />
          提取时排除的内容（{{ preview.excluded.length }} 处）
        </button>
        <ul v-if="showExcluded" class="icp-excluded-list">
          <li v-for="(entry, index) in preview.excluded" :key="index">
            <span class="icp-reason">{{ entry.reason }}</span>
            <span class="icp-excluded-text">{{ entry.text }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

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

.icp-more,
.icp-toggle {
  align-self: flex-start;
  font-size: 0.75rem;
  color: rgb(165, 180, 252);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.icp-excluded-list {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.icp-excluded-list li {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.75rem;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
}

.icp-reason {
  color: rgb(253, 224, 71);
}

.icp-excluded-text {
  color: rgba(226, 232, 240, 0.65);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
