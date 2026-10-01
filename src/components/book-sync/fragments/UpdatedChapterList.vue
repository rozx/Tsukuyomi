<script setup lang="ts">
/**
 * 原文有修订的已导入章节：显示变化段落数与将清空的译文版本数，可查看段落差异。
 * 没有修订时整块不显示
 * 从不自动勾选；批量勾选时标出合计清空的译文版本，避免误操作。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import ParagraphDiffView from './ParagraphDiffView.vue';
import SelectableChapterRow from './SelectableChapterRow.vue';

const { changeset, selected, setUpdatedSelected } = injectBookSync();

const { t } = useI18n();
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
  <section v-if="chapters.length" class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-sync" aria-hidden="true" />{{ t('bookUi.sync.updatedTitle') }}
        <span class="ipl-count">{{ chapters.length }}</span>
      </h3>
      <Button
        :label="
          allSelected
            ? t('bookUi.sync.deselectAll')
            : t('bookUi.sync.selectAllClear', { count: totalCleared })
        "
        size="small"
        text
        @click="setUpdatedSelected(!allSelected)"
      />
    </div>
    <p class="ipl-muted">
      {{ t('bookUi.sync.updatedHint') }}
    </p>
    <ul class="bsw-list">
      <SelectableChapterRow
        v-for="chapter in chapters"
        :key="chapter.url"
        :url="chapter.url"
        :title="chapter.title"
      >
        <span class="bsw-sub">
          {{
            t('bookUi.sync.revisionStats', {
              revised: chapter.revised,
              inserted: chapter.inserted,
              removed: chapter.removed,
            })
          }}
        </span>
        <span v-if="chapter.clearedVersions > 0" class="bsw-badge bsw-badge--loss">
          {{ t('bookUi.sync.clearVersions', { count: chapter.clearedVersions }) }}
        </span>
        <Button
          :label="
            t(expanded.has(chapter.url) ? 'bookUi.sync.collapseDiff' : 'bookUi.sync.viewDiff')
          "
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
