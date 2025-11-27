<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { formatWordCount, getTotalChapters, getAssetUrl } from 'src/utils';
import { useNovelCharCount } from 'src/composables/useNovelCharCount';
import Card from 'primevue/card';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import BookDialog from 'src/components/dialogs/BookDialog.vue';
import NovelScraperDialog from 'src/components/dialogs/NovelScraperDialog.vue';
import { CoverService } from 'src/services/cover-service';
import type { Novel } from 'src/models/novel';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { v4 as uuidv4 } from 'uuid';

const router = useRouter();
const booksStore = useBooksStore();
const coverHistoryStore = useCoverHistoryStore();
const toast = useToastWithHistory();

// Logo 路径
const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

// 对话框状态
const showAddDialog = ref(false);
const showImportDialog = ref(false);

// 使用字符数加载 composable
const { loadBookCharCount, getTotalWords, isLoadingCharCount } = useNovelCharCount();

// 统计数据
const totalBooks = computed(() => booksStore.books.length);
const totalChapters = computed(() => {
  return booksStore.books.reduce((total, book) => total + getTotalChapters(book), 0);
});
const starredBooks = computed(() => {
  return booksStore.books.filter((book) => book.starred).length;
});
const totalWords = computed(() => {
  return booksStore.books.reduce((total, book) => total + getTotalWords(book), 0);
});

// 最近编辑的书籍（最多6本）
const recentBooks = computed(() => {
  return [...booksStore.books]
    .sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime())
    .slice(0, 6);
});

