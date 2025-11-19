<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DataView from 'primevue/dataview';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dialog from 'primevue/dialog';
import Dropdown from 'primevue/dropdown';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { CoverService } from 'src/services/cover-service';
import { formatWordCount, getNovelCharCount, getTotalChapters } from 'src/utils';
import { UniqueIdGenerator, extractIds } from 'src/utils/id-generator';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { Volume, Chapter, Novel } from 'src/types/novel';
import BookDialog from 'src/components/BookDialog.vue';

const route = useRoute();
const router = useRouter();
const booksStore = useBooksStore();
const bookDetailsStore = useBookDetailsStore();
const toast = useToastWithHistory();

// 添加卷/章节对话框状态
const showAddVolumeDialog = ref(false);
const showAddChapterDialog = ref(false);
const newVolumeTitle = ref('');
const newChapterTitle = ref('');
const selectedVolumeId = ref<string | null>(null);

// 编辑卷/章节对话框状态
const showEditVolumeDialog = ref(false);
const showEditChapterDialog = ref(false);
const editingVolumeId = ref<string | null>(null);
const editingChapterId = ref<string | null>(null);
const editingVolumeTitle = ref('');
const editingChapterTitle = ref('');
const editingChapterSourceVolumeId = ref<string | null>(null);
const editingChapterTargetVolumeId = ref<string | null>(null);

// 删除确认对话框状态
const showDeleteVolumeConfirm = ref(false);
const showDeleteChapterConfirm = ref(false);
const deletingVolumeId = ref<string | null>(null);
const deletingChapterId = ref<string | null>(null);
const deletingVolumeTitle = ref('');
const deletingChapterTitle = ref('');

// 书籍编辑对话框状态
const showBookDialog = ref(false);

// 拖拽状态
const draggedChapter = ref<{ chapter: Chapter; sourceVolumeId: string; sourceIndex: number } | null>(null);
const dragOverVolumeId = ref<string | null>(null);
const dragOverIndex = ref<number | null>(null);

// 从路由参数获取书籍 ID
const bookId = computed(() => route.params.id as string);

// 切换卷的展开/折叠状态
const toggleVolume = (volumeId: string) => {
  if (!bookId.value) return;
  bookDetailsStore.toggleVolume(bookId.value, volumeId);
};

// 检查卷是否展开
const isVolumeExpanded = (volumeId: string): boolean => {
  if (!bookId.value) return false;
  return bookDetailsStore.isVolumeExpanded(bookId.value, volumeId);
};

// 获取书籍信息
const book = computed(() => {
  if (!bookId.value) return undefined;
  return booksStore.getBookById(bookId.value);
});

// 获取封面图片 URL
const getCoverUrl = (book: Novel): string => {
  return CoverService.getCoverUrl(book);
};

// 计算统计信息
const stats = computed(() => {
  if (!book.value) return null;
  return {
    wordCount: getNovelCharCount(book.value),
    chapterCount: getTotalChapters(book.value),
    volumeCount: book.value.volumes?.length || 0,
  };
});

// 获取卷列表
const volumes = computed(() => {
  if (!book.value || !book.value.volumes || book.value.volumes.length === 0) {
    return [];
  }
  return book.value.volumes;
});

// 卷选项（用于 Dropdown）
const volumeOptions = computed(() => {
  return volumes.value.map((volume) => ({
    label: volume.title,
    value: volume.id,
  }));
});

// 导航到章节详情页
const navigateToChapter = (chapter: Chapter) => {
  if (!bookId.value) return;
  // 设置选中的章节
  bookDetailsStore.setSelectedChapter(bookId.value, chapter.id);
  // TODO: 导航到章节详情页
  console.log('Navigate to chapter:', chapter.id);
};

// 获取选中的章节 ID
const selectedChapterId = computed(() => {
  if (!bookId.value) return null;
  return bookDetailsStore.getSelectedChapter(bookId.value);
});

