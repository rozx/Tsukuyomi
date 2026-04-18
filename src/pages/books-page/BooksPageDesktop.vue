<script setup lang="ts">
import Button from 'primevue/button';
import SplitButton from 'primevue/splitbutton';
import DataView from 'primevue/dataview';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import TieredMenu from 'primevue/tieredmenu';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import { injectBooksPage } from 'src/composables/books-page/useBooksPage';

const ctx = injectBooksPage();
</script>

<template>
  <div class="w-full h-full flex flex-col p-3 sm:p-4 lg:p-6">
    <!-- 头部 -->
    <div
      class="flex flex-col md:flex-row md:items-center md:justify-between mb-4 sm:mb-6 flex-shrink-0 gap-3"
    >
      <div class="flex-shrink-0 min-w-0">
        <h1 class="text-2xl font-bold">书籍列表</h1>
        <p class="text-moon/70 mt-1">管理您的翻译书籍</p>
      </div>
      <div
        class="books-toolbar flex w-full md:w-auto items-center gap-2 sm:gap-3 flex-wrap md:flex-nowrap"
      >
        <InputGroup class="search-input-group min-w-0 flex-shrink w-full md:w-auto">
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
        <Button
          :label="
            ctx.sortOptions.find((opt) => opt.value === ctx.selectedSort.value)?.label || '排序'
          "
          icon="pi pi-sort-alt"
          icon-pos="right"
          class="p-button-outlined icon-button-hover flex-shrink-0 w-full sm:w-auto"
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
          class="books-add-split-button p-button-primary icon-button-hover flex-shrink-0 w-full sm:w-auto"
          @click="ctx.addBook"
        />
      </div>
    </div>

    <div class="flex-1 flex flex-col min-h-0">
      <div
        v-if="ctx.booksStore.isLoading || !ctx.booksStore.isLoaded"
        class="flex-1 flex items-center justify-center"
      >
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
        class="flex-1 flex flex-col min-h-0"
      >
        <template #empty>
          <div class="text-center py-12">
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
          <div
            class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 items-stretch"
          >
            <div
              v-for="book in slotProps.items"
              :key="book.id"
              class="book-card group flex flex-col h-full"
            >
              <div
                class="book-cover relative w-full aspect-[2/3] overflow-hidden rounded-t-lg bg-white/5 mb-2 cursor-pointer"
                @click="ctx.navigateToBookDetails(book)"
              >
                <img
                  :src="ctx.getCoverUrl(book)"
                  :alt="book.title"
                  class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  @error="
                    (e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = ctx.getCoverUrl(book);
                    }
                  "
                />
              </div>
              <div class="book-card-content px-1 pb-2 space-y-1.5 flex flex-col flex-1">
                <h3
                  class="book-card-title text-sm font-semibold line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors cursor-pointer"
                  :title="book.title"
                  @click="ctx.navigateToBookDetails(book)"
                >
                  {{ book.title }}
                </h3>
                <p v-if="book.author" class="text-xs text-moon/60 line-clamp-1">
                  {{ book.author }}
                </p>

                <div
                  class="book-card-stats text-[10px] text-moon/50 space-y-0.5 pt-1 border-t border-white/5 mt-auto"
                >
                  <div class="flex items-center justify-between">
                    <span>章节:</span>
                    <span class="font-medium">{{ ctx.getTotalChapters(book) }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>字数:</span>
                    <span v-if="ctx.isLoadingCharCount(book)" class="font-medium">
                      <Skeleton width="40px" height="12px" />
                    </span>
                    <span v-else class="font-medium">
                      {{ ctx.formatWordCount(ctx.getTotalWords(book)) }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>创建:</span>
                    <span class="font-medium">{{ ctx.formatDate(book.createdAt) }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>更新:</span>
                    <span class="font-medium">{{ ctx.formatDate(book.lastEdited) }}</span>
                  </div>
                </div>

                <div
                  class="book-card-actions flex items-center gap-1 pt-1.5 border-t border-white/5"
                >
                  <Button
                    :icon="book.starred ? 'pi pi-star-fill' : 'pi pi-star'"
                    :class="[
                      'p-button-text p-button-sm flex-1 !text-xs !py-1 !px-2',
                      book.starred ? '!text-yellow-400' : '',
                    ]"
                    :title="book.starred ? '取消收藏' : '收藏'"
                    @click.stop="ctx.toggleStar(book)"
                  />
                  <Button
                    icon="pi pi-pencil"
                    class="p-button-text p-button-sm flex-1 !text-xs !py-1 !px-2"
                    title="编辑"
                    @click.stop="ctx.editBook(book)"
                  />
                  <Button
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-danger flex-1 !text-xs !py-1 !px-2"
                    title="删除"
                    @click.stop="ctx.deleteBook(book)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </DataView>
    </div>

    <!-- 排序菜单（由 composable 的 sortMenuRef 持有） -->
    <TieredMenu
      :ref="(el) => { ctx.sortMenuRef.value = el as unknown as typeof ctx.sortMenuRef.value; }"
      :model="ctx.sortMenuItems.value"
      popup
    />

    <!-- 隐藏的文件输入（用于导入 JSON） -->
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
.book-card {
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  border-radius: 8px;
  padding: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.book-card:hover {
  background: var(--white-opacity-4);
  border-color: var(--white-opacity-15);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--black-opacity-15);
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
  background: transparent !important;
}

:deep(.p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-paginator) {
  flex-shrink: 0;
  margin-top: auto;
}

.search-input-group {
  min-width: 0;
  flex: 1 1 auto;
  max-width: 400px;
}

.search-input-group :deep(.p-inputtext) {
  min-width: 0;
}

@media (max-width: 640px) {
  .search-input-group {
    max-width: none;
  }

  .books-toolbar :deep(.p-splitbutton) {
    width: 100%;
  }

  .books-toolbar :deep(.p-splitbutton .p-button) {
    min-height: 2.5rem;
  }

  .books-toolbar :deep(.p-splitbutton .p-splitbutton-button) {
    flex: 1 1 auto;
    justify-content: center;
  }

  .book-card {
    display: flex;
    flex-direction: row;
    gap: 0.625rem;
    padding: 0.625rem;
    border-radius: 10px;
  }

  .book-card:hover {
    transform: none;
  }

  .book-cover {
    flex: 0 0 5.4rem;
    width: 5.4rem;
    min-width: 5.4rem;
    margin-bottom: 0;
    border-radius: 8px;
  }

  .book-card-content {
    padding: 0 0 0.125rem;
    min-width: 0;
  }

  .book-card-title {
    min-height: auto;
    font-size: 0.92rem;
    line-height: 1.35;
    margin-bottom: 0.1rem;
  }

  .book-card-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.2rem 0.6rem;
    padding-top: 0.45rem;
  }

  .book-card-actions {
    padding-top: 0.5rem;
    margin-top: 0.15rem;
  }
}
</style>
