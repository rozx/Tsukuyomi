<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Skeleton from 'primevue/skeleton';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import VirtualScroller from 'primevue/virtualscroller';
// 不再需要 words-count 包，直接使用字符串长度计算字符数
import type { Novel, Chapter } from 'src/models/novel';
import { NovelScraperFactory, ScraperService } from 'src/services/scraper';
import { ChapterService } from 'src/services/chapter-service';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useAdaptiveDialog } from 'src/composables/useAdaptiveDialog';
import {
  formatWordCount,
  UniqueIdGenerator,
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
} from 'src/utils';
import co from 'co';

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
    currentBook?: Novel | null;
    initialUrl?: string;
    initialFilter?: 'all' | 'imported' | 'unimported' | 'updated';
    showNovelInfo?: boolean;
  }>(),
  {
    showNovelInfo: true,
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  apply: [novel: Novel];
}>();

const toast = useToastWithHistory();
const settingsStore = useSettingsStore();
const { dialogStyle, dialogClass } = useAdaptiveDialog({
  desktopWidth: '1200px',
  tabletWidth: '96vw',
  desktopHeight: '90vh',
  tabletHeight: '96vh',
});
const urlInput = ref('');
const loading = ref(false);
const scrapedNovel = ref<Novel | null>(null);
const selectedChapterId = ref<string | null>(null);
const chapterContents = ref<Map<string, string>>(new Map());
const loadingChapters = ref<Set<string>>(new Set());
const chapterErrors = ref<Map<string, string>>(new Map());
const selectedChapters = ref<Set<string>>(new Set());
// 本地（已导入）章节内容缓存：key 使用爬取章节的 id，value 为拼接后的文本
const importedChapterContents = ref<Map<string, string>>(new Map());

// 章节过滤和折叠
const chapterFilter = ref<'all' | 'imported' | 'unimported' | 'updated'>('all');
const collapsedVolumes = ref<Set<string>>(new Set());

// 导入进度相关
const importing = ref(false);
const importProgress = ref(0);
const importTotal = ref(0);
const importCurrent = ref(0);
const importCurrentChapter = ref<string | null>(null);

// 统计信息
const stats = computed(() => {
  if (!scrapedNovel.value) {
    return { volumes: 0, chapters: 0 };
  }
  const volumes = scrapedNovel.value.volumes?.length || 0;
  const chapters =
    scrapedNovel.value.volumes?.reduce((sum, vol) => sum + (vol.chapters?.length || 0), 0) || 0;
  return { volumes, chapters };
});

// 验证 URL
const isValidUrl = computed(() => {
  return NovelScraperFactory.isValidUrl(urlInput.value);
});

// 支持的网站列表
const supportedSites = computed(() => {
  return NovelScraperFactory.getSupportedSites();
});

// 支持的网站文本
const supportedSitesText = computed(() => {
  return NovelScraperFactory.getSupportedSitesText();
});

// 过滤后的卷和章节
const filteredVolumes = computed(() => {
  if (!scrapedNovel.value?.volumes) return [];

  return scrapedNovel.value.volumes
    .map((volume) => {
      const filteredChapters =
        volume.chapters?.filter((chapter) => {
          if (chapterFilter.value === 'all') return true;
          if (chapterFilter.value === 'updated') {
            return ChapterService.shouldUpdateChapter(props.currentBook, chapter);
          }
          const imported = isChapterImported(chapter);
          return chapterFilter.value === 'imported' ? imported : !imported;
        }) || [];

      return {
        ...volume,
        chapters: filteredChapters,
      };
    })
    .filter((volume) => volume.chapters && volume.chapters.length > 0);
});

// 按卷组织的章节（用于显示）
const displayVolumeChapters = computed(() => {
  return filteredVolumes.value.map((volume) => ({
    volumeId: volume.id,
    volumeTitle: getVolumeDisplayTitle(volume) || '未命名卷',
    chapters: volume.chapters || [],
  }));
});

// 虚拟列表数据
const virtualList = computed(() => {
  const list: any[] = [];
  displayVolumeChapters.value.forEach((group) => {
    // 卷头
    const chapterCount =
      filteredVolumes.value.find((v) => v.id === group.volumeId)?.chapters?.length || 0;
    list.push({
      type: 'header',
      id: `vol-${group.volumeId}`,
      data: group,
      chapterCount,
    });

    // 章节
    if (!isVolumeCollapsed(group.volumeId)) {
      group.chapters.forEach((chapter) => {
        list.push({
          type: 'chapter',
          id: chapter.id,
          data: chapter,
          volumeId: group.volumeId,
        });
      });
    }
  });
  return list;
});

