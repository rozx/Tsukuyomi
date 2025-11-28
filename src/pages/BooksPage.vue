<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { v4 as uuidv4 } from 'uuid';
import Button from 'primevue/button';
import SplitButton from 'primevue/splitbutton';
import DataView from 'primevue/dataview';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import TieredMenu from 'primevue/tieredmenu';
import ConfirmDialog from 'primevue/confirmdialog';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useNovelCharCount } from 'src/composables/useNovelCharCount';
import { useContextStore } from 'src/stores/context';
import { CoverService } from 'src/services/cover-service';
import type { Novel } from 'src/models/novel';
import BookDialog from 'src/components/dialogs/BookDialog.vue';
import NovelScraperDialog from 'src/components/dialogs/NovelScraperDialog.vue';
import {
  formatWordCount,
  getTotalChapters as utilGetTotalChapters,
} from 'src/utils';
import { cloneDeep } from 'lodash';

const router = useRouter();
const booksStore = useBooksStore();
const coverHistoryStore = useCoverHistoryStore();
const contextStore = useContextStore();
const toast = useToastWithHistory();

// 对话框状态
const showAddDialog = ref(false);
const showEditDialog = ref(false);
const showImportDialog = ref(false);
const selectedBook = ref<Novel | null>(null);

// 删除确认对话框状态
const showDeleteConfirm = ref(false);
const deleteConfirmInput = ref('');
const bookToDelete = ref<Novel | null>(null);

// 文件输入引用（用于导入 JSON）
const fileInputRef = ref<HTMLInputElement | null>(null);

// 排序菜单
const sortMenuRef = ref<{
  toggle: (event: Event) => void;
  show: (event: Event) => void;
  hide: () => void;
} | null>(null);
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

// 使用工具函数计算（需要在排序选项之前定义）
const getTotalChapters = utilGetTotalChapters;

// 使用字符数加载 composable
const {
  loadBookCharCount,
  getTotalWords,
  isLoadingCharCount,
  clearCache: clearCharCountCache,
} = useNovelCharCount();

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

// 分割按钮菜单项
const addBookMenuItems = computed(() => [
  {
    label: '从网站导入',
    icon: 'pi pi-globe',
    command: () => {
      importBookFromWeb();
    },
  },
  {
    label: '从 JSON 导入',
    icon: 'pi pi-file-import',
    command: () => {
      importBookFromJson();
    },
  },
]);

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
  const sortOption = sortOptions.find((opt) => opt.value === selectedSort.value);
  if (sortOption) {
    sortedBooks.sort(sortOption.sortFn);
  }

  return sortedBooks;
});

// 加载所有书籍的字符数
const loadAllBookCharCounts = async () => {
  const books = filteredBooks.value;
  const loadPromises = books.map((book) => loadBookCharCount(book));
  await Promise.all(loadPromises);
};

// 当书籍列表变化时，异步加载字符数
watch(
  () => filteredBooks.value,
  async (books) => {
    await loadAllBookCharCounts();
  },
  { immediate: true },
);

// 当书籍存储变化时，清除缓存并重新加载
watch(
  () => booksStore.books,
  async () => {
    clearCharCountCache();
    await loadAllBookCharCounts();
  },
);

// 组件挂载时也加载一次
onMounted(async () => {
  await loadAllBookCharCounts();
});

// 获取封面图片 URL，如果没有则返回默认占位图
const getCoverUrl = (book: Novel): string => {
  return CoverService.getCoverUrl(book);
};

// 格式化字数（使用工具函数）
// formatWordCount 已从 utils 导入

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
  // 清除上下文（添加新书籍时没有当前书籍）
  contextStore.clearContext();
};

// 从网站导入书籍
const importBookFromWeb = () => {
  showImportDialog.value = true;
};

