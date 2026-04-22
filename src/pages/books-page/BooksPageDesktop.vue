<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import SplitButton from 'primevue/splitbutton';
import DataView from 'primevue/dataview';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import TieredMenu from 'primevue/tieredmenu';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
import DesktopWorkbenchMetrics from 'src/components/desktop/DesktopWorkbenchMetrics.vue';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import { injectBooksPage } from 'src/composables/books-page/useBooksPage';

const ctx = injectBooksPage();

const totalBooks = computed(() => ctx.booksStore.books.length);
const starredBooks = computed(() => ctx.booksStore.books.filter((book) => book.starred).length);
const visibleBooks = computed(() => ctx.filteredBooks.value.length);
const libraryMetrics = computed(() => [
  { label: '全部', value: totalBooks.value },
  { label: '筛选', value: visibleBooks.value },
  { label: '收藏', value: starredBooks.value },
]);
const librarySummary = computed(() => {
  if (ctx.searchQuery.value) {
    return `当前筛出 ${visibleBooks.value} 本书，可直接继续管理、编辑或进入阅读工作区。`;
  }
  return '在桌面工作台里集中浏览、整理并进入你的翻译书库。';
});
</script>

<template>
  <div class="desktop-library-page">
    <DesktopWorkbenchHeader eyebrow="Library" title="书库工作台" :description="librarySummary">
      <template #actions>
        <div class="books-toolbar">
          <InputGroup class="search-input-group">
            <InputGroupAddon>
              <i class="pi pi-search text-base" />
            </InputGroupAddon>
            <InputText
              v-model="ctx.searchQuery.value"
              placeholder="搜索书籍标题、别名、作者、描述或标签..."
              class="search-input"
            />
            <InputGroupAddon v-if="ctx.searchQuery.value" class="input-action-addon">
              <Button
                icon="pi pi-times"
                class="p-button-text p-button-sm input-action-button"
                title="清除搜索"
                @click="ctx.searchQuery.value = ''"
              />
            </InputGroupAddon>
          </InputGroup>
          <div class="books-toolbar-actions">
            <Button
              :label="
                ctx.sortOptions.find((opt) => opt.value === ctx.selectedSort.value)?.label || '排序'
              "
              icon="pi pi-sort-alt"
              icon-pos="right"
              class="books-sort-button p-button-outlined icon-button-hover"
              @click="
                (e: Event) => {
                  const menu = ctx.sortMenuRef.value;
                  if (menu) menu.toggle(e);
                }
              "
            />
            <SplitButton
              label="添加书籍"
              icon="pi pi-plus"
              :model="ctx.addBookMenuItems.value"
              class="books-add-split-button p-button-primary icon-button-hover"
              @click="ctx.addBook"
            />
          </div>
        </div>
      </template>

      <template #metrics>
        <DesktopWorkbenchMetrics :items="libraryMetrics" />
      </template>
    </DesktopWorkbenchHeader>

    <DesktopWorkbenchSurface class="library-canvas" tone="muted" :padded="false">
      <div v-if="ctx.booksStore.isLoading || !ctx.booksStore.isLoaded" class="library-state">
        <div class="text-center">
          <ProgressSpinner
            style="width: 50px; height: 50px"
            stroke-width="4"
            animation-duration=".8s"
            aria-label="加载中"
          />
          <p class="text-moon/70 mt-4">正在加载书籍列表...</p>
        </div>
      </div>
      <DataView
        v-else-if="ctx.booksStore.isLoaded"
        :value="ctx.filteredBooks.value"
        data-key="id"
        :rows="20"
        :paginator="ctx.filteredBooks.value.length > 0"
        :rows-per-page-options="[10, 20, 50, 100]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
        current-page-report-template="{currentPage} / {totalPages}"
        layout="grid"
        class="library-data-view"
      >
        <template #empty>
          <div class="library-state library-state--empty">
            <i class="pi pi-book text-4xl text-moon/50 mb-4 icon-hover" />
            <p class="text-moon/70">
              {{ ctx.searchQuery.value ? '未找到匹配的书籍' : '暂无书籍' }}
            </p>
            <Button
              v-if="!ctx.searchQuery.value"
              label="添加第一本书籍"
              icon="pi pi-plus"
              class="p-button-primary mt-4 icon-button-hover"
              @click="ctx.addBook"
            />
          </div>
        </template>

        <template #grid="slotProps">
          <div class="library-grid">
            <div v-for="book in slotProps.items" :key="book.id" class="library-book-card group">
              <div class="library-book-cover-shell" @click="ctx.navigateToBookDetails(book)">
                <img
                  :src="ctx.getCoverUrl(book)"
                  :alt="book.title"
                  class="library-book-cover"
                  @error="
                    (e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = ctx.getCoverUrl(book);
                    }
                  "
                />
                <div class="library-book-overlay"></div>
                <div v-if="book.starred" class="library-book-flag">
                  <i class="pi pi-star-fill" /> 收藏
                </div>
              </div>
              <div class="library-book-content">
                <div class="library-book-heading-row">
                  <span class="library-book-kicker">{{ book.author || '未署名作品' }}</span>
                  <span class="library-book-updated">{{ ctx.formatDate(book.lastEdited) }}</span>
                </div>
                <h3
                  class="library-book-title line-clamp-2"
                  :title="book.title"
                  @click="ctx.navigateToBookDetails(book)"
                >
                  {{ book.title }}
                </h3>
                <div class="library-book-summary">
                  <span>将这本书直接带回章节工作区，继续翻译或维护元数据。</span>
                </div>

                <div class="library-book-stats">
                  <div class="library-book-stat-row">
                    <span>章节:</span>
                    <strong>{{ ctx.getTotalChapters(book) }}</strong>
                  </div>
                  <div class="library-book-stat-row">
                    <span>字数:</span>
                    <span v-if="ctx.isLoadingCharCount(book)" class="font-medium">
                      <Skeleton width="40px" height="12px" />
                    </span>
                    <strong v-else>
                      {{ ctx.formatWordCount(ctx.getTotalWords(book)) }}
                    </strong>
                  </div>
                  <div class="library-book-stat-row">
                    <span>创建:</span>
                    <strong>{{ ctx.formatDate(book.createdAt) }}</strong>
                  </div>
                  <div class="library-book-stat-row">
                    <span>更新:</span>
                    <strong>{{ ctx.formatDate(book.lastEdited) }}</strong>
                  </div>
                </div>

                <div class="library-book-actions">
                  <Button
                    :icon="book.starred ? 'pi pi-star-fill' : 'pi pi-star'"
                    :class="[
                      'p-button-text p-button-sm flex-1 !text-xs !py-2 !px-2',
                      book.starred ? '!text-yellow-400' : '',
                    ]"
                    :title="book.starred ? '取消收藏' : '收藏'"
                    @click.stop="ctx.toggleStar(book)"
                  />
                  <Button
                    icon="pi pi-pencil"
                    class="p-button-text p-button-sm flex-1 !text-xs !py-2 !px-2"
                    title="编辑"
                    @click.stop="ctx.editBook(book)"
                  />
                  <Button
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-danger flex-1 !text-xs !py-2 !px-2"
                    title="删除"
                    @click.stop="ctx.deleteBook(book)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </DataView>
    </DesktopWorkbenchSurface>

    <!-- 排序菜单（由 composable 的 sortMenuRef 持有） -->
    <TieredMenu
      :ref="
        (el) => {
          ctx.sortMenuRef.value = el as unknown as typeof ctx.sortMenuRef.value;
        }
      "
      :model="ctx.sortMenuItems.value"
      popup
    />

    <!-- 隐藏的文件输入（用于导入 JSON） -->
    <input
      :ref="
        (el) => {
          ctx.fileInputRef.value = el as HTMLInputElement | null;
        }
      "
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="ctx.handleFileSelect"
    />
  </div>