// 添加新卷
const handleAddVolume = () => {
  if (!book.value || !newVolumeTitle.value.trim()) {
    return;
  }

  const existingVolumes = book.value.volumes || [];
  const volumeIds = extractIds(existingVolumes);
  const idGenerator = new UniqueIdGenerator(volumeIds);

  const newVolume: Volume = {
    id: idGenerator.generate(),
    title: newVolumeTitle.value.trim(),
    chapters: [],
  };

  const updatedVolumes = [...existingVolumes, newVolume];
  booksStore.updateBook(book.value.id, { volumes: updatedVolumes });

  toast.add({
    severity: 'success',
    summary: '添加成功',
    detail: `已添加卷 "${newVolume.title}"`,
    life: 3000,
  });

  showAddVolumeDialog.value = false;
  newVolumeTitle.value = '';
};

// 添加新章节
const handleAddChapter = () => {
  if (!book.value || !newChapterTitle.value.trim() || !selectedVolumeId.value) {
    return;
  }

  const existingVolumes = book.value.volumes || [];
  const volumeIndex = existingVolumes.findIndex((v) => v.id === selectedVolumeId.value);
  if (volumeIndex === -1) {
    return;
  }

  const volume = existingVolumes[volumeIndex];
  const existingChapters = volume.chapters || [];
  const chapterIds = extractIds(existingChapters);
  const idGenerator = new UniqueIdGenerator(chapterIds);

  const newChapter: Chapter = {
    id: idGenerator.generate(),
    title: newChapterTitle.value.trim(),
    lastEdited: new Date(),
    createdAt: new Date(),
  };

  const updatedChapters = [...existingChapters, newChapter];
  const updatedVolumes = [...existingVolumes];
  updatedVolumes[volumeIndex] = {
    ...volume,
    chapters: updatedChapters,
  };

  booksStore.updateBook(book.value.id, { volumes: updatedVolumes });

  toast.add({
    severity: 'success',
    summary: '添加成功',
    detail: `已添加章节 "${newChapter.title}"`,
    life: 3000,
  });

  showAddChapterDialog.value = false;
  newChapterTitle.value = '';
  selectedVolumeId.value = null;
};

// 打开添加章节对话框
const openAddChapterDialog = () => {
  if (!book.value || !book.value.volumes || book.value.volumes.length === 0) {
    toast.add({
      severity: 'warn',
      summary: '无法添加章节',
      detail: '请先添加至少一个卷',
      life: 3000,
    });
    return;
  }
  showAddChapterDialog.value = true;
};

// 打开编辑卷对话框
const openEditVolumeDialog = (volume: Volume) => {
  editingVolumeId.value = volume.id;
  editingVolumeTitle.value = volume.title;
  showEditVolumeDialog.value = true;
};

// 打开编辑章节对话框
const openEditChapterDialog = (chapter: Chapter) => {
  if (!book.value) return;
  
  // 找到章节所在的卷
  const sourceVolume = book.value.volumes?.find((volume) =>
    volume.chapters?.some((c) => c.id === chapter.id)
  );
  
  editingChapterId.value = chapter.id;
  editingChapterTitle.value = chapter.title;
  editingChapterSourceVolumeId.value = sourceVolume?.id || null;
  editingChapterTargetVolumeId.value = sourceVolume?.id || null;
  showEditChapterDialog.value = true;
};

// 保存编辑的卷
const handleEditVolume = () => {
  if (!book.value || !editingVolumeId.value || !editingVolumeTitle.value.trim()) {
    return;
  }

  const existingVolumes = book.value.volumes || [];
  const volumeIndex = existingVolumes.findIndex((v) => v.id === editingVolumeId.value);
  if (volumeIndex === -1) {
    return;
  }

  const updatedVolumes = [...existingVolumes];
  updatedVolumes[volumeIndex] = {
    ...updatedVolumes[volumeIndex],
    title: editingVolumeTitle.value.trim(),
  };

  booksStore.updateBook(book.value.id, { volumes: updatedVolumes });

  toast.add({
    severity: 'success',
    summary: '更新成功',
    detail: `已更新卷标题`,
    life: 3000,
  });

  showEditVolumeDialog.value = false;
  editingVolumeId.value = null;
  editingVolumeTitle.value = '';
};

