<script setup lang="ts">
/**
 * 新建书籍信息：目录页解析到的封面、书名、作者、标签与简介，应用后按此创建书籍。
 * 只在新建流程中显示；简介较长时默认折叠。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { newBook } = injectBookSync();
const { t } = useI18n();

/** 超过该长度或行数的简介默认折叠 */
const COLLAPSE_CHARS = 160;
const COLLAPSE_LINES = 4;

const expanded = ref(false);
const coverFailed = ref(false);

const coverUrl = computed(() => (coverFailed.value ? '' : (newBook.value?.cover?.url ?? '')));
/** 连续空行压成一个，避免简介中间出现大段空白 */
const description = computed(() =>
  (newBook.value?.description ?? '').trim().replace(/\n{3,}/g, '\n\n'),
);
const longDescription = computed(
  () =>
    description.value.length > COLLAPSE_CHARS ||
    description.value.split('\n').length > COLLAPSE_LINES,
);

watch(
  () => newBook.value,
  () => {
    expanded.value = false;
    coverFailed.value = false;
  },
);
</script>

<template>
  <section
    v-if="newBook"
    class="ipl-card nbi"
    data-testid="bsw-book-info"
    :aria-label="t('bookUi.sync.newBookInfo')"
  >
    <img
      v-if="coverUrl"
      :src="coverUrl"
      :alt="t('bookUi.sync.newBookCover', { title: newBook.title })"
      class="nbi-cover"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="coverFailed = true"
    />
    <div v-else class="nbi-cover nbi-cover--empty" data-testid="bsw-book-cover-placeholder">
      <i class="pi pi-book" aria-hidden="true" />
    </div>
    <div class="nbi-body">
      <h3 class="nbi-title">{{ newBook.title }}</h3>
      <p v-if="newBook.author" class="nbi-author">
        {{ t('bookUi.sync.newBookAuthor', { author: newBook.author }) }}
      </p>
      <ul v-if="newBook.tags?.length" class="nbi-tags">
        <li v-for="tag in newBook.tags" :key="tag" class="nbi-tag">{{ tag }}</li>
      </ul>
      <template v-if="description">
        <p class="nbi-desc" :class="{ 'nbi-desc--clamped': longDescription && !expanded }">
          {{ description }}
        </p>
        <button
          v-if="longDescription"
          type="button"
          class="nbi-toggle"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('bookUi.sync.collapseDescription') : t('bookUi.sync.expandDescription') }}
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped>
.nbi {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.nbi-cover {
  flex-shrink: 0;
  width: 6.5rem;
  aspect-ratio: 3 / 4;
  border-radius: 0.5rem;
  object-fit: cover;
  background: rgba(148, 163, 184, 0.12);
}

.nbi-cover--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(226, 232, 240, 0.35);
  font-size: 1.6rem;
}

.nbi-body {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.nbi-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.4;
  color: rgba(247, 244, 236, 0.95);
  overflow-wrap: anywhere;
}

.nbi-author {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(226, 232, 240, 0.65);
}

.nbi-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.nbi-tag {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  color: rgb(199, 210, 254);
  background: rgba(129, 140, 248, 0.14);
}

.nbi-desc {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.78);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.nbi-desc--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.nbi-toggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  font-size: 0.78rem;
  color: rgb(165, 180, 252);
  cursor: pointer;
}

.nbi-toggle:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  .nbi-cover {
    width: 4.75rem;
  }
}
</style>