// 从 JSON 文件导入书籍
const importBookFromJson = () => {
  fileInputRef.value?.click();
};

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    return;
  }

  // 验证文件类型
  const isValidFile =
    file.type.includes('json') || file.name.endsWith('.json') || file.name.endsWith('.txt');

  if (!isValidFile) {
    toast.add({
      severity: 'error',
      summary: '导入失败',
      detail: '请选择 JSON 或 TXT 格式的文件',
      life: 3000,
    });
    target.value = '';
    return;
  }

  try {
    // 读取文件
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = () => {
        reject(new Error('读取文件时发生错误'));
      };
      reader.readAsText(file);
    });

    // 解析 JSON
    const data = JSON.parse(content);

    // 处理导入的数据
    let importedBooks: Novel[] = [];

    // 如果数据是数组，直接使用
    if (Array.isArray(data)) {
      importedBooks = data;
    }
    // 如果数据是单个书籍对象
    else if (data && typeof data === 'object' && data.title) {
      importedBooks = [data];
    }
    // 如果数据包含 novels 字段（Settings 格式）
    else if (data.novels && Array.isArray(data.novels)) {
      importedBooks = data.novels;
    }
    // 如果数据包含单个 novel 字段
    else if (data.novel && typeof data.novel === 'object') {
      importedBooks = [data.novel];
    } else {
      throw new Error('无法识别的文件格式。请确保文件包含书籍数据。');
    }

    if (importedBooks.length === 0) {
      throw new Error('文件中没有找到有效的书籍数据');
    }

    // 验证并导入书籍
    const now = new Date();
    let successCount = 0;
    let errorCount = 0;
    const importedIds: string[] = [];

    for (const bookData of importedBooks) {
      try {
        // 验证必需字段
        if (!bookData.title || typeof bookData.title !== 'string') {
          errorCount++;
          continue;
        }

        // 创建新书籍对象
        const newBook: Novel = {
          id: uuidv4(),
          title: bookData.title,
          ...(bookData.alternateTitles && Array.isArray(bookData.alternateTitles)
            ? { alternateTitles: bookData.alternateTitles }
            : {}),
          ...(bookData.author && typeof bookData.author === 'string'
            ? { author: bookData.author }
            : {}),
          ...(bookData.description && typeof bookData.description === 'string'
            ? { description: bookData.description }
            : {}),
          ...(bookData.tags && Array.isArray(bookData.tags) ? { tags: bookData.tags } : {}),
          ...(bookData.webUrl && Array.isArray(bookData.webUrl) ? { webUrl: bookData.webUrl } : {}),
          ...(bookData.cover && typeof bookData.cover === 'object' && bookData.cover.url
            ? { cover: bookData.cover }
            : {}),
          ...(bookData.volumes && Array.isArray(bookData.volumes)
            ? { volumes: bookData.volumes }
            : {}),
          ...(bookData.starred !== undefined ? { starred: Boolean(bookData.starred) } : {}),
          createdAt: bookData.createdAt ? new Date(bookData.createdAt) : now,
          lastEdited: bookData.lastEdited ? new Date(bookData.lastEdited) : now,
        };

        await booksStore.addBook(newBook);
        importedIds.push(newBook.id);

        // 如果书籍有封面，添加到封面历史
        if (newBook.cover) {
          void coverHistoryStore.addCover(newBook.cover);
        }

        successCount++;
      } catch (error) {
        console.error('导入书籍时出错:', error);
        errorCount++;
      }
    }

    // 显示结果
    if (successCount > 0) {
      const idsToDelete = [...importedIds];
      toast.add({
        severity: 'success',
        summary: '导入成功',
        detail: `成功导入 ${successCount} 本书籍${errorCount > 0 ? `，${errorCount} 本失败` : ''}`,
        life: 3000,
        onRevert: async () => {
          for (const id of idsToDelete) {
            await booksStore.deleteBook(id);
          }
        },
      });
    } else {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: `未能导入任何书籍${errorCount > 0 ? `（${errorCount} 本失败）` : ''}`,
        life: 3000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导入失败',
      detail: error instanceof Error ? error.message : '解析文件时发生未知错误',
      life: 5000,
    });
  }

  // 清空输入
  target.value = '';
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

// 编辑书籍
const editBook = (book: Novel) => {
  selectedBook.value = { ...book };
  showEditDialog.value = true;
  // 更新上下文：设置当前书籍，清除章节和段落
  contextStore.setContext({
    currentBookId: book.id,
    currentChapterId: null,
    hoveredParagraphId: null,
  });
};

// 删除书籍
const deleteBook = (book: Novel) => {
  bookToDelete.value = book;
  deleteConfirmInput.value = '';
  showDeleteConfirm.value = true;
};

// 删除加载状态
const isDeletingBook = ref(false);

// 确认删除书籍
const confirmDeleteBook = async () => {
  if (!bookToDelete.value || isDeletingBook.value) {
    return;
  }

  const bookTitle = bookToDelete.value.title;

  // 检查用户输入的标题是否匹配（不区分大小写，去除首尾空格）
  const inputTitle = deleteConfirmInput.value.trim();
  if (inputTitle !== bookTitle) {
    toast.add({
      severity: 'error',
      summary: '标题不匹配',
      detail: '输入的标题与书籍标题不一致，请重新输入',
      life: 3000,
    });
    return;
  }

  isDeletingBook.value = true;
  try {
    // 执行删除
    // 深拷贝保存原始数据用于撤销
    const bookToRestore = cloneDeep(bookToDelete.value);
    await booksStore.deleteBook(bookToDelete.value.id);

    // 关闭对话框
    showDeleteConfirm.value = false;
    deleteConfirmInput.value = '';
    bookToDelete.value = null;

    toast.add({
      severity: 'success',
      summary: '删除成功',
      detail: `已成功删除书籍 "${bookTitle}"`,
      life: 3000,
      onRevert: () => booksStore.addBook(bookToRestore),
    });
  } finally {
    isDeletingBook.value = false;
  }
};