// 格式化日期
const formatDate = (date: Date): string => {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;

  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// 获取封面图片 URL
const getCoverUrl = (book: Novel): string => {
  return CoverService.getCoverUrl(book);
};

// 添加书籍
const addBook = () => {
  showAddDialog.value = true;
};

// 从网站导入书籍
const importBookFromWeb = () => {
  showImportDialog.value = true;
};

// 处理从网站导入的书籍
const handleImportBook = async (novel: Novel) => {
  const now = new Date();
  const newBook: Novel = {
    ...novel,
    id: uuidv4(),
    createdAt: now,
    lastEdited: now,
  };
  await booksStore.addBook(newBook);

  // 如果导入的书籍有封面，添加到封面历史
  if (newBook.cover) {
    void coverHistoryStore.addCover(newBook.cover);
  }

  showImportDialog.value = false;
  toast.add({
    severity: 'success',
    summary: '导入成功',
    detail: `已成功从网站导入书籍 "${newBook.title}"`,
    life: 3000,
    onRevert: () => booksStore.deleteBook(newBook.id),
  });
};

// 保存书籍（添加）
const handleSave = async (formData: Partial<Novel>) => {
  const now = new Date();
  const newBook: Novel = {
    id: uuidv4(),
    title: formData.title!,
    ...(formData.alternateTitles && formData.alternateTitles.length > 0
      ? { alternateTitles: formData.alternateTitles }
      : {}),
    ...(formData.author?.trim() ? { author: formData.author.trim() } : {}),
    ...(formData.description?.trim() ? { description: formData.description.trim() } : {}),
    ...(formData.tags && formData.tags.length > 0 ? { tags: formData.tags } : {}),
    ...(formData.webUrl && formData.webUrl.length > 0 ? { webUrl: formData.webUrl } : {}),
    ...(formData.cover ? { cover: formData.cover } : {}),
    ...(formData.volumes && formData.volumes.length > 0 ? { volumes: formData.volumes } : {}),
    createdAt: now,
    lastEdited: now,
  };
  await booksStore.addBook(newBook);

  // 如果新书有封面，添加到封面历史
  if (newBook.cover) {
    void coverHistoryStore.addCover(newBook.cover);
  }

  showAddDialog.value = false;
  toast.add({
    severity: 'success',
    summary: '添加成功',
    detail: `已成功添加书籍 "${newBook.title}"`,
    life: 3000,
    onRevert: () => booksStore.deleteBook(newBook.id),
  });
};

// 导航到书籍详情页
const navigateToBookDetails = (book: Novel) => {
  void router.push(`/books/${book.id}`);
};

// 导航到书籍列表页
const navigateToBooks = () => {
  void router.push('/books');
};

// 导航到 AI 设置页
const navigateToAI = () => {
  void router.push('/ai');
};

// 加载所有书籍的字符数
const loadAllBookCharCounts = async () => {
  const books = recentBooks.value;
  const loadPromises = books.map((book) => loadBookCharCount(book));
  await Promise.all(loadPromises);
};

// 当书籍列表变化时，异步加载字符数
watch(
  () => recentBooks.value,
  async () => {
    await loadAllBookCharCounts();
  },
  { immediate: true },
);

// 组件挂载时加载书籍
onMounted(async () => {
  if (!booksStore.isLoaded) {
    await booksStore.loadBooks();
  }
  await loadAllBookCharCounts();
});
</script>

<template>
  <div class="w-full h-full overflow-y-auto">
    <div class="max-w-7xl mx-auto p-6 space-y-6">
      <!-- 欢迎区域 -->
      <div class="text-center py-12 space-y-6">
        <div class="flex flex-col items-center gap-6">
          <div class="flex items-center gap-5">
            <img
              :src="logoPath"
              alt="Luna AI Translator"
              class="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-2xl shadow-lg ring-2 ring-white/10 transition-transform hover:scale-105"
            />
            <div class="flex flex-col text-left">
              <span class="text-xl sm:text-2xl uppercase tracking-[0.3em] text-moon-50 font-light"
                >Luna</span
              >
              <span class="text-2xl sm:text-3xl font-bold text-moon-100 tracking-wide"
                >AI Translator</span
              >
            </div>
          </div>
          <div class="space-y-3 pt-2">
            <h1 class="text-xl sm:text-2xl font-semibold text-moon-100">欢迎使用</h1>
            <p class="text-base sm:text-lg text-moon/70 max-w-2xl mx-auto px-4">
              专业的日本小说翻译工具，支持 AI 翻译、校对润色、术语管理等功能，助您高效完成翻译工作
            </p>
          </div>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- 总书籍数 -->
        <Card class="stat-card">
          <template #content>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm text-moon/60">总书籍</p>
                <p class="text-3xl font-bold text-moon-100">{{ totalBooks }}</p>
              </div>
              <div class="w-14 h-14 rounded-full flex items-center justify-center bg-primary/20">
                <i class="pi pi-book text-2xl text-primary"></i>
              </div>
            </div>
          </template>
        </Card>

        <!-- 总章节数 -->
        <Card class="stat-card">
          <template #content>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm text-moon/60">总章节</p>
                <p class="text-3xl font-bold text-moon-100">{{ totalChapters }}</p>
              </div>
              <div class="w-14 h-14 rounded-full flex items-center justify-center bg-accentTeal/20">
                <i class="pi pi-list text-2xl text-accentTeal-200"></i>
              </div>
            </div>
          </template>
        </Card>

        <!-- 总字数 -->
        <Card class="stat-card">
          <template #content>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm text-moon/60">总字数</p>
                <p class="text-3xl font-bold text-moon-100">
                  {{ formatWordCount(totalWords) }}
                </p>
              </div>
              <div class="w-14 h-14 rounded-full flex items-center justify-center bg-accent/20">
                <i class="pi pi-file-edit text-2xl text-accent-400"></i>
              </div>
            </div>
          </template>
        </Card>

        <!-- 收藏书籍 -->
        <Card class="stat-card">
          <template #content>
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-sm text-moon/60">收藏</p>
                <p class="text-3xl font-bold text-moon-100">{{ starredBooks }}</p>
              </div>
              <div class="w-14 h-14 rounded-full flex items-center justify-center bg-warning/20">
                <i class="pi pi-star-fill text-2xl text-warning"></i>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <!-- 快速操作 -->
      <Card>
        <template #title>
          <div class="flex items-center gap-2">
            <i class="pi pi-bolt text-primary"></i>
            <span>快速操作</span>
          </div>
        </template>
        <template #content>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button
              label="添加书籍"
              icon="pi pi-plus"
              class="p-button-primary icon-button-hover h-12"
              @click="addBook"
            />
            <Button
              label="从网站导入"
              icon="pi pi-globe"
              class="p-button-outlined icon-button-hover h-12"
              @click="importBookFromWeb"
            />
            <Button
              label="查看所有书籍"
              icon="pi pi-book"
              class="p-button-outlined icon-button-hover h-12"
              @click="navigateToBooks"
            />
            <Button
              label="AI 设置"
              icon="pi pi-cog"
              class="p-button-outlined icon-button-hover h-12"
              @click="navigateToAI"
            />
          </div>
        </template>
      </Card>

      <!-- 最近编辑的书籍 -->
      <Card v-if="recentBooks.length > 0">
        <template #title>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="pi pi-clock text-primary"></i>
              <span>最近编辑</span>
            </div>
            <Button
              label="查看全部"
              icon="pi pi-arrow-right"
              iconPos="right"
              class="p-button-text p-button-sm icon-button-hover"
              @click="navigateToBooks"
            />
          </div>
        </template>
        <template #content>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div
              v-for="book in recentBooks"
              :key="book.id"
              class="book-card group cursor-pointer"
              @click="navigateToBookDetails(book)"
            >
              <!-- 封面 -->
              <div class="relative w-full aspect-[2/3] overflow-hidden rounded-lg bg-white/5 mb-2">
                <img
                  :src="getCoverUrl(book)"
                  :alt="book.title"
                  class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  @error="
                    (e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = getCoverUrl(book);
                    }
                  "
                />
              </div>
              <!-- 内容 -->
              <div class="space-y-1">
                <h3
                  class="text-sm font-semibold line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors"
                  :title="book.title"
                >
                  {{ book.title }}
                </h3>
                <p v-if="book.author" class="text-xs text-moon/60 line-clamp-1">
                  {{ book.author }}
                </p>
                <div class="text-[10px] text-moon/50 space-y-0.5 pt-1">
                  <div class="flex items-center justify-between">
                    <span>章节:</span>
                    <span class="font-medium">{{ getTotalChapters(book) }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>字数:</span>
                    <span v-if="isLoadingCharCount(book)" class="font-medium">
                      <Skeleton width="40px" height="12px" />
                    </span>
                    <span v-else class="font-medium">{{
                      formatWordCount(getTotalWords(book))
                    }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>更新:</span>
                    <span class="font-medium">{{ formatDate(book.lastEdited) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </Card>

      <!-- 空状态 -->
      <Card v-else-if="!booksStore.isLoading">
        <template #content>
          <div class="text-center py-12 space-y-4">
            <i class="pi pi-book text-6xl text-moon/30"></i>
            <div class="space-y-2">
              <p class="text-xl font-semibold text-moon/80">还没有书籍</p>
              <p class="text-moon/60">开始添加您的第一本书籍吧</p>
            </div>
            <div class="flex justify-center gap-3 pt-4">
              <Button
                label="添加书籍"
                icon="pi pi-plus"
                class="p-button-primary icon-button-hover"
                @click="addBook"
              />
              <Button
                label="从网站导入"
                icon="pi pi-globe"
                class="p-button-outlined icon-button-hover"
                @click="importBookFromWeb"
              />
            </div>
          </div>
        </template>
      </Card>

      <!-- 加载状态 -->
      <Card v-else>
        <template #content>
          <div class="flex items-center justify-center py-12">
            <div class="text-center space-y-4">
              <ProgressSpinner
                style="width: 50px; height: 50px"
                strokeWidth="4"
                animationDuration=".8s"
                aria-label="加载中"
              />
              <p class="text-moon/70">正在加载数据...</p>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <!-- 添加书籍对话框 -->
    <BookDialog
      v-model:visible="showAddDialog"
      mode="add"
      @save="handleSave"
      @cancel="showAddDialog = false"
    />

    <!-- 从网站导入对话框 -->
    <NovelScraperDialog
      v-model:visible="showImportDialog"
      :current-book="null"
      @apply="handleImportBook"
    />
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

/* Card 样式覆盖 */
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
