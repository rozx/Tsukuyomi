<script setup lang="ts">
import { computed, ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import TieredMenu from 'primevue/tieredmenu';
import ConfirmDialog from 'primevue/confirmdialog';
import { useBooksStore } from 'src/stores/books';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Novel } from 'src/types/novel';
import BookDialog from 'src/components/BookDialog.vue';

const booksStore = useBooksStore();
const toast = useToastWithHistory();
const confirm = useConfirm();

// 对话框状态
const showAddDialog = ref(false);
const showEditDialog = ref(false);
const selectedBook = ref<Novel | null>(null);

// 排序菜单
const sortMenuRef = ref<{ toggle: (event: Event) => void; show: (event: Event) => void; hide: () => void } | null>(null);
const sortMenuItems = computed(() => {
  return sortOptions.map((option) => ({
    label: option.label,
    icon: selectedSort.value === option.value ? 'pi pi-check' : '',
    command: () => {
      selectedSort.value = option.value;
    },
  }));
});

// 搜索关键词
const searchQuery = ref('');

// 计算总章节数（需要在排序选项之前定义）
const getTotalChapters = (book: Novel): number => {
  if (!book.volumes || book.volumes.length === 0) {
    return 0;
  }
  return book.volumes.reduce((total, volume) => {
    return total + (volume.chapters?.length || 0);
  }, 0);
};

// 计算总字数（需要在排序选项之前定义）
const getTotalWords = (book: Novel): number => {
  if (!book.volumes || book.volumes.length === 0) {
    return 0;
  }
  let totalWords = 0;
  book.volumes.forEach((volume) => {
    if (volume.chapters) {
      volume.chapters.forEach((chapter) => {
        if (chapter.content) {
          chapter.content.forEach((paragraph) => {
            if (paragraph.text) {
              // 中文字符按字计算，其他按单词计算
              const chineseChars = paragraph.text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
              const otherWords = paragraph.text.replace(/[\u4e00-\u9fa5]/g, '').trim().split(/\s+/).filter(w => w.length > 0).length;
              totalWords += chineseChars + otherWords;
            }
          });
        }
      });
    }
  });
  return totalWords;
};

// 排序选项
type SortOption = {
  label: string;
  value: string;
  sortFn: (a: Novel, b: Novel) => number;
};

const sortOptions: SortOption[] = [
  {
    label: '默认',
    value: 'default',
    sortFn: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  },
  {
    label: '标题 (A-Z)',
    value: 'title-asc',
    sortFn: (a, b) => a.title.localeCompare(b.title, 'zh-CN'),
  },
  {
    label: '标题 (Z-A)',
    value: 'title-desc',
    sortFn: (a, b) => b.title.localeCompare(a.title, 'zh-CN'),
  },
  {
    label: '创建时间 (最新)',
    value: 'created-desc',
    sortFn: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  },
  {
    label: '创建时间 (最早)',
    value: 'created-asc',
    sortFn: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  },
  {
    label: '更新时间 (最新)',
    value: 'updated-desc',
    sortFn: (a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime(),
  },
  {
    label: '更新时间 (最早)',
    value: 'updated-asc',
    sortFn: (a, b) => new Date(a.lastEdited).getTime() - new Date(b.lastEdited).getTime(),
  },
  {
    label: '章节数 (多→少)',
    value: 'chapters-desc',
    sortFn: (a, b) => getTotalChapters(b) - getTotalChapters(a),
  },
  {
    label: '章节数 (少→多)',
    value: 'chapters-asc',
    sortFn: (a, b) => getTotalChapters(a) - getTotalChapters(b),
  },
  {
    label: '字数 (多→少)',
    value: 'words-desc',
    sortFn: (a, b) => getTotalWords(b) - getTotalWords(a),
  },
  {
    label: '字数 (少→多)',
    value: 'words-asc',
    sortFn: (a, b) => getTotalWords(a) - getTotalWords(b),
  },
  {
    label: '收藏优先',
    value: 'starred',
    sortFn: (a, b) => {
      const aStarred = a.starred || false;
      const bStarred = b.starred || false;
      if (aStarred === bStarred) {
        return new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime();
      }
      return aStarred ? -1 : 1;
    },
  },
];

const selectedSort = ref(sortOptions[0]?.value || 'default');

// 过滤和排序后的书籍列表
const filteredBooks = computed(() => {
  let books = booksStore.books;

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    books = books.filter((book) => {
      const title = book.title.toLowerCase();
      const alternateTitles = book.alternateTitles?.join(' ').toLowerCase() || '';
      const author = book.author?.toLowerCase() || '';
      const description = book.description?.toLowerCase() || '';
      const tags = book.tags?.join(' ').toLowerCase() || '';
      return (
        title.includes(query) ||
        alternateTitles.includes(query) ||
        author.includes(query) ||
        description.includes(query) ||
        tags.includes(query)
      );
    });
  }

  // 排序
  const sortedBooks = [...books];
  const sortOption = sortOptions.find(opt => opt.value === selectedSort.value);
  if (sortOption) {
    sortedBooks.sort(sortOption.sortFn);
  }

  return sortedBooks;
});

