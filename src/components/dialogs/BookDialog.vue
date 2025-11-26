<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { cloneDeep } from 'lodash';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputChips from 'primevue/inputchips';
import Skeleton from 'primevue/skeleton';
import type { Novel, Chapter } from 'src/models/novel';
import CoverManagerDialog from './CoverManagerDialog.vue';
import NovelScraperDialog from './NovelScraperDialog.vue';
import TranslatableInput from '../translation/TranslatableInput.vue';
import TranslatableChips from '../translation/TranslatableChips.vue';
import { NovelScraperFactory } from 'src/services/scraper';
import { ChapterService } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import {
  formatCharCount,
  getChapterCharCount,
  getChapterCharCountAsync,
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
} from 'src/utils';

// 格式化日期显示
const formatDate = (date: Date | string | undefined): string => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const props = withDefaults(
  defineProps<{
    visible: boolean;
    mode: 'add' | 'edit';
    book?: Novel | null;
  }>(),
  {
    book: null,
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [data: Partial<Novel>];
  cancel: [];
}>();

const idPrefix = computed(() => (props.mode === 'add' ? '' : 'edit'));
const titleInputId = computed<string>(() => {
  const prefix = idPrefix.value;
  return prefix ? `${prefix}-title` : 'title';
});
const toast = useToastWithHistory();

// 表单数据
const formData = ref<Partial<Novel>>({
  title: '',
  alternateTitles: [],
  author: '',
  description: '',
  tags: [],
  webUrl: [],
});

// 封面管理对话框
const showCoverManager = ref(false);

// 爬虫对话框
const showScraper = ref(false);
const scraperInitialUrl = ref<string>('');

// 打开爬虫对话框（可选预设 URL）
const openScraper = (url?: string) => {
  scraperInitialUrl.value = url || '';
  showScraper.value = true;
};

// 表单验证错误
const formErrors = ref<Record<string, string>>({});

// 展开的卷 ID 集合（用于折叠/展开）
const expandedVolumes = ref<Set<string>>(new Set());

// 清除确认对话框
const showClearConfirm = ref(false);
const clearConfirmInput = ref('');

// 计算可用的卷和章节（从 formData 或 props.book 获取）
const availableVolumes = computed(() => {
  return formData.value.volumes || props.book?.volumes || [];
});

// 切换卷的展开/折叠状态
const toggleVolume = (volumeId: string) => {
  if (expandedVolumes.value.has(volumeId)) {
    expandedVolumes.value.delete(volumeId);
  } else {
    expandedVolumes.value.add(volumeId);
  }
};

// 使用工具函数计算和格式化
// getChapterCharCount 和 formatCharCount 已从 utils 导入

// 章节字符数缓存和加载状态
const chapterCharCounts = ref<Record<string, number>>({});
const loadingChapterCharCounts = ref<Set<string>>(new Set());

// 异步加载章节字符数
const loadChapterCharCount = async (chapter: Chapter) => {
  // 如果已缓存，直接返回
  if (chapterCharCounts.value[chapter.id] !== undefined) {
    return chapterCharCounts.value[chapter.id] || 0;
  }

  // 先尝试同步计算（如果内容已加载）
  const syncCount = getChapterCharCount(chapter);
  // 如果章节内容已加载，使用同步结果
  if (chapter.content !== undefined) {
    chapterCharCounts.value[chapter.id] = syncCount;
    return syncCount;
  }

  // 异步加载（从 IndexedDB）
  loadingChapterCharCounts.value.add(chapter.id);
  try {
    const count = await getChapterCharCountAsync(chapter);
    chapterCharCounts.value[chapter.id] = count;
    return count;
  } catch (error) {
    console.error(`Failed to load char count for chapter ${chapter.id}:`, error);
    // 如果异步加载失败，使用同步结果作为后备
    chapterCharCounts.value[chapter.id] = syncCount;
    return syncCount;
  } finally {
    loadingChapterCharCounts.value.delete(chapter.id);
  }
};

// 获取章节字符数（带缓存）
const getChapterCharCountDisplay = (chapter: Chapter): number => {
  return chapterCharCounts.value[chapter.id] ?? getChapterCharCount(chapter);
};

// 检查章节是否正在加载字符数
const isLoadingChapterCharCount = (chapter: Chapter): boolean => {
  return loadingChapterCharCounts.value.has(chapter.id);
};

// 加载所有可见章节的字符数
const loadAllVisibleChapterCharCounts = async () => {
  const volumes = availableVolumes.value;
  const loadPromises: Promise<void>[] = [];
  
  for (const volume of volumes) {
    if (expandedVolumes.value.has(volume.id) && volume.chapters) {
      for (const chapter of volume.chapters) {
        loadPromises.push(loadChapterCharCount(chapter).then(() => {}));
      }
    }
  }
  
  await Promise.all(loadPromises);
};

// 当展开的卷变化时，加载字符数
watch(
  () => expandedVolumes.value,
  async () => {
    await loadAllVisibleChapterCharCounts();
  },
  { deep: true },
);

// 当章节列表变化时，清除缓存并重新加载
watch(
  () => availableVolumes.value,
  async () => {
    chapterCharCounts.value = {};
    await loadAllVisibleChapterCharCounts();
  },
  { deep: true },
);

// 重置表单
const resetForm = () => {
  formData.value = {
    title: '',
    alternateTitles: [],
    author: '',
    description: '',
    tags: [],
    webUrl: [],
  };
  formErrors.value = {};
  expandedVolumes.value.clear();
};

// 验证表单
const validateForm = (): boolean => {
  formErrors.value = {};

  if (!formData.value.title?.trim()) {
    formErrors.value.title = '书籍标题不能为空';
  }

  return Object.keys(formErrors.value).length === 0;
};

// 处理保存
const handleSave = () => {
  if (!validateForm()) {
    return;
  }
  emit('save', formData.value);
};

// 导出 JSON
const handleExportJson = async () => {
  try {
    let exportData: Novel;

    // 如果有 book 数据，使用完整的书籍数据（包含所有字段）
    if (props.mode === 'edit' && props.book) {
      // 加载所有章节内容
      exportData = await ChapterContentService.loadAllChapterContentsForNovel(props.book);
    } else {
      // 添加模式，使用表单数据（不包含章节内容）
      exportData = {
        id: '',
        title: formData.value.title || '',
        ...(formData.value.alternateTitles ? { alternateTitles: formData.value.alternateTitles } : {}),
        ...(formData.value.author ? { author: formData.value.author } : {}),
        ...(formData.value.description ? { description: formData.value.description } : {}),
        ...(formData.value.tags ? { tags: formData.value.tags } : {}),
        ...(formData.value.webUrl ? { webUrl: formData.value.webUrl } : {}),
        ...(formData.value.cover ? { cover: formData.value.cover } : {}),
        ...(formData.value.volumes ? { volumes: formData.value.volumes } : {}),
        ...(formData.value.starred !== undefined ? { starred: formData.value.starred } : {}),
        createdAt: new Date(),
        lastEdited: new Date(),
      } as Novel;
    }

    // 创建 JSON 字符串
    const jsonString = JSON.stringify(exportData, null, 2);

    // 创建 Blob
    const blob = new Blob([jsonString], { type: 'application/json' });

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // 生成文件名（使用书名或默认名称）
    const title = formData.value.title || props.book?.title || 'book';
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `${sanitizedTitle}-${timestamp}.json`;

    // 触发下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 清理 URL
    URL.revokeObjectURL(url);

    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: '书籍数据已成功导出为 JSON 文件',
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: error instanceof Error ? error.message : '导出 JSON 时发生未知错误',
      life: 3000,
    });
  }
};

