<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { formatWordCount, getTotalChapters, getAssetUrl } from 'src/utils';
import { useNovelCharCount } from 'src/composables/useNovelCharCount';
import { useResponsiveLayout } from 'src/composables/useResponsiveLayout';
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
import { APP_NAME } from 'src/constants/app';

const { isPhone } = useResponsiveLayout();

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

// 手机端"继续翻译"的书籍（最近编辑的第一本）
const continueReadingBook = computed<Novel | null>(() => recentBooks.value[0] ?? null);

// 手机端时间问候语
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早安';
  if (h < 14) return '午安';
  if (h < 18) return '下午好';
  return '晚上好';
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
    ...(formData.translationInstructions !== undefined
      ? { translationInstructions: formData.translationInstructions }
      : {}),
    ...(formData.polishInstructions !== undefined
      ? { polishInstructions: formData.polishInstructions }
      : {}),
    ...(formData.proofreadingInstructions !== undefined
      ? { proofreadingInstructions: formData.proofreadingInstructions }
      : {}),
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
);

// 组件挂载时加载书籍
onMounted(async () => {
  // 确保书籍数据已加载
  // 如果 App.vue 已经在后台加载，这里会等待加载完成
  // loadBooks 内部会检查 isLoaded，避免重复加载
  await booksStore.loadBooks();

  // 确保书籍数据已加载后再加载字符数
  await loadAllBookCharCounts();
});
</script>

