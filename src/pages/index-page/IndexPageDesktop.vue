<script setup lang="ts">
import Card from 'primevue/card';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import { injectIndexPage } from 'src/composables/index-page/useIndexPage';
import { APP_NAME } from 'src/constants/app';

const ctx = injectIndexPage();
</script>

<template>
  <div class="w-full h-full overflow-y-auto">
    <div class="max-w-7xl mx-auto p-6 space-y-6">
      <!-- 欢迎区域 -->
      <div class="text-center py-12 space-y-6">
        <div class="flex flex-col items-center gap-6">
          <div class="flex items-center gap-5">
            <img
              :src="ctx.logoPath"
              :alt="APP_NAME.full"
              class="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-2xl shadow-lg ring-2 ring-white/10 transition-transform hover:scale-105"
            />
            <div class="flex flex-col text-left">
              <span
                class="font-ui font-light text-xs sm:text-sm uppercase tracking-[0.3em] text-accent-300"
              >
                {{ APP_NAME.en }} {{ APP_NAME.zh }}
              </span>
              <span
                class="font-display text-3xl sm:text-4xl font-semibold text-moon-100 tracking-tight leading-tight mt-1"
              >
                {{ APP_NAME.description.en }}
              </span>
            </div>
          </div>
          <div class="space-y-3 pt-2">
            <h1 class="font-display text-xl sm:text-2xl font-semibold text-moon-100">欢迎使用</h1>
            <p class="text-base sm:text-lg text-moon/70 max-w-2xl mx-auto px-4">
              专业的日本小说翻译工具，支持 AI 翻译、校对润色、术语管理等功能，助您高效完成翻译工作
            </p>
          </div>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card class="stat-card">
          <template #content>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm text-moon/60">总书籍</p>
                <p class="font-mono text-3xl font-semibold text-moon-100 tracking-tight">
                  {{ ctx.totalBooks.value }}
                </p>
              </div>
              <div class="w-14 h-14 rounded-full flex items-center justify-center bg-primary/20">
                <i class="pi pi-book text-2xl text-primary" />
              </div>
            </div>
          </template>
        </Card>

        <Card class="stat-card">
          <template #content>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm text-moon/60">总章节</p>
                <p class="font-mono text-3xl font-semibold text-moon-100 tracking-tight">
                  {{ ctx.totalChapters.value }}
                </p>
              </div>
              <div
                class="w-14 h-14 rounded-full flex items-center justify-center bg-accentTeal/20"
              >
                <i class="pi pi-list text-2xl text-accentTeal-200" />
              </div>
            </div>
          </template>
        </Card>

        <Card class="stat-card">
          <template #content>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm text-moon/60">总字数</p>
                <p class="font-mono text-3xl font-semibold text-moon-100 tracking-tight">
                  {{ ctx.formatWordCount(ctx.totalWords.value) }}
                </p>
              </div>
              <div class="w-14 h-14 rounded-full flex items-center justify-center bg-accent/20">
                <i class="pi pi-file-edit text-2xl text-accent-400" />
              </div>
            </div>
          </template>
        </Card>

        <Card class="stat-card">
          <template #content>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm text-moon/60">收藏</p>
                <p class="font-mono text-3xl font-semibold text-moon-100 tracking-tight">
                  {{ ctx.starredBooks.value }}
                </p>
              </div>
              <div class="w-14 h-14 rounded-full flex items-center justify-center bg-warning/20">
                <i class="pi pi-star-fill text-2xl text-warning" />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <!-- 快速操作 -->
      <Card>
        <template #title>
          <div class="flex items-center gap-2">
            <i class="pi pi-bolt text-primary" />
            <span>快速操作</span>
          </div>
        </template>
        <template #content>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button
              label="添加书籍"
              icon="pi pi-plus"
              class="p-button-primary icon-button-hover h-12"
              @click="ctx.addBook"
            />
            <Button
              label="从网站导入"
              icon="pi pi-globe"
              class="p-button-outlined icon-button-hover h-12"
              @click="ctx.importBookFromWeb"
            />
            <Button
              label="查看所有书籍"
              icon="pi pi-book"
              class="p-button-outlined icon-button-hover h-12"
              @click="ctx.navigateToBooks"
            />
            <Button
              label="AI 设置"
              icon="pi pi-cog"
              class="p-button-outlined icon-button-hover h-12"
              @click="ctx.navigateToAI"
            />
          </div>
        </template>
      </Card>

      <!-- 最近编辑的书籍 -->
      <Card v-if="ctx.recentBooks.value.length > 0">
        <template #title>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="pi pi-clock text-primary" />
              <span>最近编辑</span>
            </div>
            <Button
              label="查看全部"
              icon="pi pi-arrow-right"
              icon-pos="right"
              class="p-button-text p-button-sm icon-button-hover"
              @click="ctx.navigateToBooks"
            />
          </div>
        </template>
        <template #content>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div
              v-for="book in ctx.recentBooks.value"
              :key="book.id"
              class="book-card group cursor-pointer"
              @click="ctx.navigateToBookDetails(book)"
            >
              <div class="relative w-full aspect-[2/3] overflow-hidden rounded-lg bg-white/5 mb-2">
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
              <div class="space-y-1">
                <h3
                  class="font-display text-[13px] font-semibold leading-snug line-clamp-2 min-h-[2.5rem] text-moon/90 group-hover:text-primary transition-colors"
                  :title="book.title"
                >
                  {{ book.title }}
                </h3>
                <p v-if="book.author" class="text-xs text-moon/60 line-clamp-1">
                  {{ book.author }}
                </p>
                <div class="font-mono text-[10px] text-moon/50 space-y-0.5 pt-1">
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
                    <span>更新:</span>
                    <span class="font-medium">{{ ctx.formatDate(book.lastEdited) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </Card>

      <!-- 加载状态 -->
      <Card v-else-if="ctx.booksStore.isLoading || !ctx.booksStore.isLoaded">
        <template #content>
          <div class="flex items-center justify-center py-12">
            <div class="text-center">
              <ProgressSpinner
                style="width: 50px; height: 50px"
                stroke-width="4"
                animation-duration=".8s"
                aria-label="加载中"
              />
              <p class="text-moon/70 mt-4">正在加载数据...</p>
            </div>
          </div>
        </template>
      </Card>

      <!-- 空状态 -->
      <Card v-else-if="ctx.booksStore.isLoaded && ctx.booksStore.books.length === 0">
        <template #content>
          <div class="text-center py-12 space-y-4">
            <i class="pi pi-book text-6xl text-moon/30" />
            <div class="space-y-2">
              <p class="text-xl font-semibold text-moon/80">还没有书籍</p>
              <p class="text-moon/60">开始添加您的第一本书籍吧</p>
            </div>
            <div class="flex justify-center gap-3 pt-4">
              <Button
                label="添加书籍"
                icon="pi pi-plus"
                class="p-button-primary icon-button-hover"
                @click="ctx.addBook"
              />
              <Button
                label="从网站导入"
                icon="pi pi-globe"
                class="p-button-outlined icon-button-hover"
                @click="ctx.importBookFromWeb"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-card:hover {
  background: var(--white-opacity-4);
  border-color: var(--white-opacity-15);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--black-opacity-15);
}

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

:deep(.p-card) {
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
}

:deep(.p-card-body) {
  padding: 1.5rem;
}

:deep(.p-card-title) {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
  margin-bottom: 1rem;
}

:deep(.p-card-content) {
  padding: 0;
}
</style>
