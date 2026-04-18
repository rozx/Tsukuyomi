<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import { injectBooksPage } from 'src/composables/books-page/useBooksPage';
import { getVolumeDisplayTitle, getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { Novel } from 'src/models/novel';

const ctx = injectBooksPage();

// 本地 UI 状态：当前选中的书（主从布局右侧详情）。不写入任何 store。
const selectedBookId = ref<string | null>(null);

const selectedBook = computed<Novel | null>(() => {
  const list = ctx.filteredBooks.value;
  if (list.length === 0) return null;
  const match = list.find((b) => b.id === selectedBookId.value);
  return match ?? list[0] ?? null;
});

// 列表变化时，确保选中项仍然在列表中；否则落到第一本。
watch(
  () => ctx.filteredBooks.value,
  (list) => {
    if (list.length === 0) {
      selectedBookId.value = null;
      return;
    }
    if (!list.find((b) => b.id === selectedBookId.value)) {
      selectedBookId.value = list[0]!.id;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="tablet-library w-full h-full flex min-h-0">
    <!-- 左侧书籍列表 -->
    <aside class="tl-list">
      <header class="tl-list-head">
        <div class="tl-eyebrow">LIBRARY</div>
        <h1 class="tl-title">书库</h1>
        <div class="tl-meta">
          {{ ctx.booksStore.books.length }} 本
          <template v-if="ctx.booksStore.books.filter((b) => b.starred).length > 0">
            · {{ ctx.booksStore.books.filter((b) => b.starred).length }} 本收藏
          </template>
        </div>
        <div class="tl-toolbar">
          <div class="tl-input-wrap">
            <i class="pi pi-search" aria-hidden="true" />
            <input
              v-model="ctx.searchQuery.value"
              class="tl-input"
              placeholder="搜索书名、作者…"
            />
            <button
              v-if="ctx.searchQuery.value"
              class="tl-input-clear"
              aria-label="清除搜索"
              @click="ctx.searchQuery.value = ''"
            >
              <i class="pi pi-times" />
            </button>
          </div>
          <button class="tl-icon-btn" title="添加书籍" @click="ctx.addBook">
            <i class="pi pi-plus" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        v-if="ctx.booksStore.isLoading || !ctx.booksStore.isLoaded"
        class="tl-state"
      >
        <ProgressSpinner
          style="width: 28px; height: 28px"
          stroke-width="4"
          animation-duration=".8s"
          aria-label="加载中"
        />
        <span>正在加载…</span>
      </div>

      <div v-else-if="ctx.filteredBooks.value.length === 0" class="tl-state">
        <i class="pi pi-book tl-state-icon" aria-hidden="true" />
        <span>
          {{ ctx.searchQuery.value ? '未找到匹配的书籍' : '暂无书籍' }}
        </span>
      </div>

      <div v-else class="tl-list-scroll">
        <button
          v-for="book in ctx.filteredBooks.value"
          :key="book.id"
          type="button"
          class="tl-list-row"
          :class="{ 'tl-list-row--active': book.id === selectedBook?.id }"
          @click="selectedBookId = book.id"
          @dblclick="ctx.navigateToBookDetails(book)"
        >
          <div class="tl-list-cover">
            <img :src="ctx.getCoverUrl(book)" :alt="book.title" loading="lazy" />
          </div>
          <div class="tl-list-body">
            <div class="tl-list-title">{{ book.title }}</div>
            <div class="tl-list-author">{{ book.author || '未知作者' }}</div>
            <div class="tl-list-meta">
              <span v-if="ctx.isLoadingCharCount(book)">
                <Skeleton width="42px" height="10px" />
              </span>
              <span v-else>{{ ctx.formatWordCount(ctx.getTotalWords(book)) }} 字</span>
              <span class="tl-dot">·</span>
              <span>{{ ctx.getTotalChapters(book) }} 章</span>
            </div>
          </div>
          <i
            v-if="book.starred"
            class="pi pi-star-fill tl-list-star"
            aria-hidden="true"
          />
        </button>
      </div>
    </aside>

    <!-- 右侧详情 -->
    <section class="tl-detail">
      <div v-if="!selectedBook" class="tl-detail-empty">
        <i class="pi pi-book" aria-hidden="true" />
        <div class="tl-detail-empty-title">选择一本书查看详情</div>
        <div class="tl-detail-empty-sub">或从左上角添加新书</div>
      </div>
      <div v-else class="tl-detail-scroll">
        <!-- Hero -->
        <header class="tl-hero">
          <div class="tl-hero-cover">
            <img :src="ctx.getCoverUrl(selectedBook)" :alt="selectedBook.title" loading="lazy" />
            <i
              v-if="selectedBook.starred"
              class="pi pi-star-fill tl-hero-star"
              aria-hidden="true"
            />
          </div>
          <div class="tl-hero-body">
            <div class="tl-hero-eyebrow">
              {{ selectedBook.author || '未知作者' }}
              <template v-if="selectedBook.tags && selectedBook.tags.length > 0">
                · {{ selectedBook.tags.slice(0, 2).join(' · ') }}
              </template>
            </div>
            <h2 class="tl-hero-title">{{ selectedBook.title }}</h2>
            <div
              v-if="selectedBook.alternateTitles && selectedBook.alternateTitles.length > 0"
              class="tl-hero-alt"
            >
              《{{ selectedBook.alternateTitles[0] }}》
            </div>

            <div class="tl-hero-badges">
              <span class="tl-badge tl-badge--blue">
                <i class="pi pi-sparkles" /> {{ selectedBook.tags?.[0] || '小说' }}
              </span>
              <span class="tl-badge">{{ ctx.getTotalChapters(selectedBook) }} 章</span>
              <span v-if="selectedBook.starred" class="tl-badge tl-badge--star">
                <i class="pi pi-star-fill" /> 收藏
              </span>
            </div>

            <div class="tl-hero-actions">
              <Button
                label="继续翻译"
                icon="pi pi-play"
                class="p-button-primary"
                @click="ctx.navigateToBookDetails(selectedBook)"
              />
              <Button
                label="编辑元数据"
                icon="pi pi-pencil"
                class="p-button-outlined"
                @click="ctx.editBook(selectedBook)"
              />
              <Button
                :icon="selectedBook.starred ? 'pi pi-star-fill' : 'pi pi-star'"
                :class="[
                  'p-button-outlined',
                  selectedBook.starred ? '!text-yellow-400' : '',
                ]"
                :title="selectedBook.starred ? '取消收藏' : '收藏'"
                @click="ctx.toggleStar(selectedBook)"
              />
              <Button
                icon="pi pi-trash"
                class="p-button-outlined p-button-danger"
                title="删除"
                @click="ctx.deleteBook(selectedBook)"
              />
            </div>
          </div>
        </header>

        <!-- 统计条 -->
        <div class="tl-stats">
          <div class="tl-stat">
            <div class="tl-stat-value">{{ selectedBook.volumes?.length ?? 0 }}</div>
            <div class="tl-stat-label">卷数</div>
          </div>
          <div class="tl-stat">
            <div class="tl-stat-value">{{ ctx.getTotalChapters(selectedBook) }}</div>
            <div class="tl-stat-label">章节</div>
          </div>
          <div class="tl-stat">
            <div class="tl-stat-value">
              <template v-if="ctx.isLoadingCharCount(selectedBook)">
                <Skeleton width="48px" height="16px" />
              </template>
              <template v-else>
                {{ ctx.formatWordCount(ctx.getTotalWords(selectedBook)) }}
              </template>
            </div>
            <div class="tl-stat-label">字数</div>
          </div>
          <div class="tl-stat">
            <div class="tl-stat-value">{{ ctx.formatDate(selectedBook.lastEdited) }}</div>
            <div class="tl-stat-label">上次编辑</div>
          </div>
          <div class="tl-stat tl-stat--last">
            <div class="tl-stat-value">{{ selectedBook.tags?.length ?? 0 }}</div>
            <div class="tl-stat-label">标签</div>
          </div>
        </div>

        <!-- 章节树双列预览 -->
        <section class="tl-chapters">
          <header class="tl-chapters-head">
            <span>章节 · {{ ctx.getTotalChapters(selectedBook) }}</span>
          </header>
          <div v-if="selectedBook.volumes && selectedBook.volumes.length > 0" class="tl-chapters-grid">
            <div
              v-for="(volume, vi) in selectedBook.volumes.slice(0, 4)"
              :key="volume.id ?? vi"
              class="tl-volume"
            >
              <div class="tl-volume-head">
                <i class="pi pi-folder-open" aria-hidden="true" />
                <span class="tl-volume-name">{{ getVolumeDisplayTitle(volume) || `卷 ${vi + 1}` }}</span>
                <span class="tl-volume-count">{{ volume.chapters?.length ?? 0 }} 章</span>
              </div>
              <ul class="tl-chapter-list">
                <li
                  v-for="(chapter, ci) in volume.chapters?.slice(0, 5) ?? []"
                  :key="chapter.id ?? ci"
                  class="tl-chapter-item"
                >
                  <i class="pi pi-circle-off tl-chapter-icon" aria-hidden="true" />
                  <span class="tl-chapter-title">{{ getChapterDisplayTitle(chapter, selectedBook) || `第 ${ci + 1} 章` }}</span>
                </li>
                <li
                  v-if="(volume.chapters?.length ?? 0) > 5"
                  class="tl-chapter-more"
                >
                  还有 {{ (volume.chapters!.length ?? 0) - 5 }} 章…
                </li>
              </ul>
            </div>
          </div>
          <div v-else class="tl-chapters-empty">
            <i class="pi pi-book" aria-hidden="true" /> 暂无章节
          </div>
        </section>

        <p v-if="selectedBook.description" class="tl-desc">
          {{ selectedBook.description }}
        </p>
      </div>
    </section>

    <!-- 隐藏的文件输入（JSON 导入）—— 桌面与手机都在自己模板里挂一份 -->
    <input
      :ref="(el) => { ctx.fileInputRef.value = el as HTMLInputElement | null; }"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="ctx.handleFileSelect"
    />
  </div>
</template>

<style scoped>
.tablet-library {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

/* 左侧列表 */
.tl-list {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tl-list-head {
  padding: 20px 20px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.tl-eyebrow {
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.22em;
  color: rgba(174, 183, 198, 0.75);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.tl-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 24px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.015em;
  margin: 0;
  line-height: 1.15;
}

.tl-meta {
  font-size: 11px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 6px;
}

.tl-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.tl-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.tl-input-wrap > i {
  position: absolute;
  left: 10px;
  color: rgba(247, 244, 236, 0.55);
  font-size: 12px;
  pointer-events: none;
}

.tl-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 7px 30px 7px 30px;
  color: rgba(247, 244, 236, 1);
  font-family: inherit;
  font-size: 12px;
  outline: none;
}

.tl-input:focus {
  border-color: #a3b7cf;
  box-shadow: 0 0 0 2px rgba(163, 183, 207, 0.2);
}

.tl-input-clear {
  position: absolute;
  right: 6px;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: rgba(247, 244, 236, 0.55);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-input-clear i {
  font-size: 10px;
}

.tl-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(247, 244, 236, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.tl-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(247, 244, 236, 1);
}

.tl-icon-btn i {
  font-size: 12px;
}

.tl-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 0;
}

.tl-list-row {
  width: 100%;
  padding: 10px 18px;
  display: flex;
  gap: 12px;
  align-items: center;
  border: none;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 3px solid transparent;
}

.tl-list-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.tl-list-row--active {
  background: rgba(109, 136, 168, 0.1);
  border-left-color: #a3b7cf;
}

.tl-list-cover {
  width: 40px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #14161a;
}

.tl-list-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tl-list-body {
  flex: 1;
  min-width: 0;
}

.tl-list-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-list-author {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-list-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
  margin-top: 4px;
}

.tl-list-star {
  color: #f2c037;
  font-size: 10px;
  flex-shrink: 0;
}

.tl-dot {
  opacity: 0.5;
}

.tl-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 16px;
  text-align: center;
  color: rgba(247, 244, 236, 0.6);
  font-size: 12px;
}

.tl-state-icon {
  font-size: 32px;
  color: rgba(247, 244, 236, 0.2);
}

/* 右侧详情 */
.tl-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tl-detail-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 36px 36px;
}

.tl-detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(247, 244, 236, 0.5);
}

.tl-detail-empty i {
  font-size: 42px;
  color: rgba(247, 244, 236, 0.2);
}

.tl-detail-empty-title {
  font-size: 15px;
  color: rgba(247, 244, 236, 0.75);
  font-weight: 500;
}

.tl-detail-empty-sub {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.45);
}

/* Hero */
.tl-hero {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
}

.tl-hero-cover {
  position: relative;
  width: 140px;
  height: 210px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(109, 136, 168, 0.5), #1c1f26);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.tl-hero-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tl-hero-star {
  position: absolute;
  top: 8px;
  right: 8px;
  color: #f2c037;
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.tl-hero-body {
  flex: 1;
  min-width: 0;
}

.tl-hero-eyebrow {
  font-size: 10px;
  color: rgba(174, 183, 198, 0.75);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 500;
}

.tl-hero-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 26px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.015em;
  margin: 6px 0 0;
  line-height: 1.2;
}

.tl-hero-alt {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 13px;
  color: rgba(247, 244, 236, 0.65);
  margin-top: 4px;
}

.tl-hero-badges {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.tl-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(247, 244, 236, 0.75);
}

.tl-badge i {
  font-size: 9px;
}

.tl-badge--blue {
  background: rgba(109, 136, 168, 0.15);
  border-color: rgba(109, 136, 168, 0.3);
  color: #bac9db;
}

.tl-badge--star {
  background: rgba(242, 192, 55, 0.12);
  border-color: rgba(242, 192, 55, 0.3);
  color: #f2c037;
}

.tl-hero-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}

