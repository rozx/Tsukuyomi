<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectBooksPage } from 'src/composables/books-page/useBooksPage';

const ctx = injectBooksPage();

// 列表状态文案 / 显隐：吸收模板内的 filter / || / 三元
const starredCount = computed(() => ctx.booksStore.books.filter((b) => b.starred).length);
const hasStarred = computed(() => starredCount.value > 0);
const isListLoading = computed(() => ctx.booksStore.isLoading || !ctx.booksStore.isLoaded);
const isEmptyList = computed(() => ctx.filteredBooks.value.length === 0);
const hasNoSearch = computed(() => !ctx.searchQuery.value);
const emptyText = computed(() => (ctx.searchQuery.value ? '未找到匹配的书籍' : '暂无书籍'));
const libraryMetaText = computed(() => {
  const base = `共 ${ctx.booksStore.books.length} 本`;
  return hasStarred.value ? `${base} · ${starredCount.value} 本收藏` : base;
});

// 添加书籍 picker（底部抽屉）：展开手动 / 从网站 / 从 JSON 三个入口
const showAddPicker = ref(false);
const openAddPicker = () => {
  showAddPicker.value = true;
};
const closeAddPicker = () => {
  showAddPicker.value = false;
};
const pickManualAdd = () => {
  closeAddPicker();
  ctx.addBook();
};
const pickImportFromWeb = () => {
  closeAddPicker();
  ctx.importBookFromWeb();
};
const pickImportFromJson = () => {
  closeAddPicker();
  ctx.importBookFromJson();
};
</script>

<template>
  <div class="mobile-library w-full h-full flex flex-col">
    <!-- 大标题区 -->
    <header class="ml-largetitle">
      <div class="ml-eyebrow">LIBRARY</div>
      <h1 class="ml-title">书库</h1>
      <div class="ml-meta">
        {{ libraryMetaText }}
      </div>
    </header>

    <!-- 搜索 + 添加 -->
    <div class="ml-toolbar">
      <div class="ml-input-wrap">
        <i class="pi pi-search" aria-hidden="true" />
        <input v-model="ctx.searchQuery.value" class="ml-input" placeholder="搜索书名、作者…" />
        <button
          v-if="ctx.searchQuery.value"
          class="ml-input-clear"
          aria-label="清除搜索"
          @click="ctx.searchQuery.value = ''"
        >
          <i class="pi pi-times" />
        </button>
      </div>
      <button class="ml-icon-btn" title="添加书籍" @click="openAddPicker">
        <i class="pi pi-plus" aria-hidden="true" />
      </button>
    </div>

    <!-- 加载 -->
    <div v-if="isListLoading" class="ml-state">
      <ProgressSpinner
        style="width: 36px; height: 36px"
        stroke-width="4"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <span>正在加载书籍列表…</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="isEmptyList" class="ml-state">
      <i class="pi pi-book ml-state-icon" aria-hidden="true" />
      <span class="ml-state-title">
        {{ emptyText }}
      </span>
      <Button
        v-if="hasNoSearch"
        label="添加第一本书籍"
        icon="pi pi-plus"
        class="p-button-primary"
        @click="openAddPicker"
      />
    </div>

    <!-- 书籍网格 -->
    <div v-else class="ml-scroll">
      <div class="ml-grid">
        <div
          v-for="book in ctx.filteredBooks.value"
          :key="book.id"
          class="ml-card"
          role="button"
          @click="ctx.navigateToBookDetails(book)"
        >
          <div class="ml-cover">
            <img :src="ctx.getCoverUrl(book)" :alt="book.title" loading="lazy" />
            <i v-if="book.starred" class="pi pi-star-fill ml-cover-star" aria-hidden="true" />
          </div>
          <div class="ml-card-title">{{ book.title }}</div>
          <div v-if="book.author" class="ml-card-author">{{ book.author }}</div>
          <div class="ml-card-footer">
            <span v-if="ctx.isLoadingCharCount(book)">
              <Skeleton width="36px" height="10px" />
            </span>
            <span v-else>{{ ctx.formatWordCount(ctx.getTotalWords(book)) }} 字</span>
            <span class="ml-dot">·</span>
            <span>{{ ctx.getTotalChapters(book) }} 章</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入（JSON 导入）—— 桌面变体在自己模板里挂一份，手机这里再挂
         一份，否则 ctx.fileInputRef 为空，importBookFromJson 触发不到点击。 -->
    <input
      :ref="(el) => { ctx.fileInputRef.value = el as HTMLInputElement | null; }"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="ctx.handleFileSelect"
    />

    <!-- 添加书籍 picker —— 使用共享 MobileBottomSheet 外壳 -->
    <MobileBottomSheet
      v-model:visible="showAddPicker"
      title="添加书籍"
      eyebrow="LIBRARY"
    >
      <button type="button" class="ml-add-picker-option" @click="pickManualAdd">
        <i class="pi pi-plus ml-add-picker-option-icon" aria-hidden="true" />
        <div class="ml-add-picker-option-main">
          <div class="ml-add-picker-option-name">手动添加</div>
          <div class="ml-add-picker-option-meta">创建空白书籍，手动录入章节</div>
        </div>
        <i class="pi pi-chevron-right ml-add-picker-chev" aria-hidden="true" />
      </button>
      <button type="button" class="ml-add-picker-option" @click="pickImportFromWeb">
        <i class="pi pi-globe ml-add-picker-option-icon" aria-hidden="true" />
        <div class="ml-add-picker-option-main">
          <div class="ml-add-picker-option-name">从网站导入</div>
          <div class="ml-add-picker-option-meta">
            syosetu / kakuyomu 等站点直接抓取
          </div>
        </div>
        <i class="pi pi-chevron-right ml-add-picker-chev" aria-hidden="true" />
      </button>
      <button type="button" class="ml-add-picker-option" @click="pickImportFromJson">
        <i class="pi pi-file-import ml-add-picker-option-icon" aria-hidden="true" />
        <div class="ml-add-picker-option-main">
          <div class="ml-add-picker-option-name">从 JSON 导入</div>
          <div class="ml-add-picker-option-meta">从导出文件批量恢复书籍</div>
        </div>
        <i class="pi pi-chevron-right ml-add-picker-chev" aria-hidden="true" />
      </button>
    </MobileBottomSheet>
  </div>
