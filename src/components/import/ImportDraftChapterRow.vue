<script setup lang="ts">
/** 草稿中的一章：导入选择、标题、所属卷、上下移动与正文检查。 */
import { computed, ref, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportDraftChapter } from 'src/models/import';
import { CHAPTER_STATUS } from './import-labels';
import { plainChapter, useDraftLock } from './import-draft';

const props = defineProps<{
  chapter: ImportDraftChapter;
  /** 全书顺序编号。 */
  number: number;
  first: boolean;
  last: boolean;
  volumeCount: number;
}>();
const emit = defineEmits<{
  move: [chapterId: string, delta: number];
  volumeMenu: [event: MouseEvent, chapter: ImportDraftChapter];
}>();

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
const rowClass = computed(() => ({
  'idcr--selected': ctx.selectedChapterId.value === props.chapter.id,
  'idcr--unselected': !props.chapter.selected,
}));
const showVolumeMenu = computed(() => props.volumeCount > 1);

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
</script>

<template>
  <li class="idcr" :class="rowClass">
    <Checkbox
      :model-value="chapter.selected"
      binary
      :disabled="locked"
      :aria-label="`导入 ${chapter.title}`"
      @update:model-value="toggleSelected"
    />
    <span class="idcr-number" aria-hidden="true">{{ number }}</span>
    <InputText
      v-model="title"
      class="idcr-title"
      :aria-label="`章节标题：${chapter.title}`"
      :disabled="locked"
      @blur="commitTitle"
      @keydown.enter="commitTitle"
    />
    <span class="idcr-meta">
      <span v-if="!chapter.selected" class="idcr-badge">不导入</span>
      <span v-if="chapter.inferredTitle" class="idcr-badge" title="标题由月詠推断">推断</span>
      <span class="ipl-status" :class="`ipl-status--${status.severity}`">{{ status.label }}</span>
    </span>
    <span class="idcr-actions">
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
        v-if="showVolumeMenu"
        type="button"
        class="idcr-icon"
        :aria-label="`移动 ${chapter.title} 到其他卷`"
        title="移到其他卷"
        :disabled="locked"
        @click="(event: MouseEvent) => emit('volumeMenu', event, chapter)"
      >
        <i class="pi pi-folder-open" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="idcr-icon idcr-icon--preview"
        :aria-label="`查看 ${chapter.title} 的正文`"
        title="检查正文"
        @click="ctx.selectChapter(chapter.id)"
      >
        <i class="pi pi-eye" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="idcr-icon idcr-icon--delete"
        :aria-label="`删除草稿章节 ${chapter.title}`"
        title="删除草稿章节"
        :disabled="locked"
        @click="ctx.requestDraftRemoval({ op: 'remove_chapter', chapterId: chapter.id })"
      >
        <i class="pi pi-trash" aria-hidden="true" />
      </button>
    </span>
  </li>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.idcr {
  display: grid;
  grid-template-columns: auto 1.6rem minmax(0, 1fr) auto auto;
  grid-template-areas: 'check number title meta actions';
  align-items: center;
  gap: 0.2rem 0.5rem;
  padding: 0.25rem 0.4rem;
  border-radius: 8px;
  transition: background 150ms ease;
}

.idcr > :first-child {
  grid-area: check;
}

.idcr:hover {
  background: rgba(255, 255, 255, 0.035);
}

.idcr--unselected .idcr-title,
.idcr--unselected .idcr-number {
  opacity: 0.55;
}

.idcr--selected {
  background: rgba(99, 102, 241, 0.14);
}

.idcr-number {
  grid-area: number;
  min-width: 1.6rem;
  text-align: right;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: rgba(226, 232, 240, 0.45);
}

.idcr-title {
  grid-area: title;
  min-width: 0;
  font-size: 0.84rem;
}

.idcr-title:not(:hover):not(:focus) {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.idcr-meta {
  grid-area: meta;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.idcr-badge {
  white-space: nowrap;
  padding: 0 0.4rem;
  border-radius: 6px;
  font-size: 0.66rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.65);
  background: rgba(255, 255, 255, 0.07);
}

.idcr-actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.idcr-icon {
  width: 1.9rem;
  height: 1.9rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.55);
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

.idcr-icon--delete:hover:not(:disabled) {
  color: rgb(252, 165, 165);
  background: rgba(239, 68, 68, 0.12);
}

/* 窄卷容器（手机、平板窄栏）：标题独占一行，状态与操作在下一行 */
@container (max-width: 32rem) {
  .idcr {
    grid-template-columns: auto 1.6rem minmax(0, 1fr) auto;
    grid-template-areas:
      'check number title title'
      '. meta meta actions';
  }
}
</style>