// 处理取消
const handleCancel = () => {
  emit('cancel');
  emit('update:visible', false);
};

// 检查 URL 是否可爬取
const isUrlScrapable = (url: string): boolean => {
  return NovelScraperFactory.isValidUrl(url);
};

// 处理应用爬取的数据
const handleApplyScrapedData = (novel: Novel) => {
  // 使用 ChapterService 合并爬取的数据到表单
  const currentBook = props.mode === 'edit' ? props.book : null;
  const mergedData = ChapterService.mergeNovelData(formData.value, novel, {
    updateTitle: true, // 只有当现有标题为空时才更新
    updateAuthor: true,
    updateDescription: true,
    updateTags: true,
    updateWebUrl: true,
    chapterUpdateStrategy: 'merge', // 合并章节属性
  });

  // 更新表单数据
  formData.value = mergedData;

  showScraper.value = false;

  // 自动保存（如果表单验证通过）
  // 在编辑模式下，如果表单有标题（验证通过），自动保存
  // 在添加模式下，如果表单有标题，也尝试保存（让父组件处理）
  if (validateForm()) {
    // 使用 nextTick 确保表单数据已更新
    void nextTick(() => {
      emit('save', formData.value);
      toast.add({
        severity: 'success',
        summary: '导入并保存成功',
        detail: '章节数据已导入并自动保存',
        life: 3000,
      });
    });
  } else {
    // 如果验证失败，提示用户需要填写标题
    toast.add({
      severity: 'warn',
      summary: '应用成功，但未保存',
      detail: '小说信息已应用到表单，但需要填写标题后才能保存',
      life: 3000,
    });
  }
};