<template>
  <!-- ─────────────── 手机端 · Mobile Home ─────────────── -->
  <div v-if="isPhone" class="mobile-home w-full h-full overflow-y-auto">
    <!-- 顶部品牌条 -->
    <div class="mh-brandbar">
      <img :src="logoPath" :alt="APP_NAME.full" class="mh-brandbar-logo" />
      <div class="mh-brandbar-text">
        <div class="mh-eyebrow">{{ APP_NAME.en }} {{ APP_NAME.zh }}</div>
        <div class="mh-wordmark">{{ APP_NAME.description.en }}</div>
      </div>
    </div>

    <!-- 问候语 -->
    <section class="mh-greeting">
      <h1 class="mh-greeting-title">
        {{ greeting }}，<br />
        <span class="mh-greeting-name">欢迎回来</span>。
      </h1>
      <p class="mh-greeting-sub">
        <template v-if="continueReadingBook">
          上次停在《{{ continueReadingBook.title }}》。
        </template>
        <template v-else> 开启今晚的翻译旅程吧。 </template>
      </p>
    </section>

    <!-- 继续翻译 Hero -->
    <section v-if="continueReadingBook" class="mh-section">
      <div class="mh-cta" role="button" @click="navigateToBookDetails(continueReadingBook)">
        <div class="mh-cta-cover">
          <img
            :src="getCoverUrl(continueReadingBook)"
            :alt="continueReadingBook.title"
            loading="lazy"
          />
          <div class="mh-cta-cover-overlay" />
        </div>
        <div class="mh-cta-body">
          <div class="mh-cta-kicker">继续翻译</div>
          <div class="mh-cta-title">{{ continueReadingBook.title }}</div>
          <div v-if="continueReadingBook.author" class="mh-cta-author">
            {{ continueReadingBook.author }}
          </div>
          <div class="mh-cta-meta">
            <span>{{ getTotalChapters(continueReadingBook) }} 章</span>
            <span class="mh-dot">·</span>
            <span>更新于 {{ formatDate(continueReadingBook.lastEdited) }}</span>
          </div>
        </div>
        <i class="pi pi-arrow-right mh-cta-arrow" aria-hidden="true" />
      </div>
    </section>

    <!-- 统计网格 2x2 -->
    <section class="mh-section">
      <div class="mh-stats-grid">
        <div class="mh-stat-card">
          <div class="mh-stat-head">
            <span class="mh-stat-label">书籍</span>
            <i class="pi pi-book mh-stat-icon mh-stat-icon--tsukuyomi" />
          </div>
          <div class="mh-stat-value">{{ totalBooks }}</div>
        </div>
        <div class="mh-stat-card">
          <div class="mh-stat-head">
            <span class="mh-stat-label">章节</span>
            <i class="pi pi-list mh-stat-icon mh-stat-icon--green" />
          </div>
          <div class="mh-stat-value">{{ totalChapters }}</div>
        </div>
        <div class="mh-stat-card">
          <div class="mh-stat-head">
            <span class="mh-stat-label">字数</span>
            <i class="pi pi-file-edit mh-stat-icon mh-stat-icon--moon" />
          </div>
          <div class="mh-stat-value">{{ formatWordCount(totalWords) }}</div>
        </div>
        <div class="mh-stat-card">
          <div class="mh-stat-head">
            <span class="mh-stat-label">收藏</span>
            <i class="pi pi-star-fill mh-stat-icon mh-stat-icon--warning" />
          </div>
          <div class="mh-stat-value">{{ starredBooks }}</div>
        </div>
      </div>
    </section>

    <!-- 最近编辑 -->
    <section v-if="recentBooks.length > 0" class="mh-section">
      <header class="mh-section-head">
        <span class="mh-section-title">最近编辑</span>
        <button class="mh-section-link" @click="navigateToBooks">
          查看全部 <i class="pi pi-arrow-right" aria-hidden="true" />
        </button>
      </header>
      <div class="mh-recent-grid">
        <div
          v-for="book in recentBooks.slice(0, 3)"
          :key="book.id"
          class="mh-recent-card"
          role="button"
          @click="navigateToBookDetails(book)"
        >
          <div class="mh-recent-cover">
            <img :src="getCoverUrl(book)" :alt="book.title" loading="lazy" />
            <i v-if="book.starred" class="pi pi-star-fill mh-recent-star" aria-hidden="true" />
          </div>
          <div class="mh-recent-title">{{ book.title }}</div>
          <div v-if="isLoadingCharCount(book)" class="mh-recent-meta">
            <Skeleton width="36px" height="10px" />
          </div>
          <div v-else class="mh-recent-meta">
            {{ formatWordCount(getTotalWords(book)) }} 字
          </div>
        </div>
      </div>
    </section>

    <!-- 快速操作 -->
    <section class="mh-section mh-section--last">
      <header class="mh-section-head">
        <span class="mh-section-title">快速操作</span>
      </header>
      <div class="mh-actions-grid">
        <Button
          label="添加书籍"
          icon="pi pi-plus"
          class="p-button-primary mh-action-btn"
          @click="addBook"
        />
        <Button
          label="从网站导入"
          icon="pi pi-globe"
          class="p-button-outlined mh-action-btn"
          @click="importBookFromWeb"
        />
      </div>
    </section>

    <!-- 空状态（手机端） -->
    <div v-if="booksStore.isLoaded && booksStore.books.length === 0" class="mh-empty">
      <i class="pi pi-book mh-empty-icon" aria-hidden="true" />
      <div class="mh-empty-title">还没有书籍</div>
      <div class="mh-empty-sub">开始添加您的第一本书籍吧</div>
    </div>

    <!-- 加载状态（手机端） -->
    <div v-else-if="booksStore.isLoading || !booksStore.isLoaded" class="mh-loading">
      <ProgressSpinner
        style="width: 36px; height: 36px"
        stroke-width="4"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <span>正在加载数据…</span>
    </div>

    <BookDialog
      v-model:visible="showAddDialog"
      mode="add"
      @save="handleSave"
      @cancel="showAddDialog = false"
    />
    <NovelScraperDialog
      v-model:visible="showImportDialog"
      :current-book="null"
      @apply="handleImportBook"
    />
  </div>

  <!-- ─────────────── 桌面端 / 平板 ─────────────── -->
  <div v-else class="w-full h-full overflow-y-auto">
    <div class="max-w-7xl mx-auto p-6 space-y-6">
      <!-- 欢迎区域 -->
      <div class="text-center py-12 space-y-6">
        <div class="flex flex-col items-center gap-6">
          <div class="flex items-center gap-5">
            <img
              :src="logoPath"
              :alt="APP_NAME.full"
              class="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-2xl shadow-lg ring-2 ring-white/10 transition-transform hover:scale-105"
            />
            <div class="flex flex-col text-left">
              <span class="text-xl sm:text-2xl uppercase tracking-[0.3em] text-moon-50 font-light"
                >{{ APP_NAME.en }} {{ APP_NAME.zh }}</span
              >
              <span class="text-2xl sm:text-3xl font-bold text-moon-100 tracking-wide">{{
                APP_NAME.description.en
              }}</span>
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

      <!-- 加载状态 -->
      <Card v-else-if="booksStore.isLoading || !booksStore.isLoaded">
        <template #content>
          <div class="flex items-center justify-center py-12">
            <div class="text-center">
              <ProgressSpinner
                style="width: 50px; height: 50px"
                strokeWidth="4"
                animationDuration=".8s"
                aria-label="加载中"
              />
              <p class="text-moon/70 mt-4">正在加载数据...</p>
            </div>
          </div>
        </template>
      </Card>

      <!-- 空状态 -->
      <Card v-else-if="booksStore.isLoaded && booksStore.books.length === 0">
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

