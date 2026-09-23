<script setup lang="ts">
/**
 * 方案中需要用户处理的冲突：章节对应、合章设置来源、更新目标确认，以及多段替换的译文损失确认。
 * 每次处理都会修改草稿并重新生成方案。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useBooksStore } from 'src/stores/books';
import type { ImportPlan } from 'src/models/import';
import { getChapterDisplayTitle, getVolumeDisplayTitle } from 'src/utils/novel-utils';
import { readableError } from './import-labels';

const props = defineProps<{ plan: ImportPlan; disabled: boolean }>();
const store = useImportWorkspaceStore();
const booksStore = useBooksStore();

const NEW_CHAPTER = '__new__';
const targetBook = computed(() => booksStore.getBookById(props.plan.targetBookId));
const bookChapters = computed(() =>
  (targetBook.value?.volumes ?? []).flatMap((volume) =>
    (volume.chapters ?? []).map((chapter) => ({ volume, chapter })),
  ),
);
const matchOptions = computed(() => [
  { label: '作为新章节导入', value: NEW_CHAPTER },
  ...bookChapters.value.map(({ volume, chapter }) => ({
    label: `${getVolumeDisplayTitle(volume)} · ${getChapterDisplayTitle(chapter)}`,
    value: chapter.id,
  })),
]);
const chapterTitle = (id: string) => {
  const entry = bookChapters.value.find(({ chapter }) => chapter.id === id);
  return entry ? getChapterDisplayTitle(entry.chapter) : id;
};
const settingsOptions = (draftChapterId: string) =>
  (
    props.plan.chapterChanges?.find((entry) => entry.draftChapterId === draftChapterId)
      ?.oldChapterIds ?? []
  ).map((id) => ({ label: chapterTitle(id), value: id }));

type Resolver = 'match' | 'settings' | 'target' | 'none';
const conflicts = computed(() =>
  props.plan.conflicts.map((conflict) => {
    const chapterId = conflict.chapterId ?? '';
    let resolver: Resolver = 'none';
    if (conflict.code === 'CHAPTER_MATCH_REQUIRED' && chapterId && bookChapters.value.length)
      resolver = 'match';
    else if (conflict.code === 'CHAPTER_SETTINGS_CONFLICT' && chapterId) resolver = 'settings';
    else if (conflict.code === 'TARGET_CONFIRMATION_REQUIRED') resolver = 'target';
    return { message: readableError(conflict.message), chapterId, resolver };
  }),
);
const replacements = computed(() =>
  (props.plan.replacements ?? [])
    .filter((entry) => !entry.confirmed)
    .map((entry) => ({
      signature: entry.signature,
      text: `${entry.oldKeys.length} 段旧原文将被 ${entry.newKeys.length} 段新原文替换，清空 ${entry.clearedVersions} 个译文版本`,
    })),
);

const resolveMatch = (chapterId: string, value: string) =>
  void store.resolveMatch(chapterId, value === NEW_CHAPTER ? [] : [value]);
const chooseSettings = (chapterId: string, value: string) =>
  void store.chooseChapterSettings(chapterId, value);
</script>

<template>
  <div v-if="conflicts.length" class="ipc-block">
    <div class="ipc-subtitle">需要处理后才能导入（{{ conflicts.length }}）</div>
    <ul class="ipc-list">
      <li v-for="(conflict, index) in conflicts" :key="index" class="ipc-item">
        <span>{{ conflict.message }}</span>
        <Select
          v-if="conflict.resolver === 'match'"
          :options="matchOptions"
          option-label="label"
          option-value="value"
          filter
          placeholder="选择对应关系"
          size="small"
          class="ipc-select"
          :disabled="disabled"
          @update:model-value="(value: string) => resolveMatch(conflict.chapterId, value)"
        />
        <Select
          v-else-if="conflict.resolver === 'settings'"
          :options="settingsOptions(conflict.chapterId)"
          option-label="label"
          option-value="value"
          placeholder="沿用哪一章的设置"
          size="small"
          class="ipc-select"
          :disabled="disabled"
          @update:model-value="(value: string) => chooseSettings(conflict.chapterId, value)"
        />
        <Button
          v-else-if="conflict.resolver === 'target'"
          label="确认更新这本小说"
          size="small"
          text
          :disabled="disabled"
          @click="store.confirmTarget"
        />
      </li>
    </ul>
  </div>

  <div v-if="replacements.length" class="ipc-block">
    <div class="ipc-subtitle">多段替换（需确认译文损失）</div>
    <ul class="ipc-list">
      <li v-for="entry in replacements" :key="entry.signature" class="ipc-item">
        <span>{{ entry.text }}</span>
        <Button
          label="确认替换"
          size="small"
          text
          :disabled="disabled"
          @click="store.confirmReplacement(entry.signature)"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ipc-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ipc-subtitle {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.8);
}

.ipc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ipc-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.75rem;
  font-size: 0.78rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  background: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.2);
}

.ipc-select {
  min-width: 12rem;
  max-width: 100%;
}
</style>