/* 统计条 */
.tl-stats {
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-bottom: 24px;
}

.tl-stat {
  text-align: center;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0 8px;
}

.tl-stat--last {
  border-right: none;
}

.tl-stat-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-stat-label {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* 章节树 */
.tl-chapters {
  margin-bottom: 24px;
}

.tl-chapters-head {
  display: flex;
  align-items: center;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 500;
  margin-bottom: 12px;
}

.tl-chapters-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.tl-volume {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tl-volume-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.tl-volume-head i {
  color: #a3b7cf;
  font-size: 11px;
}

.tl-volume-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-volume-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
}

.tl-chapter-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tl-chapter-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0 5px 20px;
  font-size: 11px;
  color: rgba(247, 244, 236, 0.75);
}

.tl-chapter-icon {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.35);
}

.tl-chapter-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-chapter-more {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.35);
  padding: 4px 0 4px 20px;
  font-style: italic;
}

.tl-chapters-empty {
  padding: 20px;
  color: rgba(247, 244, 236, 0.45);
  font-size: 12px;
  text-align: center;
}

.tl-chapters-empty i {
  margin-right: 6px;
}

.tl-desc {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  font-size: 12px;
  color: rgba(247, 244, 236, 0.7);
  line-height: 1.6;
  margin: 0;
}
</style>