// 复制封面 URL
const handleCopyUrl = async () => {
  if (!formData.value.cover?.url) return;

  try {
    await navigator.clipboard.writeText(formData.value.cover.url);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '封面 URL 已复制到剪贴板',
      life: 2000,
    });
  } catch (error) {
    console.error('复制失败:', error);
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制 URL 到剪贴板',
      life: 3000,
    });
  }
};

// 清除封面
const handleClearCover = () => {
  // @ts-expect-error - 需要设置为 null 以表示删除封面
  formData.value.cover = null;
  toast.add({
    severity: 'success',
    summary: '已清除',
    detail: '封面已清除',
    life: 2000,
  });
};

// 清除所有卷和章节（需要输入书名确认）
const handleClearVolumes = () => {
  clearConfirmInput.value = '';
  showClearConfirm.value = true;
};

// 确认清除
const confirmClearVolumes = () => {
  const bookTitle = formData.value.title || props.book?.title || '';
  if (clearConfirmInput.value.trim() === bookTitle.trim()) {
    formData.value.volumes = [];
    expandedVolumes.value.clear();
    showClearConfirm.value = false;
    clearConfirmInput.value = '';
    toast.add({
      severity: 'success',
      summary: '已清除',
      detail: '所有卷和章节已被清除',
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'error',
      summary: '书名不匹配',
      detail: '请输入正确的书名以确认清除操作',
      life: 3000,
    });
  }
};

// 取消清除
const cancelClearVolumes = () => {
  showClearConfirm.value = false;
  clearConfirmInput.value = '';
};

// 复制书名
const handleCopyBookTitle = async () => {
  const bookTitle = formData.value.title || props.book?.title || '';
  try {
    await navigator.clipboard.writeText(bookTitle);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '书名已复制到剪贴板',
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制书名到剪贴板',
      life: 3000,
    });
  }
};

// 复制所有标签
const handleCopyTags = async () => {
  const tags = formData.value.tags || [];
  if (tags.length === 0) {
    toast.add({
      severity: 'warn',
      summary: '无标签',
      detail: '当前没有标签可复制',
      life: 2000,
    });
    return;
  }

  const tagsText = tags.join(',');
  try {
    await navigator.clipboard.writeText(tagsText);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '所有标签已复制到剪贴板',
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制标签到剪贴板',
      life: 3000,
    });
  }
};