</template>

<style scoped>
.mobile-library {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.ml-largetitle {
  padding: 16px 20px 8px;
  flex-shrink: 0;
}

.ml-eyebrow {
  font-weight: 500;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
  letter-spacing: 0.22em;
  margin-bottom: 4px;
}

.ml-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 600;
  font-size: 28px;
  line-height: 1.15;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.02em;
  margin: 0;
}

.ml-meta {
  font-size: 12px;
  color: var(--moon-50-opacity-55);
  margin-top: 6px;
}

.ml-toolbar {
  padding: 4px 20px 12px;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.ml-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.ml-input-wrap > i {
  position: absolute;
  left: 12px;
  color: var(--moon-50-opacity-55);
  font-size: 13px;
  pointer-events: none;
}

.ml-input {
  width: 100%;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  padding: 10px 34px 10px 34px;
  color: var(--moon-50-opacity-100);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.ml-input::placeholder {
  color: var(--moon-50-opacity-45);
}

.ml-input:focus {
  /* token: primary (moon white) */
  border-color: var(--primary-200);
  box-shadow: 0 0 0 2px var(--primary-opacity-20);
}

.ml-input-clear {
  position: absolute;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--moon-50-opacity-55);
  cursor: pointer;
  border-radius: 6px;
}

.ml-input-clear:hover {
  background: var(--white-opacity-6);
  color: var(--moon-50-opacity-85);
}

.ml-input-clear i {
  font-size: 11px;
}

.ml-icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  color: var(--moon-50-opacity-75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ml-icon-btn:hover {
  background: var(--white-opacity-8);
  color: var(--moon-50-opacity-100);
}

.ml-icon-btn i {
  font-size: 14px;
}

.ml-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ml-scroll::-webkit-scrollbar {
  width: 0;
}

.ml-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding: 4px 20px 24px;
}

.ml-card {
  cursor: pointer;
  min-width: 0;
}

.ml-cover {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  /* token: night-300 */
  background: var(--night-300);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.ml-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ml-cover-star {
  position: absolute;
  top: 8px;
  right: 8px;
  /* token: warning */
  color: var(--color-warning);
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.ml-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  margin-top: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-card-author {
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
}

.ml-dot {
  opacity: 0.5;
}

.ml-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
  text-align: center;
  color: var(--moon-50-opacity-60);
  font-size: 13px;
}

.ml-state-icon {
  font-size: 42px;
  /* token: moon-50 @ 25% */
  color: var(--moon-50-opacity-25);
}

.ml-state-title {
  font-size: 14px;
  color: var(--moon-50-opacity-70);
}

/* ───── 添加书籍 picker 选项（sheet 外壳由 MobileBottomSheet 提供） ───── */
.ml-add-picker-option {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-tap-highlight-color: transparent;
  margin-bottom: 2px;
}

.ml-add-picker-option:active {
  background: var(--white-opacity-4);
  border-color: var(--tsukuyomi-opacity-25);
}

.ml-add-picker-option-icon {
  font-size: 18px;
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.ml-add-picker-option-main {
  flex: 1;
  min-width: 0;
}

.ml-add-picker-option-name {
  font-size: 14px;
  font-weight: 500;
  /* token: primary (moon white) */
  color: var(--primary-200);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-add-picker-option-meta {
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-top: 3px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-add-picker-chev {
  /* token: moon-50 @ 35% */
  color: var(--moon-50-opacity-35);
  font-size: 11px;
  flex-shrink: 0;
}
</style>
