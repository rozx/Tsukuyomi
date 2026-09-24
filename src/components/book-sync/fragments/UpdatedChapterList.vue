<script setup lang="ts">
/**
 * 有更新的已导入章节：显示变化段落数与将清空的译文版本数，可查看段落差异。
 * 从不自动勾选；批量勾选时标出合计清空的译文版本，避免误操作。
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import ParagraphDiffView from './ParagraphDiffView.vue';
import SelectableChapterRow from './SelectableChapterRow.vue';

const { changeset, selected, setUpdatedSelected } = injectBookSync();

const chapters = computed(() => changeset.value?.updated ?? []);
const allSelected = computed(
  () => chapters.value.length > 0 && chapters.value.every((c) => selected.value.has(c.url)),
);
const totalCleared = computed(() =>
  chapters.value.reduce((sum, chapter) => sum + chapter.clearedVersions, 0),
);
const expanded = ref(new Set<string>());

function toggleDiff(url: string): void {
  const next = new Set(expanded.value);
  if (next.has(url)) next.delete(url);
  else next.add(url);
  expanded.value = next;
}
</script>

<template>
  <section class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-sync" aria-hidden="true" />有更新
        <span class="ipl-count">{{ chapters.length }}</span>
      </h3>
      <Button
        v-if="chapters.length"
        :label="allSelected ? '全部取消' : `全部勾选（清空 ${totalCleared} 个译文版本）`"
        size="small"
        text
        @click="setUpdatedSelected(!allSelected)"
      />
    </div>
    <p v-if="chapters.length === 0" class="ipl-muted">已检查的章节都没有变化</p>
    <p v-else class="ipl-muted">
      更新会替换章节原文；原文被修订的段落会清空译文，未变化的段落保留译文。有更新的章节不会被自动勾选。
    </p>
    <ul class="bsw-list">
      <SelectableChapterRow
        v-for="chapter in chapters"
        :key="chapter.url"
        :url="chapter.url"
        :title="chapter.title"
      >
        <span class="bsw-sub">
          改 {{ chapter.revised }} · 增 {{ chapter.inserted }} · 删 {{ chapter.removed }}
        </span>
        <span v-if="chapter.clearedVersions > 0" class="bsw-badge bsw-badge--loss">
          清空 {{ chapter.clearedVersions }} 个译文版本
        </span>
        <Button
          :label="expanded.has(chapter.url) ? '收起差异' : '查看差异'"
          size="small"
          text
          @click="toggleDiff(chapter.url)"
        />
        <template v-if="expanded.has(chapter.url)" #detail>
          <ParagraphDiffView :changes="chapter.changes" />
        </template>
      </SelectableChapterRow>
    </ul>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped src="../book-sync.css"></style>