// 保存编辑的章节
const handleEditChapter = () => {
  if (!book.value || !editingChapterId.value || !editingChapterTitle.value.trim() || !editingChapterTargetVolumeId.value) {
    return;
  }

  const existingVolumes = [...(book.value.volumes || [])];
  let chapterToMove: Chapter | null = null;
  let sourceVolumeIndex = -1;
  let chapterIndex = -1;

  // 找到章节并移除
  for (let i = 0; i < existingVolumes.length; i++) {
    const volume = existingVolumes[i];
    if (volume.chapters) {
      const index = volume.chapters.findIndex((c) => c.id === editingChapterId.value);
      if (index !== -1) {
        chapterToMove = { ...volume.chapters[index] };
        sourceVolumeIndex = i;
        chapterIndex = index;
        break;
      }
    }
  }

  if (!chapterToMove) return;

  // 更新章节标题
  chapterToMove.title = editingChapterTitle.value.trim();
  chapterToMove.lastEdited = new Date();

  // 如果目标卷与源卷不同，需要移动章节
  if (editingChapterSourceVolumeId.value !== editingChapterTargetVolumeId.value) {
    // 从源卷移除
    existingVolumes[sourceVolumeIndex].chapters?.splice(chapterIndex, 1);

    // 添加到目标卷
    const targetVolumeIndex = existingVolumes.findIndex((v) => v.id === editingChapterTargetVolumeId.value);
    if (targetVolumeIndex !== -1) {
      const targetVolume = existingVolumes[targetVolumeIndex];
      if (!targetVolume.chapters) {
        targetVolume.chapters = [];
      }
      targetVolume.chapters.push(chapterToMove);
    }
  } else {
    // 同一卷内，只更新标题
    if (existingVolumes[sourceVolumeIndex].chapters) {
      existingVolumes[sourceVolumeIndex].chapters[chapterIndex] = chapterToMove;
    }
  }

  booksStore.updateBook(book.value.id, { volumes: existingVolumes });

  const moveMessage = editingChapterSourceVolumeId.value !== editingChapterTargetVolumeId.value
    ? '并移动到新卷'
    : '';
  
  toast.add({
    severity: 'success',
    summary: '更新成功',
    detail: `已更新章节标题${moveMessage}`,
    life: 3000,
  });

  showEditChapterDialog.value = false;
  editingChapterId.value = null;
  editingChapterTitle.value = '';
  editingChapterSourceVolumeId.value = null;
  editingChapterTargetVolumeId.value = null;
};

// 打开删除卷确认对话框
const openDeleteVolumeConfirm = (volume: Volume) => {
  deletingVolumeId.value = volume.id;
  deletingVolumeTitle.value = volume.title;
  showDeleteVolumeConfirm.value = true;
};

// 打开删除章节确认对话框
const openDeleteChapterConfirm = (chapter: Chapter) => {
  deletingChapterId.value = chapter.id;
  deletingChapterTitle.value = chapter.title;
  showDeleteChapterConfirm.value = true;
};

// 确认删除卷
const handleDeleteVolume = () => {
  if (!book.value || !deletingVolumeId.value) {
    return;
  }

  const existingVolumes = book.value.volumes || [];
  const updatedVolumes = existingVolumes.filter((v) => v.id !== deletingVolumeId.value);

  booksStore.updateBook(book.value.id, { volumes: updatedVolumes });

  toast.add({
    severity: 'success',
    summary: '删除成功',
    detail: `已删除卷 "${deletingVolumeTitle.value}"`,
    life: 3000,
  });

  showDeleteVolumeConfirm.value = false;
  deletingVolumeId.value = null;
  deletingVolumeTitle.value = '';
};

