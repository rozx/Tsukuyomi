<script setup lang="ts">
/**
 * 新章节：按目标卷分组，每组标题见 NewChapterGroupHead；逐章可勾选、预览正文、跳过。
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import { effectiveTarget, type NewChapterGroup } from 'src/composables/book-sync/book-sync-rules';
import ChapterPreviewText from './ChapterPreviewText.vue';
import NewChapterGroupHead from './NewChapterGroupHead.vue';
import SelectableChapterRow from './SelectableChapterRow.vue';

const { changeset, volumeOverrides, working, setSkipped } = injectBookSync();

const groups = computed<NewChapterGroup[]>(() => {
  const result: NewChapterGroup[] = [];
  for (const chapter of changeset.value?.new ?? []) {
    let group = result.find((entry) => entry.key === chapter.groupKey);
    if (!group) {
      group = {
        key: chapter.groupKey,
        target: effectiveTarget(chapter, volumeOverrides.value),
        overridden: volumeOverrides.value.has(chapter.groupKey),
        chapters: [],
      };
      result.push(group);
    }
    group.chapters.push(chapter);
  }
  return result;
});

const previewing = ref(new Set<string>());

function togglePreview(url: string): void {
  const next = new Set(previewing.value);
  if (next.has(url)) next.delete(url);
  else next.add(url);
  previewing.value = next;
}
</script>

<template>
  <section v-if="groups.length" class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-plus-circle" aria-hidden="true" />新章节
        <span class="ipl-count">{{ changeset?.new.length ?? 0 }}</span>
      </h3>
    </div>
    <div v-for="group in groups" :key="group.key" class="ncg-group">
      <NewChapterGroupHead :group="group" />
      <ul class="bsw-list ncg-list">
        <SelectableChapterRow
          v-for="chapter in group.chapters"
          :key="chapter.url"
          :url="chapter.url"
          :title="chapter.title"
        >
          <span class="bsw-actions">
            <Button
              icon="pi pi-eye"
              size="small"
              text
              rounded
              :aria-label="`预览${chapter.title}`"
              @click="togglePreview(chapter.url)"
            />
            <Button
              icon="pi pi-eye-slash"
              size="small"
              text
              rounded
              :aria-label="`跳过${chapter.title}`"
              :disabled="working"
              @click="setSkipped([{ url: chapter.url, title: chapter.title }], true)"
            />
          </span>
          <template v-if="previewing.has(chapter.url)" #detail>
            <ChapterPreviewText :url="chapter.url" />
          </template>
        </SelectableChapterRow>
      </ul>
    </div>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped src="../book-sync.css"></style>
<style scoped>
.ncg-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ncg-group + .ncg-group {
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.ncg-list {
  margin-left: 0.85rem;
  padding-left: 0.5rem;
  border-left: 2px solid rgba(129, 140, 248, 0.2);
}
</style>