// 取消删除
const cancelDeleteBook = () => {
  showDeleteConfirm.value = false;
  deleteConfirmInput.value = '';
  bookToDelete.value = null;
};

// 复制书籍标题并填充到输入框
const copyBookTitle = async () => {
  if (!bookToDelete.value) {
    return;
  }

  const title = bookToDelete.value.title;

  try {
    // 复制到剪贴板
    await navigator.clipboard.writeText(title);
    // 同时填充到输入框，方便用户直接粘贴或修改
    deleteConfirmInput.value = title;
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '书籍标题已复制并填充到输入框',
      life: 2000,
    });
  } catch {
    // 即使复制失败，也填充到输入框
    deleteConfirmInput.value = title;
    toast.add({
      severity: 'info',
      summary: '已填充',
      detail: '书籍标题已填充到输入框（复制到剪贴板失败）',
      life: 2000,
    });
  }
};

// 计算删除按钮是否可用
const isDeleteDisabled = computed(() => {
  if (!bookToDelete.value) {
    return true;
  }
  return deleteConfirmInput.value.trim() !== bookToDelete.value.title;
});

// 切换收藏状态
const toggleStar = async (book: Novel) => {
  const isStarred = book.starred || false;
  await booksStore.updateBook(book.id, { starred: !isStarred });
  toast.add({
    severity: 'success',
    summary: isStarred ? '已取消收藏' : '已收藏',
    detail: `已${isStarred ? '取消收藏' : '收藏'}书籍 "${book.title}"`,
    life: 2000,
  });
};

// 导航到书籍详情页
const navigateToBookDetails = (book: Novel) => {
  void router.push(`/books/${book.id}`);
};

// 保存书籍（添加或编辑）
const handleSave = async (formData: Partial<Novel>) => {
  if (showAddDialog.value) {
    // 添加新书籍
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
    // 处理 volumes：如果提供了 volumes 就更新
    if (formData.volumes !== undefined) {
      updates.volumes = formData.volumes;
    }

    // 深拷贝保存原始数据用于撤销
    const oldBook = cloneDeep(selectedBook.value);
    await booksStore.updateBook(selectedBook.value.id, updates);
    showEditDialog.value = false;
    const bookTitle = updates.title || selectedBook.value.title;
    selectedBook.value = null;
    toast.add({
      severity: 'success',
      summary: '更新成功',
      detail: `已成功更新书籍 "${bookTitle}"`,
      life: 3000,
      onRevert: () => booksStore.updateBook(oldBook.id, oldBook),
    });
  }
};
</script>

