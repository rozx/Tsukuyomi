<script setup lang="ts">
/**
 * 草稿直接编辑：书名等元信息、导入目标、卷章标题／顺序／归属与导入选择。
 * 所有修改都经 ImportDraftService 的具名操作提交到同一草稿，月詠随后读取即可看到；
 * 基于旧版本的修改会被拒绝并重新载入，不会覆盖较新的内容。
 */
import { computed, reactive, watch } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useBooksStore } from 'src/stores/books';
import type { ImportDraft, ImportDraftChapter, ImportDraftOperation } from 'src/models/import';
import { CHAPTER_STATUS, METADATA_FIELDS } from './import-labels';

const ctx = injectImportPage();
const store = ctx.store;
const booksStore = useBooksStore();

const draft = computed<ImportDraft | undefined>(() => store.task?.draft);
const locked = computed(() => store.isRunning || Boolean(draft.value?.novelScope.needsChoice));

// 标题输入缓冲：失焦或回车才提交，避免每个按键都写一次草稿
const titles = reactive<Record<string, string>>({});
const metadata = reactive({ title: '', author: '', description: '' });
watch(
  draft,
  (value) => {
    for (const key of Object.keys(titles)) delete titles[key];
    for (const volume of value?.volumes ?? []) titles[`v:${volume.id}`] = volume.title;
    for (const chapter of value?.chapters ?? []) titles[`c:${chapter.id}`] = chapter.title;
    metadata.title = value?.metadata.title?.value ?? '';
    metadata.author = value?.metadata.author?.value ?? '';
    metadata.description = value?.metadata.description?.value ?? '';
  },
  { immediate: true },
);

const edit = (operations: ImportDraftOperation[]) => void store.editDraft(operations);

const plainChapter = (chapter: ImportDraftChapter): Omit<ImportDraftChapter, 'match'> => {
  const { match: _match, ...plain } = chapter;
  return plain;
};

const commitMetadata = (field: 'title' | 'author' | 'description') => {
  const value = metadata[field].trim();
  if (value === (draft.value?.metadata[field]?.value ?? '')) return;
  if (field === 'title' && !value) {
    metadata.title = draft.value?.metadata.title?.value ?? '';
    return;
  }
  edit([{ op: 'set_metadata', field, value }]);
};

const commitVolume = (volumeId: string) => {
  const volume = draft.value?.volumes.find((entry) => entry.id === volumeId);
  const title = titles[`v:${volumeId}`]?.trim() ?? '';
  if (!volume || !title || title === volume.title) return;
  edit([{ op: 'upsert_volume', id: volumeId, title }]);
};

const commitChapter = (chapter: ImportDraftChapter) => {
  const title = titles[`c:${chapter.id}`]?.trim() ?? '';
  if (!title || title === chapter.title) {
    titles[`c:${chapter.id}`] = chapter.title;
    return;
  }
  edit([
    { op: 'upsert_chapter', chapter: { ...plainChapter(chapter), title, inferredTitle: false } },
  ]);
};

const toggleSelected = (chapter: ImportDraftChapter, selected: boolean) =>
  edit([{ op: 'upsert_chapter', chapter: { ...plainChapter(chapter), selected } }]);

const moveChapterToVolume = (chapter: ImportDraftChapter, volumeId: string) => {
  if (volumeId !== chapter.volumeId)
    edit([
      {
        op: 'upsert_chapter',
        chapter: { ...plainChapter(chapter), volumeId, inferredStructure: false },
      },
    ]);
};

