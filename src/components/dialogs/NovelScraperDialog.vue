<script setup lang="ts">
import { ref, computed, watch, nextTick, provide } from 'vue';
import type { CSSProperties } from 'vue';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import ScraperUrlInput from './ScraperUrlInput.vue';
import ScraperLoadingState from './ScraperLoadingState.vue';
import ScraperNovelInfo from './ScraperNovelInfo.vue';
import ScraperChapterList from './ScraperChapterList.vue';
import ScraperChapterPreview from './ScraperChapterPreview.vue';
import ScraperImportFooter from './ScraperImportFooter.vue';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';
import type { Novel, Chapter, Volume } from 'src/models/novel';
import type { BatchFetchResult } from 'src/services/scraper';
import { NovelScraperFactory, ScraperService } from 'src/services/scraper';
import { ChapterService } from 'src/services/chapter-service';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useUiStore } from 'src/stores/ui';
import { getVolumeDisplayTitle } from 'src/utils';

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
const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');
const urlInput = ref('');
const loading = ref(false);
const scrapedNovel = ref<Novel | null>(null);
const selectedChapterId = ref<string | null>(null);
const mobileShowPreview = ref(false);
const chapterContents = ref<Map<string, string>>(new Map());
const loadingChapters = ref<Set<string>>(new Set());
const chapterErrors = ref<Map<string, string>>(new Map());
const selectedChapters = ref<Set<string>>(new Set());
// 本地（已导入）章节内容缓存：key 使用爬取章节的 id，value 为拼接后的文本
const importedChapterContents = ref<Map<string, string>>(new Map());
// 跟踪哪些已导入章节检测到远程内容变化
const contentChangedChapters = ref<Set<string>>(new Set());

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

const hasDetailContent = computed(() => {
  return loading.value || !!scrapedNovel.value;
});

const scraperSheetMaxHeight = computed(() => (hasDetailContent.value ? '92dvh' : '90dvh'));
const scraperSheetMinHeight = computed(() => (hasDetailContent.value ? '92dvh' : 'auto'));

const splitterLayout = computed(() => {
  return isPhone.value ? 'vertical' : 'horizontal';
});

const contentContainerComponent = computed(() => {
  return isPhone.value ? 'div' : Splitter;
});

const contentPanelComponent = computed(() => {
  return isPhone.value ? 'div' : SplitterPanel;
});

const contentContainerProps = computed(() => {
  return isPhone.value
    ? {}
    : {
        layout: splitterLayout.value,
      };
});

const chapterPanelProps = computed(() => {
  return isPhone.value
    ? {}
    : {
        size: chapterPanelSize.value,
        minSize: chapterPanelMinSize.value,
      };
});

const previewPanelProps = computed(() => {
  return isPhone.value
    ? {}
    : {
        size: contentPanelSize.value,
        minSize: contentPanelMinSize.value,
      };
});

const contentContainerClass = computed(() => {
  return isPhone.value ? 'h-full min-h-0 flex flex-col gap-3' : '';
});

const chapterPanelWrapperClass = computed(() => {
  return isPhone.value ? 'min-h-0 flex-[6]' : '';
});

const previewPanelWrapperClass = computed(() => {
  return isPhone.value ? 'min-h-0 flex-[4]' : '';
});

const contentContainerStyle = computed(() => {
  return isPhone.value ? undefined : 'height: 100%';
});

const chapterPanelSize = computed(() => {
  return isPhone.value ? 84 : 40;
});

const chapterPanelMinSize = computed(() => {
  return isPhone.value ? 70 : 30;
});

const contentPanelSize = computed(() => {
  return isPhone.value ? 16 : 60;
});

const contentPanelMinSize = computed(() => {
  return isPhone.value ? 10 : 40;
});

const chapterScrollerStyle = computed(() => {
  if (isPhone.value) {
    return {
      width: '100%',
      height: '100%',
      minHeight: '12rem',
      maxHeight: '100%',
    };
  }
  return {};
});