</template>

<style scoped>
.desktop-library-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.1rem 1.25rem;
}

.books-toolbar {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 0.7rem;
}

.books-toolbar-actions {
  display: flex;
  align-items: stretch;
  gap: 0.7rem;
}

.library-canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.library-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 2rem;
}

.library-state--empty {
  flex-direction: column;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 1rem;
  align-items: stretch;
}

.library-book-card {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.015)),
    rgba(10, 14, 20, 0.82);
  box-shadow: 0 18px 38px rgba(2, 6, 16, 0.16);
  transition:
    transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 180ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.library-book-card:hover {
  transform: translateY(-2px);
  border-color: rgba(186, 201, 219, 0.24);
  box-shadow: 0 26px 46px rgba(2, 6, 16, 0.24);
}

.library-book-cover-shell {
  position: relative;
  aspect-ratio: 5 / 7;
  overflow: hidden;
  cursor: pointer;
}

.library-book-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.library-book-card:hover .library-book-cover {
  transform: scale(1.04);
}

.library-book-overlay {
  position: absolute;
  inset: auto 0 0 0;
  height: 40%;
  background: linear-gradient(180deg, transparent, rgba(7, 10, 16, 0.92));
  pointer-events: none;
}

.library-book-flag {
  position: absolute;
  top: 0.9rem;
  left: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  background: rgba(14, 18, 24, 0.74);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 230, 138, 0.98);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.library-book-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem 1rem 1.05rem;
}