// 获取小说信息
const handleFetch = async () => {
  if (!isValidUrl.value) {
    toast.add({
      severity: 'error',
      summary: '无效的 URL',
      detail: '请输入支持的小说网站 URL',
      life: 3000,
    });
    return;
  }

  loading.value = true;
  scrapedNovel.value = null;
  chapterContents.value.clear();
  chapterErrors.value.clear();
  selectedChapters.value.clear();
  selectedChapterId.value = null;
  collapsedVolumes.value.clear();

  try {
    const scraper = NovelScraperFactory.getScraper(urlInput.value);
    if (!scraper) {
      toast.add({
        severity: 'error',
        summary: '不支持的网站',
        detail: '该 URL 对应的网站暂不支持',
        life: 3000,
      });
      return;
    }

    const result = await scraper.fetchNovel(urlInput.value);
    if (result.success && result.novel) {
      scrapedNovel.value = result.novel;

      // 自动选中所有未导入的章节，以及已导入但远程更新的章节
      result.novel.volumes?.forEach((volume) => {
        volume.chapters?.forEach((chapter) => {
          if (!isChapterImported(chapter)) {
            // 未导入的章节，自动选中
            selectedChapters.value.add(chapter.id);
          } else if (shouldAutoSelectChapter(chapter)) {
            // 已导入但远程更新的章节，自动选中
            selectedChapters.value.add(chapter.id);
          }
        });
      });

      toast.add({
        severity: 'success',
        summary: '获取成功',
        detail: `成功获取小说信息：${result.novel.title}`,
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: '获取失败',
        detail: result.error || '无法获取小说信息',
        life: 3000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '获取失败',
      detail: error instanceof Error ? error.message : '获取小说信息时发生未知错误',
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
};

// 使用 ChapterService 的方法
// 已不直接使用包装函数，改为直接调用 ChapterService.findChapterByUrl

const isChapterImported = (chapter: Chapter): boolean => {
  return ChapterService.isChapterImported(props.currentBook, chapter);
};

const getImportedChapterContent = (chapter: Chapter): string | null => {
  // 先读缓存
  if (importedChapterContents.value.has(chapter.id)) {
    // 缓存中可能是空字符串，代表已加载但内容为空
    return importedChapterContents.value.get(chapter.id) ?? '';
  }
  // 未缓存时，尝试同步读取（如果本地章节已把 content 载入内存）
  if (!props.currentBook || !chapter.webUrl) {
    return null;
  }
  const importedChapter = ChapterService.findChapterByUrl(props.currentBook, chapter.webUrl);
  if (!importedChapter) {
    return null;
  }
  // 若本地章节已含有 content，则直接返回拼接文本；否则返回 null 等待异步加载
  if (importedChapter.content && importedChapter.content.length > 0) {
    return ChapterService.getChapterContentText(importedChapter);
  }
  return null;
};

const shouldAutoSelectChapter = (chapter: Chapter): boolean => {
  return ChapterService.shouldUpdateChapter(props.currentBook, chapter);
};

// 加载章节内容
const loadChapterContent = async (chapter: Chapter, retry = false) => {
  if (!chapter.webUrl) {
    return;
  }

  // 如果是重试，清除之前的错误
  if (retry) {
    chapterErrors.value.delete(chapter.id);
    chapterContents.value.delete(chapter.id);
  }

  // 如果已经有内容且不是重试，直接返回
  if (chapterContents.value.has(chapter.id) && !retry) {
    return;
  }

  loadingChapters.value.add(chapter.id);
  try {
    const scraper = NovelScraperFactory.getScraper(chapter.webUrl);
    if (!scraper) {
      throw new Error('不支持的网站');
    }

    const content = await scraper.fetchChapterContent(chapter.webUrl);
    chapterContents.value.set(chapter.id, content);
    chapterErrors.value.delete(chapter.id);

    // 自动选中未导入的章节，或已导入但远程更新的章节
    if (!isChapterImported(chapter)) {
      selectedChapters.value.add(chapter.id);
    } else if (shouldAutoSelectChapter(chapter)) {
      // 已导入但远程更新，自动选中
      selectedChapters.value.add(chapter.id);
    }

    // 如果还没有选中任何章节，自动选中所有未导入的章节和已导入但远程更新的章节
    if (selectedChapters.value.size === 0 && scrapedNovel.value) {
      scrapedNovel.value.volumes?.forEach((vol) => {
        vol.chapters?.forEach((ch) => {
          if (!isChapterImported(ch) || shouldAutoSelectChapter(ch)) {
            selectedChapters.value.add(ch.id);
          }
        });
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    chapterErrors.value.set(chapter.id, errorMessage);
    chapterContents.value.delete(chapter.id);
  } finally {
    loadingChapters.value.delete(chapter.id);
  }
};

// 选择章节
const selectChapter = (chapter: Chapter) => {
  selectedChapterId.value = chapter.id;
  // 如果是已导入的章节，也需要加载新内容以进行对比
  if (!chapterContents.value.has(chapter.id) && chapter.webUrl) {
    void co(function* () {
      try {
        yield loadChapterContent(chapter);
      } catch (error) {
        console.error('[NovelScraperDialog] 加载章节内容失败:', error);
      }
    });
  }
  // 异步加载本地（已导入）章节内容用于比对
  if (isChapterImported(chapter)) {
    void co(function* () {
      try {
        yield loadImportedChapterContent(chapter);
      } catch (error) {
        console.error('[NovelScraperDialog] 加载已导入章节内容失败:', error);
      }
    });
  }
};

// 当前选中的章节
const selectedChapter = computed(() => {
  if (!selectedChapterId.value || !scrapedNovel.value) {
    return null;
  }
  for (const volume of scrapedNovel.value.volumes || []) {
    const chapter = volume.chapters?.find((ch) => ch.id === selectedChapterId.value);
    if (chapter) {
      return chapter;
    }
  }
  return null;
});

// 当前选中章节的内容
const selectedChapterContent = computed(() => {
  if (!selectedChapterId.value) {
    return null;
  }
  return chapterContents.value.get(selectedChapterId.value) || null;
});

// 当前选中章节的已导入内容
const selectedChapterImportedContent = computed(() => {
  if (!selectedChapter.value) {
    return null;
  }
  return getImportedChapterContent(selectedChapter.value);
});

// 当前章节是否已导入
const isSelectedChapterImported = computed(() => {
  if (!selectedChapter.value) {
    return false;
  }
  return isChapterImported(selectedChapter.value);
});

// 获取章节的导入状态标签信息（使用 ChapterService）
const getChapterImportStatus = (chapter: Chapter): { text: string; class: string } | null => {
  return ChapterService.getChapterImportStatus(props.currentBook, chapter);
};

// 当前选中章节的导入状态
const selectedChapterImportStatus = computed(() => {
  if (!selectedChapter.value) {
    return null;
  }
  return getChapterImportStatus(selectedChapter.value);
});

// 当前选中章节的错误
const selectedChapterError = computed(() => {
  if (!selectedChapterId.value) {
    return null;
  }
  return chapterErrors.value.get(selectedChapterId.value) || null;
});

// 计算章节字符数
const getChapterWordCount = (chapterId: string): number | null => {
  const content = chapterContents.value.get(chapterId);
  if (!content) {
    return null;
  }
  // 直接使用字符串长度计算字符数（包括所有字符，包括空格和换行符）
  return content.length;
};

// 格式化字数（使用工具函数）
// formatWordCount 已从 utils 导入

// 切换章节选择
const toggleChapterSelection = (chapterId: string, event?: Event) => {
  if (event) {
    event.stopPropagation();
  }
  if (selectedChapters.value.has(chapterId)) {
    selectedChapters.value.delete(chapterId);
  } else {
    selectedChapters.value.add(chapterId);
  }
};

// 全选/取消全选（当前过滤的章节）
const toggleSelectAll = () => {
  if (!scrapedNovel.value) {
    return;
  }

  // 获取当前过滤器中显示的章节 ID
  const filteredChapterIds = new Set<string>();
  filteredVolumes.value.forEach((volume) => {
    volume.chapters?.forEach((chapter) => {
      filteredChapterIds.add(chapter.id);
    });
  });

  // 检查是否所有过滤的章节都已选中
  const allSelected =
    filteredChapterIds.size > 0 &&
    Array.from(filteredChapterIds).every((id) => selectedChapters.value.has(id));

  if (allSelected) {
    // 如果已全选，则取消全选（只取消当前过滤的章节）
    filteredChapterIds.forEach((id) => selectedChapters.value.delete(id));
  } else {
    // 否则全选当前过滤的章节
    filteredChapterIds.forEach((id) => selectedChapters.value.add(id));
  }
};

// 是否全选（当前过滤的章节）
const isAllSelected = computed(() => {
  if (!scrapedNovel.value) {
    return false;
  }

  // 获取当前过滤器中显示的章节 ID
  const filteredChapterIds = new Set<string>();
  filteredVolumes.value.forEach((volume) => {
    volume.chapters?.forEach((chapter) => {
      filteredChapterIds.add(chapter.id);
    });
  });

  return (
    filteredChapterIds.size > 0 &&
    Array.from(filteredChapterIds).every((id) => selectedChapters.value.has(id))
  );
});

// 切换卷的折叠状态
const toggleVolumeCollapse = (volumeId: string) => {
  if (collapsedVolumes.value.has(volumeId)) {
    collapsedVolumes.value.delete(volumeId);
  } else {
    collapsedVolumes.value.add(volumeId);
  }
};

// 检查卷是否折叠
const isVolumeCollapsed = (volumeId: string) => {
  return collapsedVolumes.value.has(volumeId);
};

// 切换卷的选择
const toggleVolumeSelection = (volumeId: string) => {
  const volume = filteredVolumes.value.find((v) => v.id === volumeId);
  if (!volume || !volume.chapters || volume.chapters.length === 0) return;

  const chapterIds = volume.chapters.map((c) => c.id);
  const allSelected = chapterIds.every((id) => selectedChapters.value.has(id));

  if (allSelected) {
    // 取消全选
    chapterIds.forEach((id) => selectedChapters.value.delete(id));
  } else {
    // 全选
    chapterIds.forEach((id) => selectedChapters.value.add(id));
  }
};

// 检查卷是否全选
const isVolumeSelected = (volumeId: string) => {
  const volume = filteredVolumes.value.find((v) => v.id === volumeId);
  if (!volume || !volume.chapters || volume.chapters.length === 0) return false;

  return volume.chapters.every((c) => selectedChapters.value.has(c.id));
};

// 异步加载本地章节内容并写入缓存
const loadImportedChapterContent = async (chapter: Chapter) => {
  try {
    if (!props.currentBook || !chapter.webUrl) return;
    // 缓存命中则跳过
    if (importedChapterContents.value.has(chapter.id)) return;
    const importedChapter = ChapterService.findChapterByUrl(props.currentBook, chapter.webUrl);
    if (!importedChapter) return;
    const loaded = await ChapterService.loadChapterContent(importedChapter);
    const text = ChapterService.getChapterContentText(loaded);
    importedChapterContents.value.set(chapter.id, text);
  } catch {
    // 静默失败：未能加载本地内容时不影响右侧新内容显示
  }
};

// 应用更改
const handleApply = async () => {
  if (!scrapedNovel.value) {
    return;
  }

  // 如果没有选中任何章节，提示用户
  if (selectedChapters.value.size === 0) {
    toast.add({
      severity: 'warn',
      summary: '未选择章节',
      detail: '请至少选择一个章节进行导入',
      life: 3000,
    });
    return;
  }

  // 收集所有需要导入的章节
  const chaptersToImport: Chapter[] = [];
  scrapedNovel.value.volumes?.forEach((volume) => {
    volume.chapters?.forEach((chapter) => {
      if (selectedChapters.value.has(chapter.id)) {
        chaptersToImport.push(chapter);
      }
    });
  });

  // 检查哪些章节需要加载内容（包括已导入的章节，确保重新获取最新内容）
  const chaptersNeedingContent = chaptersToImport.filter((chapter) => chapter.webUrl);

  // 如果有章节需要加载内容，先批量加载（即使已导入也要重新获取）
  if (chaptersNeedingContent.length > 0) {
    importing.value = true;
    importTotal.value = chaptersNeedingContent.length;
    importCurrent.value = 0;
    importProgress.value = 0;

    try {
      // 准备章节数据
      const chaptersToFetch = chaptersNeedingContent
        .filter((chapter) => chapter && chapter.webUrl)
        .map((chapter) => ({
          chapterId: chapter.id,
          webUrl: chapter.webUrl!,
          title: typeof chapter.title === 'string' ? chapter.title : chapter.title.original,
        }));

      // 使用 ScraperService 批量获取章节内容，使用设置中的并发数限制
      const results = await ScraperService.fetchChaptersContent(
        chaptersToFetch,
        settingsStore.scraperConcurrencyLimit,
        (completed, total) => {
          // 更新进度
          importCurrent.value = completed;
          importProgress.value = Math.round((completed / total) * 100);

          // 更新当前正在处理的章节标题（显示最近完成的章节）
          if (completed > 0 && completed <= chaptersToFetch.length) {
            const recentChapter = chaptersToFetch[completed - 1];
            if (recentChapter) {
              importCurrentChapter.value = recentChapter.title;
            }
          }
        },
      );

      // 处理结果
      results.forEach((result, index) => {
        const chapterInfo = chaptersToFetch[index];
        if (!chapterInfo) {
          return;
        }

        if (result.success && result.result) {
          // 成功：保存内容
          chapterContents.value.set(result.result.chapterId, result.result.content);
          chapterErrors.value.delete(result.result.chapterId);
        } else {
          // 失败：记录错误
          const errorMessage = result.error?.message || '未知错误';
          chapterErrors.value.set(chapterInfo.chapterId, errorMessage);
          chapterContents.value.delete(chapterInfo.chapterId);
        }
      });
    } finally {
      importing.value = false;
      importCurrentChapter.value = null;
    }
  }

  // 创建只包含选中章节的小说数据，并将内容添加到章节中
  const filteredVolumes = scrapedNovel.value.volumes
    ?.map((volume) => {
      const filteredChapters = volume.chapters
        ?.filter((chapter) => selectedChapters.value.has(chapter.id))
        .map((chapter) => {
          // 如果章节有内容，创建段落数组
          const content = chapterContents.value.get(chapter.id);
          if (content) {
            // 使用 ChapterService 将内容转换为段落数组
            const paragraphs = ChapterService.convertContentToParagraphs(content);

            return {
              ...chapter,
              content: paragraphs.length > 0 ? paragraphs : undefined,
            };
          }
          return chapter;
        })
        .filter((chapter): chapter is Chapter => chapter !== undefined);

      if (filteredChapters && filteredChapters.length > 0) {
        return {
          ...volume,
          chapters: filteredChapters,
        };
      }
      return null;
    })
    .filter((volume): volume is NonNullable<typeof volume> => volume !== null);

  const filteredNovel: Novel = {
    ...scrapedNovel.value,
    ...(filteredVolumes && filteredVolumes.length > 0 ? { volumes: filteredVolumes } : {}),
  };

  // 如果用户输入的 URL 有效且不在小说数据的 webUrl 中，添加到列表中
  if (
    urlInput.value &&
    urlInput.value.trim() !== '' &&
    NovelScraperFactory.isValidUrl(urlInput.value)
  ) {
    const inputUrl = urlInput.value.trim();
    const existingUrls = filteredNovel.webUrl || [];
    if (!existingUrls.includes(inputUrl)) {
      filteredNovel.webUrl = [...existingUrls, inputUrl];
    }
  }

  // 发出过滤后的小说数据
  emit('apply', filteredNovel);

  // 立即关闭对话框，让父组件在后台处理保存操作
  emit('update:visible', false);
};

// 处理取消
const handleCancel = () => {
  emit('update:visible', false);
};

// 监听 visible 变化，重置状态
watch(
  () => props.visible,
  (newVisible) => {
    if (!newVisible) {
      urlInput.value = '';
      scrapedNovel.value = null;
      chapterContents.value.clear();
      chapterErrors.value.clear();
      selectedChapters.value.clear();
      selectedChapterId.value = null;
      loadingChapters.value.clear();
      importedChapterContents.value.clear();
      chapterFilter.value = 'all';
    } else {
      // 设置初始过滤选项
      if (props.initialFilter) {
        chapterFilter.value = props.initialFilter;
      } else {
        // 默认显示所有章节
        chapterFilter.value = 'all';
      }

      // 只有当明确传入 initialUrl 时才自动填充并触发获取
      // 如果 initialUrl 为空字符串或未传入，则不自动填充（避免从 currentBook 自动填充）
      if (
        props.initialUrl &&
        props.initialUrl.trim() !== '' &&
        NovelScraperFactory.isValidUrl(props.initialUrl)
      ) {
        urlInput.value = props.initialUrl;
        // 如果提供了 initialUrl，自动触发获取
        void nextTick(() => {
          void handleFetch();
        });
      } else {
        // 不传 initialUrl 时，清空输入框，让用户手动输入
        urlInput.value = '';
      }
    }
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    header="从网站获取小说"
    :modal="true"
    :style="dialogStyle"
    :closable="true"
    :class="['novel-scraper-dialog', dialogClass]"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="flex flex-col h-full space-y-4 py-2">
      <!-- URL 输入 -->
      <div class="space-y-2 flex-shrink-0">
        <label class="block text-sm font-medium text-moon/90">小说 URL</label>
        <div class="flex gap-2">
          <InputText
            v-model="urlInput"
            :placeholder="`输入 ${supportedSitesText} 的小说 URL`"
            class="flex-1"
            :class="{ 'p-invalid': urlInput && !isValidUrl }"
            @keyup.enter="handleFetch"
          />
          <Button
            label="获取"
            icon="pi pi-search"
            :loading="loading"
            :disabled="!isValidUrl || loading"
            @click="handleFetch"
          />
        </div>
        <small v-if="urlInput && !isValidUrl" class="p-error block">
          请输入支持的小说网站 URL（当前支持：{{ supportedSitesText }}）
        </small>
        <div class="flex items-center gap-2 flex-wrap">
          <small class="text-moon/60">支持的网站：</small>
          <div class="flex gap-2 flex-wrap">
            <span v-for="site in supportedSites" :key="site" class="site-badge">
              {{ site }}
            </span>
          </div>
        </div>
      </div>

      <!-- 加载中 - 使用骨架屏 -->
      <div v-if="loading" class="flex-1 min-h-0">
        <div class="space-y-4">
          <!-- 标题骨架 -->
          <div class="p-4 bg-white/5 rounded-lg border border-white/10">
            <Skeleton width="60%" height="2rem" class="mb-3" />
            <Skeleton width="40%" height="1.5rem" />
          </div>
          <!-- 内容骨架 -->
          <div class="flex-1 min-h-0">
            <Splitter style="height: 100%">
              <SplitterPanel :size="40">
                <div class="h-full flex flex-col p-4">
                  <Skeleton width="30%" height="1.5rem" class="mb-4" />
                  <div class="space-y-3 flex-1">
                    <Skeleton width="100%" height="4rem" v-for="i in 5" :key="i" />
                  </div>
                </div>
              </SplitterPanel>
              <SplitterPanel :size="60">
                <div class="h-full flex flex-col p-4">
                  <Skeleton width="50%" height="1.5rem" class="mb-4" />
                  <div class="space-y-2 flex-1">
                    <Skeleton width="100%" height="1rem" v-for="i in 10" :key="i" />
                  </div>
                </div>
              </SplitterPanel>
            </Splitter>
          </div>
        </div>
      </div>

      <!-- 统计信息 -->
      <div
        v-if="scrapedNovel && !loading && showNovelInfo"
        class="card-base p-4 flex-shrink-0 max-h-[40vh] overflow-y-auto"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-moon/90 mb-1">{{ scrapedNovel.title }}</h3>
            <div class="flex items-center gap-4 text-sm text-moon/70">
              <span v-if="scrapedNovel.author">作者: {{ scrapedNovel.author }}</span>
              <span>卷数: {{ stats.volumes }}</span>
              <span>章节数: {{ stats.chapters }}</span>
            </div>
          </div>
        </div>
        <div v-if="scrapedNovel.description" class="mt-3 text-sm text-moon/80 whitespace-pre-wrap">
          {{ scrapedNovel.description }}
        </div>
        <div
          v-if="scrapedNovel.tags && scrapedNovel.tags.length > 0"
          class="mt-3 flex flex-wrap gap-2"
        >
          <span v-for="tag in scrapedNovel.tags" :key="tag" class="novel-tag">
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- 左右分栏布局 -->
      <div v-if="scrapedNovel && !loading" class="flex-1 min-h-0">
        <Splitter style="height: 100%">
          <!-- 左侧：章节列表 -->
          <SplitterPanel :size="40" :min-size="30">
            <div
              class="h-full flex flex-col bg-night-900/50 rounded-lg border border-white/10 overflow-hidden"
            >
              <div class="px-4 py-3 border-b border-white/10 flex-shrink-0 bg-white/5 space-y-2">
                <div class="flex items-center justify-between min-w-0 gap-2">
                  <h4 class="text-md font-semibold text-moon/90 flex-shrink-0">章节列表</h4>
                  <div class="flex items-center gap-2 flex-1 justify-end">
                    <div class="flex gap-1">
                      <Button
                        label="全部"
                        :class="chapterFilter === 'all' ? '' : 'p-button-outlined'"
                        class="p-button-sm icon-button-hover"
                        @click="chapterFilter = 'all'"
                      />
                      <Button
                        label="已导入"
                        :class="chapterFilter === 'imported' ? '' : 'p-button-outlined'"
                        class="p-button-sm icon-button-hover"
                        @click="chapterFilter = 'imported'"
                      />
                      <Button
                        label="未导入"
                        :class="chapterFilter === 'unimported' ? '' : 'p-button-outlined'"
                        class="p-button-sm icon-button-hover"
                        @click="chapterFilter = 'unimported'"
                      />
                      <Button
                        label="有更新"
                        :class="chapterFilter === 'updated' ? '' : 'p-button-outlined'"
                        class="p-button-sm icon-button-hover"
                        @click="chapterFilter = 'updated'"
                      />
                    </div>
                    <Button
                      :label="isAllSelected ? '取消' : '全选'"
                      icon="pi pi-check-square"
                      class="p-button-text p-button-sm text-moon/70 hover:text-moon/90 flex-shrink-0"
                      @click="toggleSelectAll"
                    />
                  </div>
                </div>
              </div>
              <div class="flex-1 min-h-0 px-3 py-2 overflow-hidden">
                <VirtualScroller
                  :items="virtualList"
                  :itemSize="80"
                  class="border-0"
                  style="height: calc(90vh - 300px); max-height: calc(90vh - 300px)"
                >
                  <template #item="{ item }">
                    <!-- 卷头 -->
                    <div v-if="item.type === 'header'" class="pb-2">
                      <div
                        class="text-sm font-semibold text-moon/80 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg cursor-pointer hover:bg-primary/15 transition-colors flex items-center justify-between gap-2"
                        @click="toggleVolumeCollapse(item.data.volumeId)"
                      >
                        <div class="flex-shrink-0" @click.stop>
                          <Checkbox
                            :model-value="isVolumeSelected(item.data.volumeId)"
                            :binary="true"
                            @update:model-value="toggleVolumeSelection(item.data.volumeId)"
                          />
                        </div>
                        <span class="flex-1">
                          {{ item.data.volumeTitle }} ({{ item.chapterCount }} 章)
                        </span>
                        <i
                          :class="
                            isVolumeCollapsed(item.data.volumeId)
                              ? 'pi pi-chevron-right'
                              : 'pi pi-chevron-down'
                          "
                          class="text-xs text-moon/60"
                        />
                      </div>
                    </div>

                    <!-- 章节 -->
                    <div v-else class="pb-2">
                      <div
                        class="list-item-base cursor-pointer min-w-0"
                        :class="
                          selectedChapterId === item.data.id
                            ? 'list-item-selected'
                            : 'hover:list-item-hover'
                        "
                        @click="selectChapter(item.data)"
                      >
                        <div class="flex items-start gap-3 min-w-0">
                          <div class="flex-shrink-0 mt-0.5" @click.stop>
                            <Checkbox
                              :model-value="selectedChapters.has(item.data.id)"
                              :binary="true"
                              @update:model-value="toggleChapterSelection(item.data.id)"
                            />
                          </div>
                          <div class="flex-1 min-w-0 w-0 overflow-hidden">
                            <div class="flex items-start justify-between gap-2">
                              <div class="font-medium text-sm text-moon/90 line-clamp-2 flex-1">
                                {{ getChapterDisplayTitle(item.data, currentBook || undefined) }}
                              </div>
                              <template v-if="getChapterImportStatus(item.data)">
                                <span :class="getChapterImportStatus(item.data)!.class">
                                  {{ getChapterImportStatus(item.data)!.text }}
                                </span>
                              </template>
                            </div>
                            <div class="flex items-center gap-3 mt-2 text-xs">
                              <span
                                v-if="chapterContents.has(item.data.id)"
                                class="text-moon/70 font-medium"
                              >
                                字数:
                                <span class="novel-word-count">{{
                                  formatWordCount(getChapterWordCount(item.data.id))
                                }}</span>
                              </span>
                              <span
                                v-else-if="loadingChapters.has(item.data.id)"
                                class="text-moon/50 italic"
                              >
                                计算中...
                              </span>
                              <span v-else class="text-moon/40"> 未加载 </span>
                              <span
                                v-if="item.data.lastUpdated"
                                class="text-moon/50 flex items-center gap-1"
                              >
                                <i class="pi pi-clock text-[10px]" />
                                {{ formatDate(item.data.lastUpdated) }}
                              </span>
                            </div>
                            <div
                              v-if="item.data.webUrl"
                              class="mt-2 w-full max-w-full overflow-hidden"
                            >
                              <a
                                :href="item.data.webUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-xs text-primary/80 hover:text-primary hover:underline block w-full overflow-hidden overflow-ellipsis whitespace-nowrap"
                                style="max-width: 100%"
                                @click.stop
                              >
                                {{ item.data.webUrl }}
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </VirtualScroller>
                <div
                  v-if="displayVolumeChapters.length === 0"
                  class="flex items-center justify-center py-8"
                >
                  <div class="text-center text-moon/60">没有找到章节</div>
                </div>
              </div>
            </div>
          </SplitterPanel>

          <!-- 右侧：章节内容 -->
          <SplitterPanel :size="60" :min-size="40">
            <div
              class="h-full flex flex-col bg-night-900/50 rounded-lg border border-white/10 overflow-hidden"
            >
              <div
                v-if="selectedChapter"
                class="px-4 py-3 border-b border-white/10 flex-shrink-0 bg-white/5"
              >
                <div class="flex items-start justify-between gap-2 mb-2">
                  <h4 class="text-lg font-semibold text-moon/90 flex-1">
                    {{ getChapterDisplayTitle(selectedChapter, currentBook || undefined) }}
                  </h4>
                  <span
                    v-if="selectedChapterImportStatus"
                    :class="selectedChapterImportStatus.class"
                  >
                    {{ selectedChapterImportStatus.text }}
                  </span>
                </div>
                <div
                  v-if="selectedChapter.webUrl || selectedChapter.lastUpdated"
                  class="flex items-center gap-2 flex-wrap"
                >
                  <a
                    v-if="selectedChapter.webUrl"
                    :href="selectedChapter.webUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-primary/80 hover:text-primary hover:underline truncate"
                  >
                    {{ selectedChapter.webUrl }}
                  </a>
                  <span v-if="chapterContents.has(selectedChapter.id)" class="text-xs text-moon/60">
                    · {{ formatWordCount(getChapterWordCount(selectedChapter.id)) }} 字
                  </span>
                  <span
                    v-if="selectedChapter.lastUpdated"
                    class="text-xs text-moon/50 flex items-center gap-1"
                  >
                    <i class="pi pi-clock text-[10px]" />
                    {{ formatDate(selectedChapter.lastUpdated) }}
                  </span>
                </div>
              </div>
              <div v-else class="px-4 py-3 border-b border-white/10 flex-shrink-0 bg-white/5">
                <h4 class="text-lg font-semibold text-moon/60">请从左侧选择章节</h4>
              </div>
              <div class="flex-1 overflow-y-auto px-6 py-4 max-h-[70vh]">
                <!-- 加载中 - 使用骨架屏 -->
                <div v-if="loadingChapters.has(selectedChapterId || '')" class="py-4 space-y-2">
                  <Skeleton width="100%" height="1rem" v-for="i in 15" :key="i" />
                </div>
                <!-- 错误状态 -->
                <div
                  v-else-if="selectedChapterError"
                  class="flex flex-col items-center justify-center py-12 space-y-4"
                >
                  <i class="pi pi-exclamation-triangle text-4xl text-red-400/70" />
                  <div class="text-center space-y-2">
                    <p class="text-moon/90 font-medium">加载失败</p>
                    <p class="text-sm text-moon/60">{{ selectedChapterError }}</p>
                  </div>
                  <Button
                    label="重试"
                    icon="pi pi-refresh"
                    class="p-button-outlined p-button-sm"
                    @click="selectedChapter && loadChapterContent(selectedChapter, true)"
                  />
                </div>
                <!-- 已导入章节的差异对比 -->
                <div
                  v-else-if="
                    isSelectedChapterImported &&
                    selectedChapterImportedContent !== null &&
                    selectedChapterContent
                  "
                  class="h-full"
                >
                  <div class="flex gap-4 h-full">
                    <!-- 左侧：已导入内容 -->
                    <div class="flex-1 flex flex-col border-r border-white/10 pr-4">
                      <div class="mb-3 pb-2 border-b border-white/10 flex-shrink-0">
                        <h5 class="text-sm font-semibold text-moon/90 mb-1">已导入内容</h5>
                        <span class="text-xs text-moon/60">
                          {{ formatWordCount(selectedChapterImportedContent.length) }} 字
                        </span>
                      </div>
                      <div class="flex-1 overflow-y-auto">
                        <div
                          class="text-sm text-moon/80 whitespace-pre-line leading-relaxed prose prose-invert max-w-none"
                        >
                          {{ selectedChapterImportedContent }}
                        </div>
                      </div>
                    </div>
                    <!-- 右侧：新获取内容 -->
                    <div class="flex-1 flex flex-col pl-4">
                      <div class="mb-3 pb-2 border-b border-white/10 flex-shrink-0">
                        <h5 class="text-sm font-semibold text-moon/90 mb-1">新获取内容</h5>
                        <span class="text-xs text-moon/60">
                          {{ formatWordCount(selectedChapterContent.length) }} 字
                        </span>
                      </div>
                      <div class="flex-1 overflow-y-auto">
                        <div
                          class="text-sm text-moon/80 whitespace-pre-line leading-relaxed prose prose-invert max-w-none"
                        >
                          {{ selectedChapterContent }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- 已导入章节但新内容未加载 -->
                <div
                  v-else-if="
                    isSelectedChapterImported &&
                    selectedChapterImportedContent !== null &&
                    !selectedChapterContent
                  "
                  class="h-full"
                >
                  <div class="flex gap-4 h-full">
                    <!-- 左侧：已导入内容 -->
                    <div class="flex-1 flex flex-col border-r border-white/10 pr-4">
                      <div class="mb-3 pb-2 border-b border-white/10 flex-shrink-0">
                        <h5 class="text-sm font-semibold text-moon/90 mb-1">已导入内容</h5>
                        <span class="text-xs text-moon/60">
                          {{ formatWordCount(selectedChapterImportedContent.length) }} 字
                        </span>
                      </div>
                      <div class="flex-1 overflow-y-auto">
                        <div
                          class="text-sm text-moon/80 whitespace-pre-line leading-relaxed prose prose-invert max-w-none"
                        >
                          {{ selectedChapterImportedContent }}
                        </div>
                      </div>
                    </div>
                    <!-- 右侧：等待加载新内容 -->
                    <div class="flex-1 flex flex-col items-center justify-center pl-4 text-moon/60">
                      <i class="pi pi-spin pi-spinner text-4xl text-moon/40 mb-4 block" />
                      <p>正在加载新内容以进行对比...</p>
                    </div>
                  </div>
                </div>
                <!-- 内容显示（未导入章节） -->
                <div
                  v-else-if="selectedChapterContent"
                  class="text-sm text-moon/80 whitespace-pre-line leading-relaxed prose prose-invert max-w-none"
                >
                  {{ selectedChapterContent }}
                </div>
                <!-- 未选择章节 -->
                <div v-else-if="selectedChapter" class="text-moon/60 text-center py-12">
                  <i class="pi pi-file text-4xl text-moon/40 mb-4 block" />
                  <p>点击章节加载内容</p>
                </div>
                <div v-else class="text-moon/60 text-center py-12">
                  <i class="pi pi-arrow-left text-4xl text-moon/40 mb-4 block" />
                  <p>请从左侧选择章节查看内容</p>
                </div>
              </div>
            </div>
          </SplitterPanel>
        </Splitter>
      </div>
    </div>

    <template #footer>
      <div class="flex-1">
        <!-- 导入进度条 -->
        <div v-if="importing" class="mb-4 space-y-2">
          <div class="flex items-center justify-between text-sm text-moon/80">
            <span>正在导入章节内容...</span>
            <span>{{ importCurrent }} / {{ importTotal }}</span>
          </div>
          <ProgressBar :value="importProgress" class="w-full" />
          <div v-if="importCurrentChapter" class="text-xs text-moon/60 truncate">
            当前: {{ importCurrentChapter }}
          </div>
        </div>
      </div>
      <div class="flex gap-2">
        <Button
          label="取消"
          icon="pi pi-times"
          class="p-button-text icon-button-hover"
          :disabled="importing"
          @click="handleCancel"
        />
        <Button
          :label="`应用${selectedChapters.size > 0 ? ` (${selectedChapters.size})` : ''}`"
          icon="pi pi-check"
          class="p-button-primary icon-button-hover"
          :disabled="!scrapedNovel || selectedChapters.size === 0 || importing"
          :loading="importing"
          @click="handleApply"
        />
      </div>
    </template>
  </Dialog>
</template>