// 确认删除章节
const handleDeleteChapter = () => {
  if (!book.value || !deletingChapterId.value) {
    return;
  }

  const existingVolumes = book.value.volumes || [];
  let updated = false;

  const updatedVolumes = existingVolumes.map((volume) => {
    if (volume.chapters) {
      const chapterIndex = volume.chapters.findIndex((c) => c.id === deletingChapterId.value);
      if (chapterIndex !== -1) {
        updated = true;
        const updatedChapters = volume.chapters.filter((c) => c.id !== deletingChapterId.value);
        return {
          ...volume,
          chapters: updatedChapters,
        };
      }
    }
    return volume;
  });

  if (updated) {
    booksStore.updateBook(book.value.id, { volumes: updatedVolumes });

    toast.add({
      severity: 'success',
      summary: '删除成功',
      detail: `已删除章节 "${deletingChapterTitle.value}"`,
      life: 3000,
    });

    showDeleteChapterConfirm.value = false;
    deletingChapterId.value = null;
    deletingChapterTitle.value = '';
  }
};

// 保存书籍（编辑）
const handleBookSave = (formData: Partial<Novel>) => {
  if (!book.value) return;

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
  booksStore.updateBook(book.value.id, updates);
  showBookDialog.value = false;
  const bookTitle = updates.title || book.value.title;
  toast.add({
    severity: 'success',
    summary: '更新成功',
    detail: `已成功更新书籍 "${bookTitle}"`,
    life: 3000,
  });
};

// 拖拽处理函数
const handleDragStart = (event: DragEvent, chapter: Chapter, volumeId: string, index: number) => {
  if (!event.dataTransfer) return;
  draggedChapter.value = { chapter, sourceVolumeId: volumeId, sourceIndex: index };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', chapter.id);
  if (event.target instanceof HTMLElement) {
    event.target.style.opacity = '0.5';
  }
};

const handleDragEnd = (event: DragEvent) => {
  draggedChapter.value = null;
  dragOverVolumeId.value = null;
  dragOverIndex.value = null;
  if (event.target instanceof HTMLElement) {
    event.target.style.opacity = '1';
  }
};

const handleDragOver = (event: DragEvent, volumeId: string, index?: number) => {
  event.preventDefault();
  if (!event.dataTransfer) return;
  event.dataTransfer.dropEffect = 'move';
  dragOverVolumeId.value = volumeId;
  if (index !== undefined) {
    dragOverIndex.value = index;
  }
};

const handleDrop = (event: DragEvent, targetVolumeId: string, targetIndex?: number) => {
  event.preventDefault();
  if (!draggedChapter.value || !book.value) return;

  const { chapter, sourceVolumeId, sourceIndex } = draggedChapter.value;
  const volumes = [...(book.value.volumes || [])];
  
  // 找到源卷和目标卷
  const sourceVolumeIndex = volumes.findIndex((v) => v.id === sourceVolumeId);
  const targetVolumeIndex = volumes.findIndex((v) => v.id === targetVolumeId);
  
  if (sourceVolumeIndex === -1 || targetVolumeIndex === -1) return;

  const sourceVolume = volumes[sourceVolumeIndex];
  const targetVolume = volumes[targetVolumeIndex];
  
  if (!sourceVolume.chapters || sourceIndex >= sourceVolume.chapters.length) return;

  // 从源卷移除章节
  const [movedChapter] = sourceVolume.chapters.splice(sourceIndex, 1);

  // 添加到目标卷
  if (sourceVolumeId === targetVolumeId) {
    // 同一卷内重新排序
    const insertIndex = targetIndex !== undefined && targetIndex !== null ? targetIndex : targetVolume.chapters.length;
    targetVolume.chapters.splice(insertIndex, 0, movedChapter);
  } else {
    // 移动到不同卷
    if (!targetVolume.chapters) {
      targetVolume.chapters = [];
    }
    const insertIndex = targetIndex !== undefined && targetIndex !== null ? targetIndex : targetVolume.chapters.length;
    targetVolume.chapters.splice(insertIndex, 0, movedChapter);
  }

  // 更新书籍
  booksStore.updateBook(book.value.id, { volumes });

  toast.add({
    severity: 'success',
    summary: '移动成功',
    detail: `已将章节 "${chapter.title}" ${sourceVolumeId === targetVolumeId ? '重新排序' : '移动到新卷'}`,
    life: 3000,
  });

  // 重置拖拽状态
  draggedChapter.value = null;
  dragOverVolumeId.value = null;
  dragOverIndex.value = null;
};

