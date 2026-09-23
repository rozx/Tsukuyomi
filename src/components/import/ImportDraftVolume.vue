<script setup lang="ts">
/** 草稿中的一卷：卷标题、卷的上下移动，以及其中的章节。 */
import { ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Menu from 'primevue/menu';
import type { MenuItem } from 'primevue/menuitem';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import type { ImportDraft, ImportDraftChapter } from 'src/models/import';
import ImportDraftChapterRow from './ImportDraftChapterRow.vue';
import { plainChapter, useDraftLock } from './import-draft';

const props = defineProps<{
  volume: ImportDraft['volumes'][number];
  index: number;
  chapters: ImportDraftChapter[];
  first: boolean;
  last: boolean;
  firstChapterId: string | undefined;
  lastChapterId: string | undefined;
  volumeOptions: { label: string; value: string }[];
  chapterNumbers: Record<string, number>;
}>();
const emit = defineEmits<{
  moveVolume: [volumeId: string, delta: number];
  moveChapter: [chapterId: string, delta: number];
}>();

const store = useImportWorkspaceStore();
const ctx = injectImportPage();
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

// 章节「移到其他卷」共用一个弹出菜单，菜单项按当前章节生成
const volumeMenu = ref<InstanceType<typeof Menu> | null>(null);
const volumeMenuItems = ref<MenuItem[]>([]);
const openVolumeMenu = (event: MouseEvent, chapter: ImportDraftChapter) => {
  volumeMenuItems.value = props.volumeOptions
    .filter((option) => option.value !== chapter.volumeId)
    .map((option) => ({
      label: option.label,
      icon: 'pi pi-folder',
      command: () =>
        void store.editDraft([
          {
            op: 'upsert_chapter',
            chapter: { ...plainChapter(chapter), volumeId: option.value, inferredStructure: false },
          },
        ]),
    }));
  volumeMenu.value?.toggle(event);
};
</script>

<template>
  <div class="idv">
    <div class="idv-head">
      <span class="idv-index" aria-hidden="true">卷 {{ index + 1 }}</span>
      <InputText
        v-model="title"
        class="idv-title"
        :aria-label="`卷标题：${volume.title}`"
        :disabled="locked"
        @blur="commitTitle"
        @keydown.enter="commitTitle"
      />
      <span v-if="volume.inferred" class="idv-badge" title="卷结构由月詠推断">推断</span>
      <span class="idv-count">{{ chapters.length }} 章</span>
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
      <button
        type="button"
        class="idv-icon idv-icon--delete"
        :aria-label="`删除草稿卷 ${volume.title}`"
        title="删除整卷及其章节"
        :disabled="locked"
        @click="ctx.requestDraftRemoval({ op: 'remove_volume', volumeId: volume.id })"
      >
        <i class="pi pi-trash" aria-hidden="true" />
      </button>
    </div>
    <ol v-if="chapters.length" class="idv-chapters">
      <ImportDraftChapterRow
        v-for="chapter in chapters"
        :key="chapter.id"
        :chapter="chapter"
        :number="chapterNumbers[chapter.id] ?? 0"
        :first="chapter.id === firstChapterId"
        :last="chapter.id === lastChapterId"
        :volume-count="volumeOptions.length"
        @move="moveChapter"
        @volume-menu="openVolumeMenu"
      />
    </ol>
    <p v-else class="idv-empty">这一卷还没有章节。</p>
    <Menu ref="volumeMenu" :model="volumeMenuItems" popup>
      <template #start><div class="idv-menu-title">移到</div></template>
    </Menu>
  </div>
</template>

<style scoped>
.idv {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.idv-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.idv-index {
  flex-shrink: 0;
  padding: 0.1rem 0.45rem;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 600;
  color: rgb(199, 210, 254);
  background: rgba(99, 102, 241, 0.18);
}

.idv-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.idv-title:not(:hover):not(:focus) {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.idv-badge {
  white-space: nowrap;
  flex-shrink: 0;
  padding: 0 0.4rem;
  border-radius: 6px;
  font-size: 0.66rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.65);
  background: rgba(255, 255, 255, 0.07);
}

.idv-count {
  flex-shrink: 0;
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.5);
}

.idv-chapters {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  display: flex;
  flex-direction: column;
}

.idv-empty {
  margin: 0;
  padding: 0.75rem;
  font-size: 0.75rem;
  color: rgba(226, 232, 240, 0.5);
}

.idv-icon {
  flex-shrink: 0;
  width: 1.9rem;
  height: 1.9rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.6);
}

.idv-icon:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.idv-icon:disabled {
  opacity: 0.3;
}

.idv-icon--delete:hover:not(:disabled) {
  color: rgb(252, 165, 165);
  background: rgba(239, 68, 68, 0.12);
}

/* 窄卷容器：省略章数，给卷标题留出空间 */
@container (max-width: 24rem) {
  .idv-count {
    display: none;
  }
}

.idv-menu-title {
  padding: 0.35rem 0.75rem 0.15rem;
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.5);
}
</style>
