import type { InjectionKey, Ref, ComputedRef, Component, CSSProperties } from 'vue';
import type { Novel, Chapter } from 'src/models/novel';

export type ChapterFilter = 'all' | 'imported' | 'unimported' | 'updated';

// 虚拟列表中的卷头条目数据
export interface ScraperVolumeGroup {
  volumeId: string;
  volumeTitle: string;
  chapters: Chapter[];
}

// 虚拟列表项（卷头 / 章节）
export interface ScraperVirtualItem {
  type: 'header' | 'chapter';
  id: string;
  data: ScraperVolumeGroup | Chapter;
  volumeId?: string;
  chapterCount?: number;
}

// 章节导入状态展示信息
export interface ChapterImportStatus {
  text: string;
  class: string;
}

// NovelScraperDialog 子组件共享的上下文（通过 provide/inject 传递，避免大量 prop 透传）
export interface ScraperDialogContext {
  currentBook: ComputedRef<Novel | null | undefined>;
  showNovelInfo: ComputedRef<boolean>;

  urlInput: Ref<string>;
  loading: Ref<boolean>;
  scrapedNovel: Ref<Novel | null>;
  selectedChapterId: Ref<string | null>;
  mobileShowPreview: Ref<boolean>;
  chapterContents: Ref<Map<string, string>>;
  loadingChapters: Ref<Set<string>>;
  chapterErrors: Ref<Map<string, string>>;
  selectedChapters: Ref<Set<string>>;
  chapterFilter: Ref<ChapterFilter>;
  collapsedVolumes: Ref<Set<string>>;
  importing: Ref<boolean>;
  importProgress: Ref<number>;
  importTotal: Ref<number>;
  importCurrent: Ref<number>;
  importCurrentChapter: Ref<string | null>;

  isPhone: ComputedRef<boolean>;
  isValidUrl: ComputedRef<boolean>;
  hasDetailContent: ComputedRef<boolean>;
  supportedSites: ComputedRef<string[]>;
  supportedSitesText: ComputedRef<string>;
  stats: ComputedRef<{ volumes: number; chapters: number }>;
  virtualList: ComputedRef<ScraperVirtualItem[]>;
  displayVolumeChapters: ComputedRef<ScraperVolumeGroup[]>;
  selectedChapter: ComputedRef<Chapter | null>;
  selectedChapterContent: ComputedRef<string | null>;
  selectedChapterImportedContent: ComputedRef<string | null>;
  isSelectedChapterImported: ComputedRef<boolean>;
  selectedChapterImportStatus: ComputedRef<ChapterImportStatus | null>;
  selectedChapterError: ComputedRef<string | null>;
  isAllSelected: ComputedRef<boolean>;

  scraperSheetMaxHeight: ComputedRef<string>;
  scraperSheetMinHeight: ComputedRef<string>;
  bodyClass: ComputedRef<(string | undefined)[] | string[]>;
  showSplitView: ComputedRef<boolean>;
  showChapterPanel: ComputedRef<boolean>;
  showPreviewPanel: ComputedRef<boolean>;
  contentContainerComponent: ComputedRef<Component | string>;
  contentPanelComponent: ComputedRef<Component | string>;
  contentContainerProps: ComputedRef<Record<string, unknown>>;
  chapterPanelProps: ComputedRef<Record<string, unknown>>;
  previewPanelProps: ComputedRef<Record<string, unknown>>;
  contentContainerClass: ComputedRef<string>;
  chapterPanelWrapperClass: ComputedRef<string>;
  previewPanelWrapperClass: ComputedRef<string>;
  contentContainerStyle: ComputedRef<string | undefined>;
  splitPanelContainerStyle: ComputedRef<CSSProperties | undefined>;
  chapterScrollerStyle: ComputedRef<CSSProperties>;
  contentScrollStyle: ComputedRef<CSSProperties>;
  novelInfoClass: ComputedRef<string[]>;
  compareContainerClass: ComputedRef<string>;
  compareImportedClass: ComputedRef<string>;
  compareFetchedClass: ComputedRef<string>;
  chapterItemSize: ComputedRef<number>;

  handleFetch: () => Promise<void>;
  selectChapter: (chapter: Chapter) => void;
  showMobileChapterList: () => void;
  toggleChapterSelection: (chapterId: string, event?: Event) => void;
  toggleSelectAll: () => void;
  toggleVolumeCollapse: (volumeId: string) => void;
  isVolumeCollapsed: (volumeId: string) => boolean;
  toggleVolumeSelection: (volumeId: string) => void;
  isVolumeSelected: (volumeId: string) => boolean;
  getChapterImportStatus: (chapter: Chapter) => ChapterImportStatus | null;
  getChapterWordCount: (chapterId: string) => number | null;
  loadChapterContent: (chapter: Chapter, retry?: boolean) => Promise<void>;
  handleApply: () => Promise<void>;
  handleCancel: () => void;
}

export const SCRAPER_DIALOG_KEY: InjectionKey<ScraperDialogContext> = Symbol('scraperDialog');