// 监听 visible 变化，初始化表单
watch(
  () => props.visible,
  async (newVisible) => {
    if (newVisible) {
      if (props.mode === 'edit' && props.book) {
        // 编辑模式：填充现有数据
        const data: Partial<Novel> = {
          title: props.book.title,
          alternateTitles: props.book.alternateTitles ? [...props.book.alternateTitles] : [],
          author: props.book.author || '',
          description: props.book.description || '',
          tags: props.book.tags ? [...props.book.tags] : [],
          webUrl: props.book.webUrl ? [...props.book.webUrl] : [],
        };
        if (props.book.cover) {
          data.cover = { ...props.book.cover };
        }
        if (props.book.volumes) {
          // 深拷贝 volumes 数据，确保可以正确编辑
          data.volumes = cloneDeep(props.book.volumes);
        }
        formData.value = data;
      } else {
        // 添加模式：重置表单
        resetForm();
      }
      formErrors.value = {};
      // 等待 DOM 更新后加载字符数
      await nextTick();
      await loadAllVisibleChapterCharCounts();
    } else {
      // 关闭时重置
      resetForm();
      // 关闭清除确认对话框
      showClearConfirm.value = false;
      clearConfirmInput.value = '';
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="mode === 'add' ? '添加书籍' : '编辑书籍'"
    :modal="true"
    :style="{ width: '900px' }"
    :closable="true"
    class="book-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="flex gap-6 py-2">
      <!-- 左侧表单区域 -->
      <div class="flex-1 space-y-5 min-w-0">
        <!-- 书籍标题 -->
        <div class="space-y-2">
          <label :for="titleInputId" class="block text-sm font-medium text-moon/90"
            >书籍标题 *</label
          >
          <TranslatableInput
            v-model="formData.title!"
            :placeholder="'例如: 转生成为史莱姆'"
            :id="titleInputId"
            :invalid="!!formErrors.title"
          />
          <small v-if="formErrors.title" class="p-error block mt-1">{{ formErrors.title }}</small>
        </div>

        <!-- 别名标题 -->
        <div class="space-y-2">
          <label :for="`${idPrefix}-alternateTitles`" class="block text-sm font-medium text-moon/90"
            >别名标题</label
          >
          <TranslatableChips
            :id="`${idPrefix}-alternateTitles`"
            :model-value="formData.alternateTitles || []"
            @update:model-value="
              (value) => {
                formData.alternateTitles = value;
              }
            "
            placeholder="输入别名标题后按回车"
            class="w-full"
          />
          <small class="text-moon/60 block mt-1">输入别名标题后按回车键添加</small>
        </div>

        <!-- 作者 -->
        <div class="space-y-2">
          <label :for="`${idPrefix}-author`" class="block text-sm font-medium text-moon/90"
            >作者</label
          >
          <InputText
            :id="`${idPrefix}-author`"
            v-model="formData.author"
            placeholder="例如: 伏瀬"
            class="w-full"
          />
        </div>

        <!-- 描述 -->
        <div class="space-y-2">
          <label :for="`${idPrefix}-description`" class="block text-sm font-medium text-moon/90"
            >描述</label
          >
          <TranslatableInput
            :id="`${idPrefix}-description`"
            :model-value="formData.description || ''"
            @update:model-value="
              (value) => {
                formData.description = value;
              }
            "
            type="textarea"
            :rows="4"
            :auto-resize="true"
            placeholder="输入书籍描述..."
          />
        </div>

        <!-- 标签 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label :for="`${idPrefix}-tags`" class="block text-sm font-medium text-moon/90"
              >标签</label
            >
            <Button
              icon="pi pi-copy"
              label="复制标签"
              class="p-button-text p-button-sm"
              size="small"
              :disabled="!formData.tags || formData.tags.length === 0"
              @click="handleCopyTags"
            />
          </div>
          <TranslatableChips
            :id="`${idPrefix}-tags`"
            :model-value="formData.tags || []"
            @update:model-value="
              (value) => {
                formData.tags = value;
              }
            "
            placeholder="输入标签后按回车，或用逗号分隔输入多个标签"
            class="w-full"
            separator=","
          />
          <small class="text-moon/60 block mt-1"
            >输入标签后按回车键添加，或用逗号分隔一次性添加多个标签</small
          >
        </div>

        <!-- 网络地址 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label :for="`${idPrefix}-webUrl`" class="block text-sm font-medium text-moon/90"
              >网络地址</label
            >
            <Button
              label="从网站获取"
              icon="pi pi-download"
              class="p-button-text p-button-sm"
              size="small"
              @click="openScraper()"
            />
          </div>
          <InputChips
            :id="`${idPrefix}-webUrl`"
            :model-value="formData.webUrl || []"
            @update:model-value="
              (value: string[]) => {
                formData.webUrl = value;
              }
            "
            placeholder="输入网络地址后按回车"
            class="w-full"
          />
          <!-- 显示可点击的 URL 列表 -->
          <div v-if="formData.webUrl && formData.webUrl.length > 0" class="space-y-1 mt-2">
            <div
              v-for="(url, index) in formData.webUrl"
              :key="index"
              class="flex items-center gap-2 p-2 card-base"
            >
              <a
                :href="url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent-400 hover:text-accent-300 hover:underline text-sm break-all flex-1 transition-colors"
              >
                {{ url }}
              </a>
              <Button
                v-if="isUrlScrapable(url)"
                icon="pi pi-download"
                class="p-button-text p-button-sm"
                size="small"
                title="爬取此 URL 的内容"
                @click="openScraper(url)"
              />
            </div>
          </div>
          <small class="text-moon/60 block mt-1"
            >输入网络地址后按回车键添加，或点击按钮从支持的网站获取</small
          >
        </div>

        <!-- 卷和章节（只读） -->
        <div v-if="availableVolumes.length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="block text-sm font-medium text-moon/90">卷和章节</label>
            <Button
              icon="pi pi-trash"
              label="清除全部"
              class="p-button-text p-button-danger p-button-sm"
              size="small"
              @click="handleClearVolumes"
            />
          </div>
          <div class="space-y-2 max-h-[300px] overflow-y-auto card-base p-3">
            <div
              v-for="volume in availableVolumes"
              :key="volume.id"
              class="space-y-2 border-b border-white/10 last:border-b-0 pb-2 last:pb-0"
            >
              <!-- 卷标题 -->
              <div
                class="flex items-center justify-between cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors"
                @click="toggleVolume(volume.id)"
              >
                <div class="flex items-center gap-2 flex-1">
                  <i
                    :class="[
                      'pi text-xs transition-transform',
                      expandedVolumes.has(volume.id) ? 'pi-chevron-down' : 'pi-chevron-right',
                    ]"
                  />
                  <span class="font-semibold text-sm text-moon/90">
                    {{ getVolumeDisplayTitle(volume) || '未命名卷' }}
                  </span>
                  <span class="text-xs text-moon/60">
                    ({{ volume.chapters?.length || 0 }} 章)
                  </span>
                </div>
              </div>

              <!-- 章节列表 -->
              <div
                v-if="
                  expandedVolumes.has(volume.id) && volume.chapters && volume.chapters.length > 0
                "
                class="ml-6 space-y-1 mt-2"
              >
                <div
                  v-for="chapter in volume.chapters"
                  :key="chapter.id"
                  class="flex items-start gap-2 p-2 rounded hover:bg-white/5 transition-colors"
                >
                  <i class="pi pi-file text-xs text-moon/60 mt-1 flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                      <div class="text-sm text-moon/80 line-clamp-2 flex-1">
                        {{ getChapterDisplayTitle(chapter) || '未命名章节' }}
                      </div>
                      <span class="text-xs text-moon/60 flex-shrink-0">
                        <Skeleton
                          v-if="isLoadingChapterCharCount(chapter)"
                          width="40px"
                          height="12px"
                        />
                        <span v-else>
                          {{ formatCharCount(getChapterCharCountDisplay(chapter)) }} 字
                        </span>
                      </span>
                    </div>
                    <div class="flex items-center gap-3 mt-1 text-xs text-moon/50">
                      <span v-if="chapter.lastUpdated" class="flex items-center gap-1">
                        <i class="pi pi-clock text-[10px]" />
                        {{ formatDate(chapter.lastUpdated) }}
                      </span>
                      <span v-if="chapter.webUrl" class="flex items-center gap-1">
                        <i class="pi pi-link text-[10px]" />
                        <a
                          :href="chapter.webUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-accent-400 hover:text-accent-300 hover:underline break-all transition-colors"
                          @click.stop
                        >
                          {{ chapter.webUrl }}
                        </a>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div
                v-else-if="
                  expandedVolumes.has(volume.id) &&
                  (!volume.chapters || volume.chapters.length === 0)
                "
                class="ml-6 text-xs text-moon/50 italic p-2"
              >
                暂无章节
              </div>
            </div>
          </div>
          <small class="text-moon/60 text-xs block">点击卷标题展开/折叠章节列表（只读）</small>
        </div>
      </div>

      <!-- 右侧封面管理区域 -->
      <div class="w-64 flex-shrink-0">
        <div class="space-y-2 sticky top-0">
          <label class="block text-sm font-medium text-moon/90">封面</label>
          <div class="space-y-2">
            <div
              v-if="formData.cover?.url"
              class="relative w-full aspect-[2/3] overflow-hidden rounded-lg bg-white/5 border border-white/10"
            >
              <img :src="formData.cover.url" alt="封面预览" class="w-full h-full object-cover" />
            </div>
            <div class="flex gap-2 items-stretch">
              <Button
                :label="formData.cover?.url ? '管理封面' : '上传封面'"
                :icon="formData.cover?.url ? 'pi pi-image' : 'pi pi-upload'"
                class="p-button-outlined flex-1"
                @click="showCoverManager = true"
              />
              <Button
                v-if="formData.cover?.url"
                icon="pi pi-times"
                class="p-button-outlined p-button-danger flex-shrink-0 clear-cover-button"
                style="min-width: 2.5rem"
                title="清除封面"
                @click="handleClearCover"
              />
            </div>
            <!-- 封面 URL 显示和复制 -->
            <div v-if="formData.cover?.url" class="space-y-1 p-2 card-base">
              <div class="flex items-center justify-between gap-2">
                <span class="text-moon/60 text-xs">URL:</span>
                <Button
                  icon="pi pi-copy"
                  class="p-button-text p-button-sm"
                  size="small"
                  title="复制 URL"
                  @click="handleCopyUrl"
                />
              </div>
              <a
                :href="formData.cover.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent-400 hover:text-accent-300 hover:underline break-all text-xs cursor-pointer transition-colors"
              >
                {{ formData.cover.url }}
              </a>
            </div>
          </div>
          <small class="text-moon/60 text-xs block">点击按钮管理书籍封面图片</small>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="flex items-center justify-between w-full">
        <Button
          icon="pi pi-download"
          label="导出 JSON"
          class="p-button-text icon-button-hover"
          @click="handleExportJson"
        />
        <div class="flex gap-2">
          <Button
            label="取消"
            icon="pi pi-times"
            class="p-button-text icon-button-hover"
            @click="handleCancel"
          />
          <Button
            label="保存"
            icon="pi pi-check"
            class="p-button-primary icon-button-hover"
            @click="handleSave"
          />
        </div>
      </div>
    </template>

    <!-- 封面管理对话框 -->
    <CoverManagerDialog
      v-model:visible="showCoverManager"
      :cover="formData.cover || null"
      @update:cover="
        (cover) => {
          if (cover) {
            formData.cover = cover;
          } else {
            delete formData.cover;
          }
        }
      "
    />

    <!-- 小说爬虫对话框 -->
    <NovelScraperDialog
      v-model:visible="showScraper"
      :current-book="book || null"
      :initial-url="scraperInitialUrl"
      @apply="handleApplyScrapedData"
    />

    <!-- 清除确认对话框 -->
    <Dialog
      v-model:visible="showClearConfirm"
      header="确认清除所有卷和章节"
      :modal="true"
      :style="{ width: '500px' }"
      :closable="true"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          此操作将永久删除所有卷和章节数据，<strong class="text-red-400">无法撤销</strong>。
        </p>
        <p class="text-moon/90">请输入书籍名称以确认：</p>
        <div class="card-base p-3 flex items-center justify-between gap-2">
          <p class="text-primary font-medium break-all flex-1">
            {{ formData.title || props.book?.title }}
          </p>
          <Button
            icon="pi pi-copy"
            class="p-button-text p-button-sm flex-shrink-0"
            size="small"
            title="复制书名"
            @click="handleCopyBookTitle"
          />
        </div>
        <InputText
          v-model="clearConfirmInput"
          placeholder="输入书籍名称"
          class="w-full"
          @keyup.enter="confirmClearVolumes"
        />
        <small class="text-moon/60 block">输入书名后按回车或点击"确认清除"按钮</small>
      </div>
      <template #footer>
        <Button label="取消" icon="pi pi-times" class="p-button-text" @click="cancelClearVolumes" />
        <Button
          label="确认清除"
          icon="pi pi-trash"
          class="p-button-danger"
          :disabled="
            clearConfirmInput.trim() !== (formData.title || props.book?.title || '').trim()
          "
          @click="confirmClearVolumes"
        />
      </template>
    </Dialog>
  </Dialog>
</template>

<style scoped>
/* 确保清除封面按钮与普通按钮高度一致，并匹配深色主题 */
:deep(.clear-cover-button.p-button-icon-only) {
  height: auto !important;
  padding: 0.625rem 1.25rem !important;
  min-width: 2.5rem !important;
  background: transparent !important;
}

/* 确保 outlined danger 按钮在深色主题中正确显示 */
:deep(.clear-cover-button.p-button-outlined.p-button-danger) {
  background: transparent !important;
}

:deep(.clear-cover-button.p-button-outlined.p-button-danger:hover) {
  background: rgba(255, 143, 163, 0.1) !important;
}
</style>
