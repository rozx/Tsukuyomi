<script setup lang="ts">
/**
 * 方案中的待处理项：章节对应、合章设置来源、更新目标确认，以及多段替换的译文损失确认。
 * 每次处理都会修改草稿并重新生成方案。多段替换按章合并为一行（可展开对比原文、整章确认），
 * 不再重复列出对应的冲突说明；不会清空译文的替换已在生成方案时自动接受。
 * 待处理项的划分见 planPendingItems，与方案状态标签的计数一致。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import Button from 'primevue/button';
import Select from 'primevue/select';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useBooksStore } from 'src/stores/books';
import type { ImportPlan } from 'src/models/import';
import { getChapterDisplayTitle, getVolumeDisplayTitle } from 'src/utils/novel-utils';
import { readableError } from './import-labels';
import ImportPlanReplacementGroup from './ImportPlanReplacementGroup.vue';
import { planPendingItems } from 'src/composables/import-page/import-plan-pending';

const props = defineProps<{ plan: ImportPlan; disabled: boolean }>();
const store = useImportWorkspaceStore();
const { t, locale } = useI18n();
const booksStore = useBooksStore();

const NEW_CHAPTER = '__new__';
const targetBook = computed(() => booksStore.getBookById(props.plan.targetBookId));
const bookChapters = computed(() =>
  (targetBook.value?.volumes ?? []).flatMap((volume) =>
    (volume.chapters ?? []).map((chapter) => ({ volume, chapter })),
  ),
);
const matchOptions = computed(() => [
  { label: t('importUi.planConflicts.newChapter'), value: NEW_CHAPTER },
  ...bookChapters.value.map(({ volume, chapter }) => ({
    label: `${getVolumeDisplayTitle(volume, targetBook.value)} · ${getChapterDisplayTitle(chapter, targetBook.value)}`,
    value: chapter.id,
  })),
]);
const chapterTitle = (id: string) => {
  const entry = bookChapters.value.find(({ chapter }) => chapter.id === id);
  return entry ? getChapterDisplayTitle(entry.chapter, targetBook.value) : id;
};
const settingsOptions = (draftChapterId: string) =>
  (
    props.plan.chapterChanges?.find((entry) => entry.draftChapterId === draftChapterId)
      ?.oldChapterIds ?? []
  ).map((id) => ({ label: chapterTitle(id), value: id }));

const pending = computed(() => planPendingItems(props.plan));

type Resolver = 'match' | 'settings' | 'target' | 'none';
const conflicts = computed(() =>
  pending.value.conflicts.map((conflict) => {
    const chapterId = conflict.chapterId ?? '';
    let resolver: Resolver = 'none';
    if (conflict.code === 'CHAPTER_MATCH_REQUIRED' && chapterId && bookChapters.value.length)
      resolver = 'match';
    else if (conflict.code === 'CHAPTER_SETTINGS_CONFLICT' && chapterId) resolver = 'settings';
    else if (conflict.code === 'TARGET_CONFIRMATION_REQUIRED') resolver = 'target';
    return {
      message: readableError(conflict, resolveAppLocale(locale.value)),
      chapterId,
      resolver,
    };
  }),
);
const groups = computed(() => pending.value.replacementGroups);
const allSignatures = computed(() => groups.value.flatMap((group) => group.signatures));
const confirmReplacements = (signatures: string[]) => void store.confirmReplacements(signatures);

const resolveMatch = (chapterId: string, value: string) =>
  void store.resolveMatch(chapterId, value === NEW_CHAPTER ? [] : [value]);
const chooseSettings = (chapterId: string, value: string) =>
  void store.chooseChapterSettings(chapterId, value);
</script>

<template>
  <section v-if="pending.pending" class="ipl-card ipc">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />{{
          t('importUi.planConflicts.title')
        }}
        <span class="ipl-count">{{ pending.pending }}</span>
      </h3>
      <Button
        v-if="groups.length"
        :label="t('importUi.planConflicts.confirmAll', { count: allSignatures.length })"
        icon="pi pi-check-square"
        size="small"
        severity="warn"
        :disabled="disabled"
        @click="confirmReplacements(allSignatures)"
      />
    </div>
    <p class="ipl-muted">{{ t('importUi.planConflicts.hint') }}</p>
    <ul class="ipc-list">
      <li v-for="(conflict, index) in conflicts" :key="index" class="ipc-item">
        <span class="ipc-text">{{ conflict.message }}</span>
        <Select
          v-if="conflict.resolver === 'match'"
          :options="matchOptions"
          option-label="label"
          option-value="value"
          filter
          :placeholder="t('importUi.planConflicts.matchPlaceholder')"
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
          :placeholder="t('importUi.planConflicts.settingsPlaceholder')"
          size="small"
          class="ipc-select"
          :disabled="disabled"
          @update:model-value="(value: string) => chooseSettings(conflict.chapterId, value)"
        />
        <Button
          v-else-if="conflict.resolver === 'target'"
          :label="t('importUi.planConflicts.confirmTarget')"
          size="small"
          outlined
          :disabled="disabled"
          @click="store.confirmTarget"
        />
      </li>
      <ImportPlanReplacementGroup
        v-for="group in groups"
        :key="group.chapterId"
        :group="group"
        :chapter="group.chapterId ? chapterTitle(group.chapterId) : ''"
        :disabled="disabled"
        @confirm="confirmReplacements"
      />
    </ul>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.ipc {
  background: rgba(234, 179, 8, 0.06);
  border-color: rgba(234, 179, 8, 0.28);
}

.ipc .ipl-card-title > i {
  color: rgb(251, 191, 36);
}

.ipc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.ipc-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  font-size: 0.8rem;
  background: rgba(0, 0, 0, 0.18);
}

.ipc-text {
  flex: 1 1 14rem;
  min-width: 0;
  line-height: 1.5;
}

.ipc-select {
  flex: 0 1 16rem;
  min-width: 12rem;
  max-width: 100%;
}
</style>