const contentScrollStyle = computed(() => {
  if (isPhone.value) {
    return {
      height: '100%',
      maxHeight: '100%',
    };
  }
  return {
    maxHeight: '70vh',
  };
});

const novelInfoClass = computed(() => {
  return [
    'card-base p-4 flex-shrink-0 overflow-y-auto w-full min-w-0',
    isPhone.value ? 'max-h-[18dvh]' : 'max-h-[20vh]',
  ];
});

const splitPanelContainerStyle = computed(() => {
  if (!isPhone.value) {
    return undefined;
  }
  const style: CSSProperties = {
    width: '100%',
    minWidth: '0',
    display: 'flex',
    flexDirection: 'column',
  };
  return style;
});

const compareContainerClass = computed(() => {
  return isPhone.value ? 'flex flex-col gap-3 h-full' : 'flex gap-4 h-full';
});

const compareImportedClass = computed(() => {
  return isPhone.value
    ? 'flex-1 flex flex-col pb-3 border-b border-white/10'
    : 'flex-1 flex flex-col border-r border-white/10 pr-4';
});

const compareFetchedClass = computed(() => {
  return isPhone.value ? 'flex-1 flex flex-col' : 'flex-1 flex flex-col pl-4';
});

const chapterItemSize = computed(() => {
  return isPhone.value ? 70 : 80;
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
  contentChangedChapters.value.clear();

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

// 内容加载后，按导入状态与远程更新情况决定是否自动选中该章节
const autoSelectChapterAfterLoad = (chapter: Chapter, content: string) => {
  // 未导入的章节，自动选中
  if (!isChapterImported(chapter)) {
    selectedChapters.value.add(chapter.id);
    return;
  }
  // 已导入但远程更新（日期对比），自动选中
  if (shouldAutoSelectChapter(chapter)) {
    selectedChapters.value.add(chapter.id);
    return;
  }
  // 内容加载后：检测远程内容是否与本地不同
  // chapter.webUrl 由 loadChapterContent 顶部的 guard 保证非空
  const importedChapter = ChapterService.findChapterByUrl(props.currentBook, chapter.webUrl!);
  if (importedChapter && ChapterService.hasContentChanged(importedChapter, content)) {
    contentChangedChapters.value.add(chapter.id);
    selectedChapters.value.add(chapter.id);
  }
};

// 若此时仍无任何选中章节，自动选中所有未导入或远程更新的章节作为默认
const ensureDefaultSelection = () => {
  if (selectedChapters.value.size > 0 || !scrapedNovel.value) return;
  scrapedNovel.value.volumes?.forEach((vol) => {
    vol.chapters?.forEach((ch) => {
      if (!isChapterImported(ch) || shouldAutoSelectChapter(ch)) {
        selectedChapters.value.add(ch.id);
      }
    });
  });
};

// 加载章节内容
const loadChapterContent = async (chapter: Chapter, retry = false) => {
  if (!chapter.webUrl) {
    return;
  }

  // 重试时清除之前的错误与内容；非重试且已有内容则直接返回
  if (retry) {
    chapterErrors.value.delete(chapter.id);
    chapterContents.value.delete(chapter.id);
  } else if (chapterContents.value.has(chapter.id)) {
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

    autoSelectChapterAfterLoad(chapter, content);
    ensureDefaultSelection();
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
  if (isPhone.value) {
    mobileShowPreview.value = true;
  }
  // 如果是已导入的章节，也需要加载新内容以进行对比
  if (!chapterContents.value.has(chapter.id) && chapter.webUrl) {
    void loadChapterContent(chapter).catch((error) => {
      console.error('[NovelScraperDialog] 加载章节内容失败:', error);
    });
  }
  // 异步加载本地（已导入）章节内容用于比对
  if (isChapterImported(chapter)) {
    void loadImportedChapterContent(chapter).catch((error) => {
      console.error('[NovelScraperDialog] 加载已导入章节内容失败:', error);
    });
  }
};

const showMobileChapterList = () => {
  mobileShowPreview.value = false;
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

// 获取章节的导入状态标签信息（使用 ChapterService + 内容变化检测）
const getChapterImportStatus = (chapter: Chapter): { text: string; class: string } | null => {
  const baseStatus = ChapterService.getChapterImportStatus(props.currentBook, chapter);
  // 如果基于日期已经标记为有更新，直接返回
  if (baseStatus && baseStatus.text === '已导入（有更新）') {
    return baseStatus;
  }
  // 如果内容变化检测发现有变化，覆盖标记
  if (contentChangedChapters.value.has(chapter.id)) {
    return {
      text: '已导入（有更新）',
      class: 'px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded flex-shrink-0',
    };
  }
  return baseStatus;
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

// 批量抓取时的章节信息条目
type ChapterFetchItem = { chapterId: string; webUrl: string; title: string };

// 收集所有被选中的章节（用于导入）
const collectChaptersToImport = (): Chapter[] => {
  const chapters: Chapter[] = [];
  scrapedNovel.value?.volumes?.forEach((volume) => {
    volume.chapters?.forEach((chapter) => {
      if (selectedChapters.value.has(chapter.id)) {
        chapters.push(chapter);
      }
    });
  });
  return chapters;
};

// 将章节列表转换为批量抓取所需的 { chapterId, webUrl, title } 条目
const buildFetchList = (chapters: Chapter[]): ChapterFetchItem[] =>
  chapters
    .filter((chapter) => chapter && chapter.webUrl)
    .map((chapter) => ({
      chapterId: chapter.id,
      webUrl: chapter.webUrl!,
      title: typeof chapter.title === 'string' ? chapter.title : chapter.title.original,
    }));

// 构造批量抓取的进度回调：更新进度条与当前章节标题（显示最近完成的章节）
const makeFetchProgressCallback =
  (chaptersToFetch: ChapterFetchItem[]) => (completed: number, total: number) => {
    importCurrent.value = completed;
    importProgress.value = Math.round((completed / total) * 100);
    if (completed > 0 && completed <= chaptersToFetch.length) {
      const recentChapter = chaptersToFetch[completed - 1];
      if (recentChapter) {
        importCurrentChapter.value = recentChapter.title;
      }
    }
  };

// 根据批量抓取结果更新 chapterContents / chapterErrors
const applyFetchResults = (results: BatchFetchResult[], chaptersToFetch: ChapterFetchItem[]) => {
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
};

// 批量加载章节内容（即使已导入也重新获取最新内容）
const fetchSelectedChaptersContent = async (chapters: Chapter[]) => {
  importing.value = true;
  importTotal.value = chapters.length;
  importCurrent.value = 0;
  importProgress.value = 0;
  try {
    const chaptersToFetch = buildFetchList(chapters);
    const results = await ScraperService.fetchChaptersContent(
      chaptersToFetch,
      settingsStore.scraperConcurrencyLimit,
      makeFetchProgressCallback(chaptersToFetch),
    );
    applyFetchResults(results, chaptersToFetch);
  } finally {
    importing.value = false;
    importCurrentChapter.value = null;
  }
};

// 将已加载内容的章节转换为带段落数组的章节；无内容时原样返回
const mapChapterWithContent = (chapter: Chapter): Chapter => {
  const content = chapterContents.value.get(chapter.id);
  if (!content) return chapter;
  // 使用 ChapterService 将内容转换为段落数组
  const paragraphs = ChapterService.convertContentToParagraphs(content);
  return { ...chapter, content: paragraphs.length > 0 ? paragraphs : undefined };
};

// 过滤卷内被选中的章节，无选中章节的卷返回 null
const mapVolumeWithSelectedChapters = (volume: Volume): Volume | null => {
  const filteredChapters = volume.chapters
    ?.filter((chapter) => selectedChapters.value.has(chapter.id))
    .map(mapChapterWithContent)
    .filter((chapter): chapter is Chapter => chapter !== undefined);
  if (filteredChapters && filteredChapters.length > 0) {
    return { ...volume, chapters: filteredChapters };
  }
  return null;
};

// 创建只包含选中章节的小说数据，并将内容附加到章节中
const buildFilteredNovel = (): Novel => {
  const volumes = scrapedNovel
    .value!.volumes?.map(mapVolumeWithSelectedChapters)
    .filter((v): v is Volume => v !== null);
  return {
    ...scrapedNovel.value!,
    ...(volumes && volumes.length > 0 ? { volumes } : {}),
  };
};

// 如果用户输入的 URL 有效且不在小说数据的 webUrl 中，添加到列表中
const mergeInputUrlIntoNovel = (novel: Novel) => {
  if (
    !urlInput.value ||
    urlInput.value.trim() === '' ||
    !NovelScraperFactory.isValidUrl(urlInput.value)
  ) {
    return;
  }
  const inputUrl = urlInput.value.trim();
  const existingUrls = novel.webUrl || [];
  if (!existingUrls.includes(inputUrl)) {
    novel.webUrl = [...existingUrls, inputUrl];
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
  const chaptersToImport = collectChaptersToImport();

  // 检查哪些章节需要加载内容（包括已导入的章节，确保重新获取最新内容）
  const chaptersNeedingContent = chaptersToImport.filter((chapter) => chapter.webUrl);

  // 如果有章节需要加载内容，先批量加载（即使已导入也要重新获取）
  if (chaptersNeedingContent.length > 0) {
    await fetchSelectedChaptersContent(chaptersNeedingContent);

    // 若有章节抓取失败（记录在 chapterErrors 中），则中止导入：
    // 否则失败章节会在 mapChapterWithContent 中回退原始 chapter，把部分失败伪装成成功
    const hasFailedChapters = chaptersNeedingContent.some((chapter) =>
      chapterErrors.value.has(chapter.id),
    );
    if (hasFailedChapters) {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: '部分章节抓取失败，请处理后再继续导入',
        life: 4000,
      });
      return;
    }
  }

  // 创建只包含选中章节的小说数据
  const filteredNovel = buildFilteredNovel();
  mergeInputUrlIntoNovel(filteredNovel);

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
      mobileShowPreview.value = false;
    } else {
      // 设置初始过滤选项
      if (props.initialFilter) {
        chapterFilter.value = props.initialFilter;
      } else {
        // 默认显示所有章节
        chapterFilter.value = 'all';
      }
      mobileShowPreview.value = false;

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

// 对外层模板使用的布局条件（收敛模板中的逻辑或与三元，降低圈复杂度）
const bodyClass = computed(() => [
  'novel-scraper-body flex flex-col space-y-4 py-2 min-w-0',
  hasDetailContent.value ? 'h-full min-h-0' : '',
]);
const showSplitView = computed(() => !!scrapedNovel.value && !loading.value);
const showChapterPanel = computed(() => !isPhone.value || !mobileShowPreview.value);
const showPreviewPanel = computed(() => !isPhone.value || mobileShowPreview.value);

// 将全部共享状态与方法通过 provide 暴露给子组件（避免大量 prop 透传）
provide(SCRAPER_DIALOG_KEY, {
  currentBook: computed(() => props.currentBook),
  showNovelInfo: computed(() => props.showNovelInfo),
  urlInput,
  loading,
  scrapedNovel,
  selectedChapterId,
  mobileShowPreview,
  chapterContents,
  loadingChapters,
  chapterErrors,
  selectedChapters,
  chapterFilter,
  collapsedVolumes,
  importing,
  importProgress,
  importTotal,
  importCurrent,
  importCurrentChapter,
  isPhone,
  isValidUrl,
  hasDetailContent,
  supportedSites,
  supportedSitesText,
  stats,
  virtualList,
  displayVolumeChapters,
  selectedChapter,
  selectedChapterContent,
  selectedChapterImportedContent,
  isSelectedChapterImported,
  selectedChapterImportStatus,
  selectedChapterError,
  isAllSelected,
  scraperSheetMaxHeight,
  scraperSheetMinHeight,
  contentContainerComponent,
  contentPanelComponent,
  contentContainerProps,
  chapterPanelProps,
  previewPanelProps,
  contentContainerClass,
  chapterPanelWrapperClass,
  previewPanelWrapperClass,
  contentContainerStyle,
  splitPanelContainerStyle,
  chapterScrollerStyle,
  contentScrollStyle,
  novelInfoClass,
  compareContainerClass,
  compareImportedClass,
  compareFetchedClass,
  chapterItemSize,
  handleFetch,
  selectChapter,
  showMobileChapterList,
  toggleChapterSelection,
  toggleSelectAll,
  toggleVolumeCollapse,
  isVolumeCollapsed,
  toggleVolumeSelection,
  isVolumeSelected,
  getChapterImportStatus,
  getChapterWordCount,
  loadChapterContent,
  handleApply,
  handleCancel,
});
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    header="从网站获取小说"
    desktop-width="1200px"
    desktop-height="90vh"
    eyebrow="SCRAPER"
    :sheet-max-height="scraperSheetMaxHeight"
    :sheet-min-height="scraperSheetMinHeight"
    dialog-class="novel-scraper-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div :class="bodyClass">
      <!-- URL 输入 -->
      <ScraperUrlInput />

      <!-- 加载中 - 使用骨架屏 -->
      <ScraperLoadingState v-if="loading" />

      <!-- 统计信息 -->
      <ScraperNovelInfo />

      <!-- 左右分栏布局 -->
      <div v-if="showSplitView" class="flex-1 min-h-0 min-w-0">
        <component
          :is="contentContainerComponent"
          v-bind="contentContainerProps"
          :class="contentContainerClass"
          :style="contentContainerStyle"
        >
          <!-- 左侧：章节列表 -->
          <component
            :is="contentPanelComponent"
            v-bind="chapterPanelProps"
            :class="chapterPanelWrapperClass"
            v-show="showChapterPanel"
          >
            <ScraperChapterList />
          </component>

          <!-- 右侧：章节内容 -->
          <component
            :is="contentPanelComponent"
            v-bind="previewPanelProps"
            :class="previewPanelWrapperClass"
            v-show="showPreviewPanel"
          >
            <ScraperChapterPreview />
          </component>
        </component>
      </div>
    </div>

    <template #footer>
      <ScraperImportFooter />
    </template>
  </AdaptiveDialog>
</template>

<!-- Non-scoped styles for teleported Dialog (PrimeVue teleports dialogs to body,
     so scoped :deep() cannot reach them since they lack data-v-xxx attributes) -->
<style>
.novel-scraper-dialog .p-dialog-content {
  overflow: hidden;
  flex: 1 1 auto !important;
}

.novel-scraper-dialog .p-virtualscroller {
  height: 100%;
}

.novel-scraper-dialog .p-virtualscroller-content {
  min-width: 100%;
}

@media (max-width: 640px) {
  .novel-scraper-dialog .p-splitterpanel {
    overflow: hidden;
  }

  .novel-scraper-dialog .p-splitterpanel > div {
    width: 100%;
    min-width: 0;
  }

  .novel-scraper-dialog .p-virtualscroller {
    width: 100%;
  }

  .novel-scraper-dialog .p-dialog-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .novel-scraper-dialog .p-dialog-footer > .scraper-footer-wrapper {
    width: 100%;
  }
}
</style>

<style scoped>
/* 注：.scraper-url-row 已迁移至 ScraperUrlInput.vue，.scraper-footer-actions 已迁移至
 * ScraperImportFooter.vue —— 这两个类渲染在各自子组件内部嵌套元素，父级 scoped 样式无法命中。 */
.novel-scraper-body > * {
  min-width: 0;
}

@media (max-width: 640px) {
  .novel-scraper-body {
    gap: 0.75rem;
    padding-top: 0.25rem;
  }
}
</style>
