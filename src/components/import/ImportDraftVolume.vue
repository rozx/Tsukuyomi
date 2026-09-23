<script setup lang="ts">
/** 草稿中的一卷：卷标题、卷的上下移动，以及其中的章节。 */
import { ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportDraft, ImportDraftChapter } from 'src/models/import';
import ImportDraftChapterRow from './ImportDraftChapterRow.vue';
import { useDraftLock } from './import-draft';

const props = defineProps<{
  volume: ImportDraft['volumes'][number];
  chapters: ImportDraftChapter[];
  first: boolean;
  last: boolean;
  firstChapterId: string | undefined;
  lastChapterId: string | undefined;
  volumeOptions: { label: string; value: string }[];
}>();
const emit = defineEmits<{
  moveVolume: [volumeId: string, delta: number];
  moveChapter: [chapterId: string, delta: number];
}>();

const store = useImportWorkspaceStore();
const locked = useDraftLock();

const title = ref(props.volume.title);
watch(
  () => props.volume.title,
  (value) => {
    title.value = value;
  },
);
const commitTitle = () => {
  const value = title.value.trim();
  if (!value || value === props.volume.title) {
    title.value = props.volume.title;
    return;
  }
  void store.editDraft([{ op: 'upsert_volume', id: props.volume.id, title: value }]);
};
const moveChapter = (chapterId: string, delta: number) => emit('moveChapter', chapterId, delta);
</script>

<template>
  <div class="idv">
    <div class="idv-head">
      <InputText
        v-model="title"
        class="idv-title"
        :aria-label="`卷标题：${volume.title}`"
        :disabled="locked"
        @blur="commitTitle"
        @keydown.enter="commitTitle"
      />
      <Tag v-if="volume.inferred" value="推断" severity="secondary" />
      <button
        type="button"
        class="idv-icon"
        aria-label="卷上移"
        :disabled="locked || first"
        @click="emit('moveVolume', volume.id, -1)"
      >
        <i class="pi pi-arrow-up" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="idv-icon"
        aria-label="卷下移"
        :disabled="locked || last"
        @click="emit('moveVolume', volume.id, 1)"
      >
        <i class="pi pi-arrow-down" aria-hidden="true" />
      </button>
    </div>
    <ol class="idv-chapters">
      <ImportDraftChapterRow
        v-for="chapter in chapters"
        :key="chapter.id"
        :chapter="chapter"
        :first="chapter.id === firstChapterId"
        :last="chapter.id === lastChapterId"
        :volume-options="volumeOptions"
        @move="moveChapter"
      />
    </ol>
  </div>
</template>

<style scoped>
.idv {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.idv-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.idv-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.idv-chapters {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.idv-icon {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.6);
}

.idv-icon:disabled {
  opacity: 0.3;
}
</style>