const handleDragLeave = () => {
  // 延迟清除，避免在子元素间移动时闪烁
  setTimeout(() => {
    if (!draggedChapter.value) {
      dragOverVolumeId.value = null;
      dragOverIndex.value = null;
    }
  }, 50);
};
</script>

<template>
  <div class="book-details-layout">
    <!-- 左侧卷/章节面板 -->
    <aside class="book-sidebar">
      <div class="sidebar-content">
        <!-- 书籍封面和标题 -->
        <div v-if="book" class="book-header">
          <div class="book-header-content" @click="showBookDialog = true">
            <i class="pi pi-pencil book-edit-icon"></i>
            <div class="book-cover-wrapper">
              <img
                :src="getCoverUrl(book)"
                :alt="book.title"
                class="book-cover"
                @error="
                  (e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = getCoverUrl(book);
                  }
                "
              />
            </div>
            <div class="book-info">
              <h3 class="book-title">{{ book.title }}</h3>
              <div v-if="stats" class="book-stats">
                <div class="stat-item">
                  <i class="pi pi-file stat-icon"></i>
                  <span class="stat-value">{{ stats.volumeCount }}</span>
                  <span class="stat-label">卷</span>
                </div>
                <span class="stat-separator">|</span>
                <div class="stat-item">
                  <i class="pi pi-list stat-icon"></i>
                  <span class="stat-value">{{ stats.chapterCount }}</span>
                  <span class="stat-label">章</span>
                </div>
                <span class="stat-separator">|</span>
                <div class="stat-item">
                  <i class="pi pi-align-left stat-icon"></i>
                  <span class="stat-value">{{ formatWordCount(stats.wordCount) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="book-separator"></div>
        </div>

        <!-- 目录标题和操作按钮 -->
        <div class="sidebar-title-wrapper">
          <h2 class="sidebar-title">目录</h2>
          <div class="sidebar-actions">
            <Button
              icon="pi pi-plus"
              class="p-button-text p-button-sm"
              size="small"
              title="添加卷"
              @click="showAddVolumeDialog = true"
            />
            <Button
              icon="pi pi-plus-circle"
              class="p-button-text p-button-sm"
              size="small"
              title="添加章节"
              @click="openAddChapterDialog"
            />
          </div>
        </div>

        <!-- 卷和章节列表 -->
        <div class="volumes-container">
          <DataView
            v-if="volumes.length > 0"
            :value="volumes"
            data-key="id"
            layout="list"
          >
            <template #list="slotProps">
              <div class="volumes-list">
                <div
                  v-for="volume in slotProps.items"
                  :key="volume.id"
                  class="volume-item"
                >
                  <div class="volume-header">
                    <div class="volume-header-content" @click="toggleVolume(volume.id)">
                      <i
                        :class="[
                          'pi volume-toggle-icon',
                          isVolumeExpanded(volume.id) ? 'pi-chevron-down' : 'pi-chevron-right',
                        ]"
                      ></i>
                      <i class="pi pi-book volume-icon"></i>
                      <span class="volume-title">{{ volume.title }}</span>
                      <span v-if="volume.chapters && volume.chapters.length > 0" class="volume-chapter-count">
                        ({{ volume.chapters.length }} 章)
                      </span>
                    </div>
                    <div class="volume-actions" @click.stop>
                      <Button
                        icon="pi pi-pencil"
                        class="p-button-text p-button-sm p-button-rounded action-button"
                        size="small"
                        title="编辑"
                        @click="openEditVolumeDialog(volume)"
                      />
                      <Button
                        icon="pi pi-trash"
                        class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
                        size="small"
                        title="删除"
                        @click="openDeleteVolumeConfirm(volume)"
                      />
                    </div>
                  </div>
                  <Transition name="slide-down">
                    <div
                      v-if="volume.chapters && volume.chapters.length > 0 && isVolumeExpanded(volume.id)"
                      class="chapters-list"
                      @dragover.prevent="handleDragOver($event, volume.id)"
                      @drop="handleDrop($event, volume.id)"
                      @dragleave="handleDragLeave"
                      :class="{ 'drag-over': dragOverVolumeId === volume.id && dragOverIndex === null }"
                    >
                    <div
                      v-for="(chapter, index) in volume.chapters"
                      :key="chapter.id"
                      :class="[
                        'chapter-item',
                        { 'chapter-item-selected': selectedChapterId === chapter.id },
                        { 'drag-over': dragOverVolumeId === volume.id && dragOverIndex === index },
                        { 'dragging': draggedChapter?.chapter.id === chapter.id },
                      ]"
                      draggable="true"
                      @dragstart="handleDragStart($event, chapter, volume.id, index)"
                      @dragend="handleDragEnd($event)"
                      @dragover.prevent="handleDragOver($event, volume.id, index)"
                      @drop="handleDrop($event, volume.id, index)"
                    >
                      <div class="chapter-content" @click="navigateToChapter(chapter)">
                        <i class="pi pi-bars drag-handle"></i>
                        <i class="pi pi-file chapter-icon"></i>
                        <span class="chapter-title">{{ chapter.title }}</span>
                      </div>
                      <div class="chapter-actions" @click.stop>
                        <Button
                          icon="pi pi-pencil"
                          class="p-button-text p-button-sm p-button-rounded action-button"
                          size="small"
                          title="编辑"
                          @click="openEditChapterDialog(chapter)"
                        />
                        <Button
                          icon="pi pi-trash"
                          class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
                          size="small"
                          title="删除"
                          @click="openDeleteChapterConfirm(chapter)"
                        />
                      </div>
                    </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </template>
            <template #empty>
              <div class="empty-state">
                <p class="text-moon/60 text-sm">暂无卷和章节</p>
              </div>
            </template>
          </DataView>
          <div v-else class="empty-state">
            <p class="text-moon/60 text-sm">暂无卷和章节</p>
          </div>
        </div>

        <!-- 返回链接 -->
        <div class="back-link-wrapper">
          <button class="back-link" @click="() => void router.push('/books')">
            <i class="pi pi-arrow-left"></i>
            <span>返回书籍列表</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- 添加卷对话框 -->
    <Dialog
      v-model:visible="showAddVolumeDialog"
      modal
      header="添加新卷"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="volume-title" class="block text-sm font-medium text-moon/90">卷标题</label>
          <InputText
            id="volume-title"
            v-model="newVolumeTitle"
            placeholder="输入卷标题..."
            class="w-full"
            autofocus
            @keyup.enter="handleAddVolume"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          @click="showAddVolumeDialog = false"
        />
        <Button
          label="添加"
          :disabled="!newVolumeTitle.trim()"
          @click="handleAddVolume"
        />
      </template>
    </Dialog>

    <!-- 添加章节对话框 -->
    <Dialog
      v-model:visible="showAddChapterDialog"
      modal
      header="添加新章节"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="volume-select" class="block text-sm font-medium text-moon/90">选择卷</label>
          <Dropdown
            id="volume-select"
            v-model="selectedVolumeId"
            :options="volumeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="请选择卷"
            class="w-full"
          />
        </div>
        <div class="space-y-2">
          <label for="chapter-title" class="block text-sm font-medium text-moon/90">章节标题</label>
          <InputText
            id="chapter-title"
            v-model="newChapterTitle"
            placeholder="输入章节标题..."
            class="w-full"
            autofocus
            @keyup.enter="handleAddChapter"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          @click="showAddChapterDialog = false"
        />
        <Button
          label="添加"
          :disabled="!newChapterTitle.trim() || !selectedVolumeId"
          @click="handleAddChapter"
        />
      </template>
    </Dialog>

    <!-- 编辑卷对话框 -->
    <Dialog
      v-model:visible="showEditVolumeDialog"
      modal
      header="编辑卷标题"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="edit-volume-title" class="block text-sm font-medium text-moon/90">卷标题</label>
          <InputText
            id="edit-volume-title"
            v-model="editingVolumeTitle"
            placeholder="输入卷标题..."
            class="w-full"
            autofocus
            @keyup.enter="handleEditVolume"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          @click="showEditVolumeDialog = false"
        />
        <Button
          label="保存"
          :disabled="!editingVolumeTitle.trim()"
          @click="handleEditVolume"
        />
      </template>
    </Dialog>

    <!-- 编辑章节对话框 -->
    <Dialog
      v-model:visible="showEditChapterDialog"
      modal
      header="编辑章节"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="edit-chapter-title" class="block text-sm font-medium text-moon/90">章节标题</label>
          <InputText
            id="edit-chapter-title"
            v-model="editingChapterTitle"
            placeholder="输入章节标题..."
            class="w-full"
            autofocus
            @keyup.enter="handleEditChapter"
          />
        </div>
        <div class="space-y-2" v-if="volumes.length > 0">
          <label for="edit-chapter-volume" class="block text-sm font-medium text-moon/90">所属卷</label>
          <Dropdown
            id="edit-chapter-volume"
            v-model="editingChapterTargetVolumeId"
            :options="volumeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="选择卷"
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          @click="showEditChapterDialog = false"
        />
        <Button
          label="保存"
          :disabled="!editingChapterTitle.trim() || !editingChapterTargetVolumeId"
          @click="handleEditChapter"
        />
      </template>
    </Dialog>

    <!-- 删除卷确认对话框 -->
    <Dialog
      v-model:visible="showDeleteVolumeConfirm"
      modal
      header="确认删除"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除卷 <strong>"{{ deletingVolumeTitle }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">
          此操作将同时删除该卷下的所有章节，且无法撤销。
        </p>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          @click="showDeleteVolumeConfirm = false"
        />
        <Button
          label="删除"
          class="p-button-danger"
          @click="handleDeleteVolume"
        />
      </template>
    </Dialog>

    <!-- 删除章节确认对话框 -->
    <Dialog
      v-model:visible="showDeleteChapterConfirm"
      modal
      header="确认删除"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除章节 <strong>"{{ deletingChapterTitle }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">
          此操作无法撤销。
        </p>
      </div>
      <template #footer>
        <Button
          label="取消"
          class="p-button-text"
          @click="showDeleteChapterConfirm = false"
        />
        <Button
          label="删除"
          class="p-button-danger"
          @click="handleDeleteChapter"
        />
      </template>
    </Dialog>

    <!-- 书籍编辑对话框 -->
    <BookDialog
      v-model:visible="showBookDialog"
      mode="edit"
      :book="book || null"
      @save="handleBookSave"
      @cancel="showBookDialog = false"
    />

    <!-- 主内容区域 -->
    <div class="book-main-content">
      <div class="page-container">
        <div class="p-6 space-y-4">
          <h1 class="text-lg font-semibold">书籍详情</h1>
          <p class="opacity-80">书籍详情页面</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 书籍详情布局 */