<template>
  <div class="w-full h-full flex flex-col p-6">
    <!-- 头部 -->
    <div class="flex items-center justify-between mb-6 flex-shrink-0 gap-4">
      <div class="flex-shrink-0">
        <h1 class="text-2xl font-bold">书籍列表</h1>
        <p class="text-moon/70 mt-1">管理您的翻译书籍</p>
      </div>
      <div class="flex items-center gap-3 flex-nowrap flex-shrink-0">
        <InputGroup class="search-input-group min-w-0 flex-shrink">
          <InputGroupAddon>
            <i class="pi pi-search text-base" />
          </InputGroupAddon>
          <InputText
            v-model="searchQuery"
            placeholder="搜索书籍标题、别名、作者、描述或标签..."
            class="search-input"
          />
          <InputGroupAddon v-if="searchQuery" class="input-action-addon">
            <Button
              icon="pi pi-times"
              class="p-button-text p-button-sm input-action-button"
              @click="searchQuery = ''"
              title="清除搜索"
            />
          </InputGroupAddon>
        </InputGroup>
        <Button
          :label="sortOptions.find((opt) => opt.value === selectedSort)?.label || '排序'"
          icon="pi pi-sort-alt"
          iconPos="right"
          class="p-button-outlined icon-button-hover flex-shrink-0"
          @click="
            (e: Event) => {
              const menu = sortMenuRef;
              if (menu) {
                menu.toggle(e);
              }
            }
          "
        />
        <SplitButton
          label="添加书籍"
          icon="pi pi-plus"
          :model="addBookMenuItems"
          class="p-button-primary icon-button-hover flex-shrink-0"
          @click="addBook"
        />
      </div>
    </div>

    <!-- DataView 内容区域 -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- 加载指示器 -->
      <div v-if="booksStore.isLoading" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <ProgressSpinner
            style="width: 50px; height: 50px"
            strokeWidth="4"
            animationDuration=".8s"
            aria-label="加载中"
          />
          <p class="text-moon/70 mt-4">正在加载书籍列表...</p>
        </div>
      </div>
      <!-- 书籍列表 -->
      <DataView
        v-else
        :value="filteredBooks"
        data-key="id"
        :rows="20"
        :paginator="filteredBooks.length > 0"
        :rows-per-page-options="[10, 20, 50, 100]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
        layout="grid"
        class="flex-1 flex flex-col min-h-0"
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
          <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 items-stretch"
          >
            <div
              v-for="book in slotProps.items"
              :key="book.id"
              class="book-card group flex flex-col h-full"
            >
              <!-- 封面 -->
              <div
                class="relative w-full aspect-[2/3] overflow-hidden rounded-t-lg bg-white/5 mb-2 cursor-pointer"
                @click="navigateToBookDetails(book)"
              >
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
              <div class="px-1 pb-2 space-y-1.5 flex flex-col flex-1">
                <h3
                  class="text-sm font-semibold line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors cursor-pointer"
                  :title="book.title"
                  @click="navigateToBookDetails(book)"
                >
                  {{ book.title }}
                </h3>
                <p v-if="book.author" class="text-xs text-moon/60 line-clamp-1">
                  {{ book.author }}
                </p>

                <!-- 统计信息 -->
                <div
                  class="text-[10px] text-moon/50 space-y-0.5 pt-1 border-t border-white/5 mt-auto"
                >
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
                      book.starred ? '!text-yellow-400' : '',
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
    </div>

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

    <!-- 从网站导入对话框 -->
    <NovelScraperDialog
      v-model:visible="showImportDialog"
      :current-book="null"
      @apply="handleImportBook"
    />

    <!-- 确认对话框 -->
    <ConfirmDialog />

    <!-- 删除确认对话框 -->
    <Dialog
      v-model:visible="showDeleteConfirm"
      modal
      header="确认删除"
      :style="{ width: '30rem', maxWidth: '90vw' }"
      class="delete-confirm-dialog"
    >
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <i class="pi pi-exclamation-triangle text-2xl text-yellow-400 flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="text-moon/90 mb-2">
              确定要删除书籍 <strong class="text-moon/95">"{{ bookToDelete?.title }}"</strong> 吗？
            </p>
            <p class="text-sm text-moon/70 mb-4">请在下方的输入框中输入书籍标题以确认删除。</p>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-moon/90">输入书籍标题:</label>
              <InputGroup class="w-full">
                <InputText
                  v-model="deleteConfirmInput"
                  :placeholder="bookToDelete?.title"
                  class="flex-1"
                  autofocus
                  @keyup.enter="if (!isDeleteDisabled) confirmDeleteBook();"
                />
                <InputGroupAddon class="input-action-addon">
                  <Button
                    icon="pi pi-copy"
                    class="p-button-text p-button-sm input-action-button"
                    title="复制标题"
                    @click="copyBookTitle"
                  />
                </InputGroupAddon>
              </InputGroup>
              <small class="text-xs text-moon/60 block">
                <i class="pi pi-info-circle mr-1" />
                提示：点击右侧的复制按钮会将标题复制到剪贴板并自动填充到输入框
              </small>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="取消" icon="pi pi-times" class="p-button-text" :disabled="isDeletingBook" @click="cancelDeleteBook" />
        <Button
          label="删除"
          icon="pi pi-trash"
          class="p-button-danger"
          :loading="isDeletingBook"
          :disabled="isDeleteDisabled || isDeletingBook"
          @click="confirmDeleteBook"
        />
      </template>
    </Dialog>

    <!-- 排序菜单 -->
    <TieredMenu ref="sortMenuRef" :model="sortMenuItems" popup />

    <!-- 隐藏的文件输入（用于导入 JSON） -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="handleFileSelect"
    />
  </div>
</template>

<style scoped>
.delete-confirm-dialog :deep(.p-inputgroup-addon) {
  padding: 0 !important;
  display: flex !important;
  align-items: stretch !important;
  width: auto;
}

.delete-confirm-dialog :deep(.p-inputgroup-addon .p-button) {
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0.5rem !important;
  min-width: 2.5rem;
  margin: 0 !important;
  border-radius: 0 !important;
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

/* 使 DataView 使用 flex 布局，内容可滚动，分页器固定在底部 */
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

/* 确保搜索框可以收缩，所有按钮保持在同一行 */
.search-input-group {
  min-width: 0;
  flex: 1 1 auto;
  max-width: 400px;
}

.search-input-group :deep(.p-inputtext) {
  min-width: 0;
}
</style>
