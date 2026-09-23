<script setup lang="ts">
/** 草稿中的一章：导入选择、标题、所属卷、上下移动与正文检查。 */
import { computed, ref, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportDraftChapter } from 'src/models/import';
import { CHAPTER_STATUS } from './import-labels';
import { plainChapter, useDraftLock } from './import-draft';

const props = defineProps<{
  chapter: ImportDraftChapter;
  first: boolean;
  last: boolean;
  volumeOptions: { label: string; value: string }[];
}>();
const emit = defineEmits<{ move: [chapterId: string, delta: number] }>();

const ctx = injectImportPage();
const store = useImportWorkspaceStore();
const locked = useDraftLock();

const title = ref(props.chapter.title);
watch(
  () => props.chapter.title,
  (value) => {
    title.value = value;
  },
);
const status = computed(() => CHAPTER_STATUS[props.chapter.status]);
const selectedRow = computed(() => ({
  'idcr--selected': ctx.selectedChapterId.value === props.chapter.id,
}));
const showVolumeSelect = computed(() => props.volumeOptions.length > 1);

const update = (changes: Partial<ImportDraftChapter>) =>
  void store.editDraft([
    { op: 'upsert_chapter', chapter: { ...plainChapter(props.chapter), ...changes } },
  ]);

const commitTitle = () => {
  const value = title.value.trim();
  if (!value || value === props.chapter.title) {
    title.value = props.chapter.title;
    return;
  }
  update({ title: value, inferredTitle: false });
};
const toggleSelected = (selected: boolean) => update({ selected });
const moveToVolume = (volumeId: string) => {
  if (volumeId !== props.chapter.volumeId) update({ volumeId, inferredStructure: false });
};
</script>

<template>
  <li class="idcr" :class="selectedRow">
    <Checkbox
      :model-value="chapter.selected"
      binary
      :disabled="locked"
      :aria-label="`导入 ${chapter.title}`"
      @update:model-value="toggleSelected"
    />
    <InputText
      v-model="title"
      class="idcr-title"
      :aria-label="`章节标题：${chapter.title}`"
      :disabled="locked"
      @blur="commitTitle"
      @keydown.enter="commitTitle"
    />
    <span class="idcr-tags">
      <Tag v-if="chapter.inferredTitle" value="推断标题" severity="secondary" />
      <Tag :value="status.label" :severity="status.severity" />
    </span>
    <span class="idcr-actions">
      <Select
        v-if="showVolumeSelect"
        :model-value="chapter.volumeId"
        :options="volumeOptions"
        option-label="label"
        option-value="value"
        size="small"
        class="idcr-volume"
        :aria-label="`${chapter.title} 所属卷`"
        :disabled="locked"
        @update:model-value="moveToVolume"
      />
      <button
        type="button"
        class="idcr-icon"
        aria-label="章节上移"
        :disabled="locked || first"
        @click="emit('move', chapter.id, -1)"
      >
        <i class="pi pi-arrow-up" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="idcr-icon"
        aria-label="章节下移"
        :disabled="locked || last"
        @click="emit('move', chapter.id, 1)"
      >
        <i class="pi pi-arrow-down" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="idcr-icon idcr-icon--preview"
        :aria-label="`查看 ${chapter.title} 的正文`"
        @click="ctx.selectChapter(chapter.id)"
      >
        <i class="pi pi-eye" aria-hidden="true" />
      </button>
    </span>
  </li>
</template>

<style scoped>
.idcr {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.4rem;
  border-radius: 10px;
  flex-wrap: wrap;
}

.idcr--selected {
  background: rgba(99, 102, 241, 0.12);
}

.idcr-title {
  flex: 1 1 10rem;
  min-width: 0;
}

.idcr-tags {
  display: flex;
  gap: 0.25rem;
}

.idcr-tags :deep(.p-tag) {
  font-size: 0.62rem;
  padding: 0.1rem 0.35rem;
}

.idcr-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.idcr-volume {
  max-width: 9rem;
}

.idcr-icon {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.6);
}

.idcr-icon:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(226, 232, 240, 0.95);
}

.idcr-icon:disabled {
  opacity: 0.3;
}

.idcr-icon--preview {
  color: rgb(165, 180, 252);
}
</style>