.library-book-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.library-book-kicker,
.library-book-updated {
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(247, 244, 236, 0.48);
}

.library-book-updated {
  flex-shrink: 0;
}

.library-book-title {
  margin: 0;
  cursor: pointer;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1.03rem;
  font-weight: 600;
  line-height: 1.35;
  color: rgba(247, 244, 236, 0.96);
  transition: color 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.library-book-title:hover {
  color: #bac9db;
}

.library-book-summary {
  min-height: 2.7rem;
  font-size: 0.9rem;
  line-height: 1.55;
  color: rgba(247, 244, 236, 0.62);
}

.library-book-stats {
  display: grid;
  gap: 0.35rem;
  padding: 0.85rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: rgba(247, 244, 236, 0.48);
}

.library-book-stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}

.library-book-stat-row strong {
  font-size: 0.74rem;
  font-weight: 600;
  color: rgba(247, 244, 236, 0.82);
}

.library-book-actions {
  display: flex;
  gap: 0.35rem;
}

.library-data-view {
  flex: 1;
  min-height: 0;
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:deep(.p-dataview) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  background: transparent !important;
}

:deep(.p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 0 0 1rem;
  background: transparent !important;
}

:deep(.p-paginator) {
  flex-shrink: 0;
  margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02) !important;
}

.search-input-group {
  min-width: 0;
  max-width: none;
}

.search-input-group :deep(.p-inputtext) {
  min-width: 0;
}

.books-sort-button {
  min-width: 5.75rem;
  justify-content: center;
  white-space: nowrap;
}

.books-toolbar :deep(.p-splitbutton) {
  flex-shrink: 0;
}

@media (max-width: 1200px) {
  .books-toolbar {
    grid-template-columns: 1fr;
  }

  .books-toolbar-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 820px) {
  .desktop-library-page {
    padding-inline: 0.85rem;
  }

  .books-toolbar-actions {
    width: 100%;
  }

  .books-toolbar-actions > * {
    flex: 1 1 0;
    min-width: 0;
  }

  .books-toolbar :deep(.p-splitbutton) {
    width: auto;
  }

  .books-toolbar :deep(.p-splitbutton .p-button) {
    min-height: 2.5rem;
  }

  .books-toolbar :deep(.p-splitbutton .p-splitbutton-button) {
    flex: 0 0 auto;
    justify-content: center;
  }

  .library-book-summary {
    min-height: auto;
  }
}
</style>