/* ───────────────── 手机端 Home ───────────────── */
.mobile-home {
  padding: 12px 0 32px;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.mh-brandbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 20px 16px;
}

.mh-brandbar-logo {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.mh-brandbar-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mh-eyebrow {
  font-weight: 300;
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(247, 244, 236, 0.55);
}

.mh-wordmark {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  margin-top: 2px;
  letter-spacing: -0.01em;
}

.mh-greeting {
  padding: 4px 20px 4px;
}

.mh-greeting-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 24px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.01em;
  line-height: 1.3;
  margin: 0;
}

.mh-greeting-name {
  color: #a3b7cf;
}

.mh-greeting-sub {
  font-size: 13px;
  color: rgba(247, 244, 236, 0.7);
  margin-top: 8px;
  line-height: 1.6;
}

.mh-section {
  padding: 16px 20px 0;
}

.mh-section--last {
  padding-bottom: 8px;
}

.mh-section-head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.mh-section-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.mh-section-link {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 2px;
  font-size: 12px;
  font-weight: 500;
  color: #a3b7cf;
  background: transparent;
  border: none;
  cursor: pointer;
}

.mh-section-link i {
  font-size: 10px;
}

/* 继续翻译 CTA */
.mh-cta {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px;
  background: linear-gradient(135deg, rgba(109, 136, 168, 0.18), rgba(109, 136, 168, 0.04));
  border: 1px solid rgba(109, 136, 168, 0.35);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(109, 136, 168, 0.3);
  cursor: pointer;
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mh-cta:active {
  transform: scale(0.99);
}

.mh-cta-cover {
  position: relative;
  width: 44px;
  height: 58px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #14161a;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.mh-cta-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mh-cta-cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.45) 100%);
}

.mh-cta-body {
  flex: 1;
  min-width: 0;
}

.mh-cta-kicker {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #bac9db;
}

.mh-cta-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  margin-top: 3px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mh-cta-author {
  font-size: 11px;
  color: rgba(247, 244, 236, 0.6);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mh-cta-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
}

.mh-dot {
  opacity: 0.5;
}

.mh-cta-arrow {
  color: #a3b7cf;
  font-size: 14px;
  flex-shrink: 0;
}

/* 统计卡片 */
.mh-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mh-stat-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
}

.mh-stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.mh-stat-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(247, 244, 236, 0.6);
}

.mh-stat-icon {
  font-size: 12px;
  opacity: 0.85;
}

.mh-stat-icon--tsukuyomi {
  color: #a3b7cf;
}

.mh-stat-icon--green {
  color: #a7d1b0;
}

.mh-stat-icon--moon {
  color: #e9edf5;
}

.mh-stat-icon--warning {
  color: #f2c037;
}

.mh-stat-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 22px;
  font-weight: 700;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.02em;
  line-height: 1;
}

/* 最近编辑网格 */
.mh-recent-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.mh-recent-card {
  cursor: pointer;
  min-width: 0;
}

.mh-recent-cover {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: #14161a;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.mh-recent-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mh-recent-star {
  position: absolute;
  top: 6px;
  right: 6px;
  color: #f2c037;
  font-size: 11px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.mh-recent-title {
  font-size: 11px;
  font-weight: 500;
  color: rgba(247, 244, 236, 0.9);
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mh-recent-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
}

/* 快速操作 */
.mh-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mh-action-btn {
  width: 100%;
  height: 44px;
}

/* 空 / 加载 */
.mh-empty,
.mh-loading {
  padding: 32px 20px;
  text-align: center;
  color: rgba(247, 244, 236, 0.6);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.mh-empty-icon {
  font-size: 42px;
  color: rgba(247, 244, 236, 0.25);
}

.mh-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: rgba(247, 244, 236, 0.85);
}

.mh-empty-sub {
  font-size: 13px;
  color: rgba(247, 244, 236, 0.55);
}
</style>