const moveChapter = (chapterId: string, delta: number) => {
  const ids = draft.value?.chapters.map((chapter) => chapter.id) ?? [];
  const index = ids.indexOf(chapterId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  edit([{ op: 'reorder_chapters', chapterIds: ids }]);
};

const moveVolume = (volumeId: string, delta: number) => {
  const ids = draft.value?.volumes.map((volume) => volume.id) ?? [];
  const index = ids.indexOf(volumeId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  edit([{ op: 'reorder_volumes', volumeIds: ids }]);
};

const addVolume = () =>
  edit([{ op: 'upsert_volume', title: `新卷 ${(draft.value?.volumes.length ?? 0) + 1}` }]);

const volumes = computed(() =>
  (draft.value?.volumes ?? []).map((volume) => ({
    volume,
    chapters: (draft.value?.chapters ?? []).filter((chapter) => chapter.volumeId === volume.id),
  })),
);
const orphanChapters = computed(() => {
  const ids = new Set((draft.value?.volumes ?? []).map((volume) => volume.id));
  return (draft.value?.chapters ?? []).filter((chapter) => !ids.has(chapter.volumeId));
});
const volumeOptions = computed(() =>
  (draft.value?.volumes ?? []).map((volume) => ({ label: volume.title, value: volume.id })),
);
const chapterIndex = (chapterId: string) =>
  draft.value?.chapters.findIndex((chapter) => chapter.id === chapterId) ?? -1;

// 导入目标：新建或更新书库中已有的小说；月詠的建议需要用户采用
const bookOptions = computed(() => [
  { label: '新建小说', value: '__new__' },
  ...booksStore.books.map((book) => ({ label: book.title, value: book.id })),
]);
const targetValue = computed(() =>
  draft.value?.target.kind === 'existing' ? draft.value.target.bookId : '__new__',
);
const setTarget = (value: string) => {
  if (value === targetValue.value) return;
  edit([{ op: 'propose_target', bookId: value === '__new__' ? null : value }]);
};
const suggestion = computed(() => {
  const suggested = draft.value?.targetSuggestion;
  if (
    !suggested ||
    suggested.bookId ===
      (draft.value?.target.kind === 'existing' ? draft.value.target.bookId : null)
  )
    return undefined;
  const title = suggested.bookId ? booksStore.getBookById(suggested.bookId)?.title : undefined;
  return {
    bookId: suggested.bookId,
    label: suggested.bookId ? `更新《${title ?? suggested.bookId}》` : '新建小说',
  };
});

const candidates = computed(() => draft.value?.metadataCandidates ?? []);
const selectedChapterClass = (chapterId: string) => ({
  'idp-chapter--selected': ctx.selectedChapterId.value === chapterId,
});
</script>

<template>
  <section v-if="draft" class="idp" aria-label="导入草稿">
    <p v-if="draft.novelScope.needsChoice" class="idp-note idp-note--warn">
      检测到多个作品或来源归属变化，请先在月詠对话中选择本次导入的小说，之后才能编辑卷章。
    </p>

    <div class="idp-meta">
      <label class="idp-field">
        <span>{{ METADATA_FIELDS.title }}</span>
        <InputText
          v-model="metadata.title"
          :disabled="locked"
          @blur="commitMetadata('title')"
          @keydown.enter="commitMetadata('title')"
        />
      </label>
      <label class="idp-field">
        <span>{{ METADATA_FIELDS.author }}</span>
        <InputText
          v-model="metadata.author"
          :disabled="locked"
          @blur="commitMetadata('author')"
          @keydown.enter="commitMetadata('author')"
        />
      </label>
      <label class="idp-field idp-field--wide">
        <span>{{ METADATA_FIELDS.description }}</span>
        <Textarea
          v-model="metadata.description"
          :disabled="locked"
          auto-resize
          rows="2"
          @blur="commitMetadata('description')"
        />
      </label>
      <label class="idp-field idp-field--wide">
        <span>导入到</span>
        <Select
          :model-value="targetValue"
          :options="bookOptions"
          option-label="label"
          option-value="value"
          filter
          :disabled="locked"
          @update:model-value="setTarget"
        />
      </label>
      <div v-if="suggestion" class="idp-note">
        月詠建议：{{ suggestion.label }}
        <Button
          label="采用"
          size="small"
          text
          :disabled="locked"
          @click="edit([{ op: 'propose_target', bookId: suggestion.bookId }])"
        />
      </div>
    </div>

    <div v-if="candidates.length" class="idp-candidates">
      <div class="idp-subtitle">元信息候选（需采用后才会写入）</div>
      <div v-for="candidate in candidates" :key="candidate.id" class="idp-candidate">
        <span class="idp-candidate-field">{{ METADATA_FIELDS[candidate.field] }}</span>
        <span class="idp-candidate-value">{{ candidate.value.value }}</span>
        <Tag v-if="candidate.conflicts?.length" value="有冲突" severity="warn" />
        <Tag v-if="candidate.value.adopted" value="已采用" severity="success" />
        <Button
          v-else
          label="采用"
          size="small"
          text
          :disabled="locked"
          @click="store.adoptMetadata(candidate.id)"
        />
      </div>
    </div>

    <div class="idp-structure">
      <div class="idp-structure-head">
        <span class="idp-subtitle">卷章（{{ draft.chapters.length }} 章）</span>
        <Button
          icon="pi pi-plus"
          label="新卷"
          size="small"
          text
          :disabled="locked"
          @click="addVolume"
        />
      </div>

      <p v-if="!draft.chapters.length && !draft.volumes.length" class="idp-note">
        草稿还没有卷章。提供来源后，让月詠检查并整理，或在对话中说明希望的分卷方式。
      </p>

      <div v-for="({ volume, chapters }, vIndex) in volumes" :key="volume.id" class="idp-volume">
        <div class="idp-volume-head">
          <InputText
            v-model="titles[`v:${volume.id}`]"
            class="idp-volume-title"
            :aria-label="`卷标题：${volume.title}`"
            :disabled="locked"
            @blur="commitVolume(volume.id)"
            @keydown.enter="commitVolume(volume.id)"
          />
          <Tag v-if="volume.inferred" value="推断" severity="secondary" />
          <button
            type="button"
            class="idp-icon"
            aria-label="卷上移"
            :disabled="locked || vIndex === 0"
            @click="moveVolume(volume.id, -1)"
          >
            <i class="pi pi-arrow-up" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="idp-icon"
            aria-label="卷下移"
            :disabled="locked || vIndex === volumes.length - 1"
            @click="moveVolume(volume.id, 1)"
          >
            <i class="pi pi-arrow-down" aria-hidden="true" />
          </button>
        </div>

        <ol class="idp-chapters">
          <li
            v-for="chapter in chapters"
            :key="chapter.id"
            class="idp-chapter"
            :class="selectedChapterClass(chapter.id)"
          >
            <Checkbox
              :model-value="chapter.selected"
              binary
              :disabled="locked"
              :aria-label="`导入 ${chapter.title}`"
              @update:model-value="(value: boolean) => toggleSelected(chapter, value)"
            />
            <InputText
              v-model="titles[`c:${chapter.id}`]"
              class="idp-chapter-title"
              :aria-label="`章节标题：${chapter.title}`"
              :disabled="locked"
              @blur="commitChapter(chapter)"
              @keydown.enter="commitChapter(chapter)"
            />
            <span class="idp-chapter-tags">
              <Tag v-if="chapter.inferredTitle" value="推断标题" severity="secondary" />
              <Tag
                :value="CHAPTER_STATUS[chapter.status].label"
                :severity="CHAPTER_STATUS[chapter.status].severity"
              />
            </span>
            <span class="idp-chapter-actions">
              <Select
                v-if="volumeOptions.length > 1"
                :model-value="chapter.volumeId"
                :options="volumeOptions"
                option-label="label"
                option-value="value"
                size="small"
                class="idp-volume-select"
                :aria-label="`${chapter.title} 所属卷`"
                :disabled="locked"
                @update:model-value="(value: string) => moveChapterToVolume(chapter, value)"
              />
              <button
                type="button"
                class="idp-icon"
                aria-label="章节上移"
                :disabled="locked || chapterIndex(chapter.id) === 0"
                @click="moveChapter(chapter.id, -1)"
              >
                <i class="pi pi-arrow-up" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="idp-icon"
                aria-label="章节下移"
                :disabled="locked || chapterIndex(chapter.id) === draft.chapters.length - 1"
                @click="moveChapter(chapter.id, 1)"
              >
                <i class="pi pi-arrow-down" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="idp-icon idp-icon--preview"
                :aria-label="`查看 ${chapter.title} 的正文`"
                @click="ctx.selectChapter(chapter.id)"
              >
                <i class="pi pi-eye" aria-hidden="true" />
              </button>
            </span>
          </li>
        </ol>
      </div>

      <p v-if="orphanChapters.length" class="idp-note idp-note--warn">
        有 {{ orphanChapters.length }} 章尚未归属任何卷，请让月詠整理或新建卷后移动。
      </p>
    </div>
  </section>
</template>

<style scoped>
.idp {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.idp-note {
  font-size: 0.78rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.6);
  margin: 0;
}

.idp-note--warn {
  color: rgb(253, 224, 71);
}

.idp-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.6rem 0.8rem;
}

.idp-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.6);
  min-width: 0;
}

.idp-field--wide {
  grid-column: 1 / -1;
}

.idp-subtitle {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.75);
}

.idp-candidates {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.idp-candidate {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.idp-candidate-field {
  color: rgba(226, 232, 240, 0.55);
  min-width: 2.5rem;
}

.idp-candidate-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.idp-structure {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.idp-structure-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.idp-volume {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.idp-volume-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.idp-volume-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.idp-chapters {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.idp-chapter {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.4rem;
  border-radius: 10px;
  flex-wrap: wrap;
}

.idp-chapter--selected {
  background: rgba(99, 102, 241, 0.12);
}

.idp-chapter-title {
  flex: 1 1 10rem;
  min-width: 0;
}

.idp-chapter-tags {
  display: flex;
  gap: 0.25rem;
}

.idp-chapter-tags :deep(.p-tag) {
  font-size: 0.62rem;
  padding: 0.1rem 0.35rem;
}

.idp-chapter-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.idp-volume-select {
  max-width: 9rem;
}

.idp-icon {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.6);
}

.idp-icon:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(226, 232, 240, 0.95);
}

.idp-icon:disabled {
  opacity: 0.3;
}

.idp-icon--preview {
  color: rgb(165, 180, 252);
}
</style>