// 获取封面图片 URL，如果没有则返回默认占位图
const getCoverUrl = (book: Novel): string => {
  if (book.cover?.url) {
    return book.cover.url;
  }
  // 生成带有书籍标题和作者的默认封面
  const title = (book.title || '未命名').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const author = (book.author || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 将标题分行（每行最多10个字符）
  const titleLines: string[] = [];
  const words = title.split('');
  let currentLine = '';
  for (let i = 0; i < words.length; i++) {
    const char = words[i];
    if (char && currentLine.length >= 10 && char !== ' ') {
      titleLines.push(currentLine.trim());
      currentLine = char;
    } else if (char) {
      currentLine += char;
    }
  }
  if (currentLine) {
    titleLines.push(currentLine.trim());
  }
  const displayTitle = titleLines.slice(0, 3).join('\n');

  // 创建 SVG，使用书籍的实际信息
  const svg = `
    <svg width="200" height="300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="coverGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
        </linearGradient>
      </defs>
      <!-- 背景 -->
      <rect width="200" height="300" fill="url(#coverGrad)"/>
      <!-- 顶部装饰线 -->
      <line x1="20" y1="40" x2="180" y2="40" stroke="rgba(85,103,242,0.3)" stroke-width="2"/>
      <!-- 标题 -->
      <text x="100" y="120" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="rgba(246,243,209,0.9)" text-anchor="middle" dominant-baseline="middle">
        ${displayTitle.split('\n').map((line, i) => `<tspan x="100" dy="${i === 0 ? '0' : '20'}">${line}</tspan>`).join('')}
      </text>
      <!-- 作者 -->
      ${author ? `<text x="100" y="240" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="rgba(246,243,209,0.6)" text-anchor="middle" dominant-baseline="middle">${author}</text>` : ''}
      <!-- 底部装饰线 -->
      <line x1="20" y1="260" x2="180" y2="260" stroke="rgba(85,103,242,0.3)" stroke-width="2"/>
    </svg>
  `.trim().replace(/\s+/g, ' ');

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

// 格式化字数
const formatWordCount = (count: number): string => {
  if (count === 0) return '0';
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 10000).toFixed(1)}万`;
};

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

// 添加书籍
const addBook = () => {
  selectedBook.value = null;
  showAddDialog.value = true;
};

// 编辑书籍
const editBook = (book: Novel) => {
  selectedBook.value = { ...book };
  showEditDialog.value = true;
};

// 删除书籍
const deleteBook = (book: Novel) => {
  confirm.require({
    message: `确定要删除书籍 "${book.title}" 吗？此操作无法撤销。`,
    header: '确认删除',
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-text',
    acceptClass: 'p-button-danger',
    rejectLabel: '取消',
    acceptLabel: '删除',
    accept: () => {
      const bookTitle = book.title;
      booksStore.deleteBook(book.id);
      toast.add({
        severity: 'success',
        summary: '删除成功',
        detail: `已成功删除书籍 "${bookTitle}"`,
        life: 3000,
      });
    },
  });
};

// 切换收藏状态
const toggleStar = (book: Novel) => {
  const isStarred = book.starred || false;
  booksStore.updateBook(book.id, { starred: !isStarred });
  toast.add({
    severity: 'success',
    summary: isStarred ? '已取消收藏' : '已收藏',
    detail: `已${isStarred ? '取消收藏' : '收藏'}书籍 "${book.title}"`,
    life: 2000,
  });
};

// 保存书籍（添加或编辑）
const handleSave = (formData: Partial<Novel>) => {
  if (showAddDialog.value) {
    // 添加新书籍
    const now = new Date();
    const newBook: Novel = {
      id: uuidv4(),
      title: formData.title!,
      ...(formData.alternateTitles && formData.alternateTitles.length > 0 ? { alternateTitles: formData.alternateTitles } : {}),
      ...(formData.author?.trim() ? { author: formData.author.trim() } : {}),
      ...(formData.description?.trim() ? { description: formData.description.trim() } : {}),
      ...(formData.tags && formData.tags.length > 0 ? { tags: formData.tags } : {}),
      ...(formData.webUrl && formData.webUrl.length > 0 ? { webUrl: formData.webUrl } : {}),
      ...(formData.cover ? { cover: formData.cover } : {}),
      createdAt: now,
      lastEdited: now,
    };
    booksStore.addBook(newBook);
    showAddDialog.value = false;
    toast.add({
      severity: 'success',
      summary: '添加成功',
      detail: `已成功添加书籍 "${newBook.title}"`,
      life: 3000,
    });
  } else if (showEditDialog.value && selectedBook.value) {
    // 更新现有书籍
    const updates: Partial<Novel> = {
      title: formData.title!,
      lastEdited: new Date(),
    };
    if (formData.alternateTitles && formData.alternateTitles.length > 0) {
      updates.alternateTitles = formData.alternateTitles;
    }
    if (formData.author?.trim()) {
      updates.author = formData.author.trim();
    }
    if (formData.description?.trim()) {
      updates.description = formData.description.trim();
    }
    if (formData.tags && formData.tags.length > 0) {
      updates.tags = formData.tags;
    }
    if (formData.webUrl && formData.webUrl.length > 0) {
      updates.webUrl = formData.webUrl;
    }
    // 处理封面：如果提供了封面就更新，如果为 null 就删除封面
    if (formData.cover !== undefined) {
      updates.cover = formData.cover;
    }
    booksStore.updateBook(selectedBook.value.id, updates);
    showEditDialog.value = false;
    const bookTitle = updates.title || selectedBook.value.title;
    selectedBook.value = null;
    toast.add({
      severity: 'success',
      summary: '更新成功',
      detail: `已成功更新书籍 "${bookTitle}"`,
      life: 3000,
    });
  }
};
</script>

<template>
  <div class="w-full h-full p-6 space-y-6">
    <!-- 头部 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">书籍列表</h1>
        <p class="text-moon/70 mt-1">管理您的翻译书籍</p>
      </div>
      <div class="flex items-center gap-3">
        <InputGroup class="search-input-group">
          <InputGroupAddon>
            <i class="pi pi-search text-base" />
          </InputGroupAddon>
          <InputText
            v-model="searchQuery"
            placeholder="搜索书籍标题、别名、作者、描述或标签..."
            class="search-input"
          />
          <InputGroupAddon v-if="searchQuery" class="clear-addon">
            <Button
              icon="pi pi-times"
              class="p-button-text p-button-sm clear-button"
              @click="searchQuery = ''"
              title="清除搜索"
            />
          </InputGroupAddon>
        </InputGroup>
        <Button
          :label="sortOptions.find(opt => opt.value === selectedSort)?.label || '排序'"
          icon="pi pi-sort-alt"
          iconPos="right"
          class="p-button-outlined icon-button-hover"
          @click="(e: Event) => {
            const menu = sortMenuRef;
            if (menu) {
              menu.toggle(e);
            }
          }"
        />
        <Button
          label="添加书籍"
          icon="pi pi-plus"
          class="p-button-primary icon-button-hover"
          @click="addBook"
        />
      </div>
    </div>

    <!-- DataView 内容区域 -->
    <DataView
      :value="filteredBooks"
      data-key="id"
      :rows="20"
      :paginator="filteredBooks.length > 0"
      :rows-per-page-options="[10, 20, 50, 100]"
      paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
      layout="grid"
    >
      <template #empty>
        <div class="text-center py-12">
          <i class="pi pi-book text-4xl text-moon/50 mb-4 icon-hover" />
          <p class="text-moon/70">
            {{ searchQuery ? '未找到匹配的书籍' : '暂无书籍' }}
          </p>
          <Button
            v-if="!searchQuery"
            label="添加第一本书籍"
            icon="pi pi-plus"
            class="p-button-primary mt-4 icon-button-hover"
            @click="addBook"
          />
        </div>
      </template>

      <template #grid="slotProps">
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
          <div
            v-for="book in slotProps.items"
            :key="book.id"
            class="book-card group"
          >
            <!-- 封面 -->
            <div class="relative w-full aspect-[2/3] overflow-hidden rounded-t-lg bg-[rgba(255,255,255,0.05)] mb-2">
              <img
                :src="getCoverUrl(book)"
                :alt="book.title"
                class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                @error="(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = getCoverUrl(book);
                }"
              />
            </div>
            <!-- 内容 -->
            <div class="px-1 pb-2 space-y-1.5">
              <h3 class="text-sm font-semibold line-clamp-2 group-hover:text-primary transition-colors cursor-pointer" :title="book.title">
                {{ book.title }}
              </h3>
              <p v-if="book.author" class="text-xs text-moon/60 line-clamp-1">
                {{ book.author }}
              </p>

              <!-- 统计信息 -->
              <div class="text-[10px] text-moon/50 space-y-0.5 pt-1 border-t border-white/5">
                <div class="flex items-center justify-between">
                  <span>章节:</span>
                  <span class="font-medium">{{ getTotalChapters(book) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>字数:</span>
                  <span class="font-medium">{{ formatWordCount(getTotalWords(book)) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>创建:</span>
                  <span class="font-medium">{{ formatDate(book.createdAt) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>更新:</span>
                  <span class="font-medium">{{ formatDate(book.lastEdited) }}</span>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="flex items-center gap-1 pt-1.5 border-t border-white/5">
                <Button
                  :icon="book.starred ? 'pi pi-star-fill' : 'pi pi-star'"
                  :class="[
                    'p-button-text p-button-sm flex-1 !text-xs !py-1 !px-2',
                    book.starred ? '!text-yellow-400' : ''
                  ]"
                  @click.stop="toggleStar(book)"
                  :title="book.starred ? '取消收藏' : '收藏'"
                />
                <Button
                  icon="pi pi-pencil"
                  class="p-button-text p-button-sm flex-1 !text-xs !py-1 !px-2"
                  @click.stop="editBook(book)"
                  title="编辑"
                />
                <Button
                  icon="pi pi-trash"
                  class="p-button-text p-button-sm p-button-danger flex-1 !text-xs !py-1 !px-2"
                  @click.stop="deleteBook(book)"
                  title="删除"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </DataView>

    <!-- 添加对话框 -->
    <BookDialog
      v-model:visible="showAddDialog"
      mode="add"
      @save="handleSave"
      @cancel="showAddDialog = false"
    />

    <!-- 编辑对话框 -->
    <BookDialog
      v-model:visible="showEditDialog"
      mode="edit"
      :book="selectedBook"
      @save="handleSave"
      @cancel="showEditDialog = false"
    />

    <!-- 确认对话框 -->
    <ConfirmDialog />

    <!-- 排序菜单 -->
    <TieredMenu ref="sortMenuRef" :model="sortMenuItems" popup />
  </div>
</template>

<style scoped>
.book-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.book-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
</style>