.book-details-layout {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* 左侧边栏 */
.book-sidebar {
  width: 20rem;
  min-width: 20rem;
  max-width: 20rem;
  border-right: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-3);
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.book-header {
  margin-bottom: 1.5rem;
}

.book-header-content {
  display: flex;
  gap: 0.75rem;
  align-items: stretch;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.book-header-content:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--black-opacity-10);
}

.book-edit-icon {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  font-size: 0.875rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}

.book-header-content:hover .book-edit-icon {
  color: var(--primary-opacity-80);
  transform: scale(1.1);
}

.book-cover-wrapper {
  flex-shrink: 0;
  width: 4rem;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
}

.book-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.book-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  line-height: 1.4;
  text-align: left;
  word-break: break-word;
  margin: 0;
}

.book-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

.stat-separator {
  color: var(--moon-opacity-40);
  font-size: 0.75rem;
  user-select: none;
}

.stat-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
}

.stat-value {
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.stat-label {
  color: var(--moon-opacity-70);
  font-size: 0.75rem;
}

.book-separator {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--white-opacity-20), transparent);
  margin-bottom: 0.75rem;
}

.sidebar-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.sidebar-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.volumes-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.volumes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.volume-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.volume-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.volume-header:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
}

.volume-header-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.volume-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.volume-header:hover .volume-actions {
  opacity: 1;
}

