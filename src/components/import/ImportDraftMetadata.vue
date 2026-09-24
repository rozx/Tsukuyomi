<script setup lang="ts">
/** 书名、作者、简介、标签与导入目标（新建或更新书库中的小说）；月詠的目标建议需用户采用。 */
import { computed, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputChips from 'primevue/inputchips';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useBooksStore } from 'src/stores/books';
import { METADATA_FIELDS } from './import-labels';
import { useDraftLock } from './import-draft';

type TextField = 'title' | 'author' | 'description';
const NEW_BOOK = '__new__';

const store = useImportWorkspaceStore();
const booksStore = useBooksStore();
const locked = useDraftLock();

const draft = computed(() => store.task?.draft);
const values = reactive<Record<TextField, string>>({ title: '', author: '', description: '' });
const tags = ref<string[]>([]);
const splitLines = (value: string | undefined) =>
  (value ?? '')
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean);
watch(
  () => draft.value?.metadata,
  (metadata) => {
    values.title = metadata?.title?.value ?? '';
    values.author = metadata?.author?.value ?? '';
    values.description = metadata?.description?.value ?? '';
    tags.value = splitLines(metadata?.tags?.value);
  },
  { immediate: true },
);

const commit = (field: TextField) => {
  const current = draft.value?.metadata[field]?.value ?? '';
  const value = values[field].trim();
  if (value === current) return;
  // 书名不能清空，恢复为原值
  if (field === 'title' && !value) {
    values.title = current;
    return;
  }
  void store.editDraft([{ op: 'set_metadata', field, value }]);
};

// 标签按行存储，与别名一致
const commitTags = (next: string[]) => {
  const value = [...new Set(next.map((text) => text.trim()).filter(Boolean))].join('\n');
  tags.value = splitLines(value);
  if (value === splitLines(draft.value?.metadata.tags?.value).join('\n')) return;
  void store.editDraft([{ op: 'set_metadata', field: 'tags', value }]);
};

const targetBookId = computed(() =>
  draft.value?.target.kind === 'existing' ? draft.value.target.bookId : null,
);
const bookOptions = computed(() => [
  { label: '新建小说', value: NEW_BOOK },
  ...booksStore.books.map((book) => ({ label: book.title, value: book.id })),
]);
const targetValue = computed(() => targetBookId.value ?? NEW_BOOK);
const propose = (bookId: string | null) => void store.editDraft([{ op: 'propose_target', bookId }]);
const setTarget = (value: string) => {
  if (value !== targetValue.value) propose(value === NEW_BOOK ? null : value);
};

const suggestion = computed(() => {
  const suggested = draft.value?.targetSuggestion;
  if (!suggested || suggested.bookId === targetBookId.value) return undefined;
  if (!suggested.bookId) return { bookId: null, label: '新建小说' };
  const title = booksStore.getBookById(suggested.bookId)?.title ?? suggested.bookId;
  return { bookId: suggested.bookId, label: `更新《${title}》` };
});
</script>

<template>
  <div class="idm">
    <label class="idm-field">
      <span>{{ METADATA_FIELDS.title }}</span>
      <InputText
        v-model="values.title"
        :disabled="locked"
        @blur="commit('title')"
        @keydown.enter="commit('title')"
      />
    </label>
    <label class="idm-field">
      <span>{{ METADATA_FIELDS.author }}</span>
      <InputText
        v-model="values.author"
        :disabled="locked"
        @blur="commit('author')"
        @keydown.enter="commit('author')"
      />
    </label>
    <label class="idm-field idm-field--wide">
      <span>{{ METADATA_FIELDS.description }}</span>
      <Textarea
        v-model="values.description"
        :disabled="locked"
        auto-resize
        rows="2"
        @blur="commit('description')"
      />
    </label>
    <label class="idm-field idm-field--wide">
      <span>{{ METADATA_FIELDS.tags }}</span>
      <InputChips
        :model-value="tags"
        separator=","
        add-on-blur
        placeholder="输入标签后按回车"
        :disabled="locked"
        @update:model-value="commitTags"
      />
    </label>
    <label class="idm-field idm-field--wide">
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
    <div v-if="suggestion" class="ipl-banner ipl-banner--info idm-note">
      <i class="pi pi-lightbulb" aria-hidden="true" />
      <span class="idm-note-text">月詠建议：{{ suggestion.label }}</span>
      <Button
        label="采用建议"
        size="small"
        outlined
        :disabled="locked"
        @click="propose(suggestion.bookId)"
      />
    </div>
  </div>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.idm {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.6rem 0.8rem;
}

.idm-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.6);
  min-width: 0;
}

.idm-field--wide,
.idm-note {
  grid-column: 1 / -1;
}

.idm-note {
  align-items: center;
}

.idm-note-text {
  flex: 1;
  min-width: 0;
}
</style>
