<script setup lang="ts">
/** 书名、作者、简介与导入目标（新建或更新书库中的小说）；月詠的目标建议需用户采用。 */
import { computed, reactive, watch } from 'vue';
import Button from 'primevue/button';
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
watch(
  () => draft.value?.metadata,
  (metadata) => {
    values.title = metadata?.title?.value ?? '';
    values.author = metadata?.author?.value ?? '';
    values.description = metadata?.description?.value ?? '';
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
    <div v-if="suggestion" class="idm-note">
      月詠建议：{{ suggestion.label }}
      <Button
        label="采用"
        size="small"
        text
        :disabled="locked"
        @click="propose(suggestion.bookId)"
      />
    </div>
  </div>
</template>

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
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.6);
}
</style>