.action-button {
  min-width: 1.5rem !important;
  width: 1.5rem !important;
  height: 1.5rem !important;
  padding: 0 !important;
}

.action-button .p-button-icon {
  font-size: 0.75rem !important;
}

.volume-toggle-icon {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.volume-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
  flex-shrink: 0;
}

.volume-title {
  flex: 1;
  font-weight: 600;
}

.volume-chapter-count {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  font-weight: 400;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-left: 1rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--white-opacity-10);
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: move;
}

.chapter-item:hover {
  background: var(--primary-opacity-15);
  color: var(--moon-opacity-95);
  border-color: var(--primary-opacity-30);
  transform: translateX(2px);
}

.chapter-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.chapter-item.drag-over {
  background: var(--primary-opacity-20) !important;
  border-color: var(--primary-opacity-50) !important;
  border-style: dashed !important;
}

.chapter-item-selected {
  background: var(--primary-opacity-15) !important;
  border-color: var(--primary-opacity-40) !important;
  color: var(--moon-opacity-95) !important;
}

.chapter-item-selected .chapter-icon {
  color: var(--primary-opacity-90) !important;
}

.chapters-list.drag-over {
  background: var(--primary-opacity-10);
  border-radius: 6px;
  border: 2px dashed var(--primary-opacity-40);
}

.chapter-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.drag-handle {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
  cursor: grab;
  flex-shrink: 0;
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .drag-handle {
  color: var(--primary-opacity-70);
}

.chapter-item.dragging .drag-handle {
  cursor: grabbing;
}

.chapter-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .chapter-actions {
  opacity: 1;
}

.chapter-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-60);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .chapter-icon {
  color: var(--primary-opacity-85);
  transform: scale(1.1);
}

.chapter-title {
  flex: 1;
}

/* 折叠/展开动画 */
.slide-down-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-enter-from {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.slide-down-enter-to {
  opacity: 1;
  max-height: 1000px;
  transform: translateY(0);
}

.slide-down-leave-from {
  opacity: 1;
  max-height: 1000px;
  transform: translateY(0);
}

.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
}

.back-link-wrapper {
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--white-opacity-10);
}

.back-link {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.back-link:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
  color: var(--moon-opacity-95);
  transform: translateX(-2px);
}

.back-link:active {
  transform: translateX(0);
}

.back-link .pi {
  font-size: 0.75rem;
}

/* 主内容区域 */
.book-main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}

/* 页面容器 - 确保有足够的空间 */
.page-container {
  padding-top: 1.5rem;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  padding-bottom: 1.5rem;
}

</style>
