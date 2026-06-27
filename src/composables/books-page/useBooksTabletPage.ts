/**
 * BooksPageTablet（书库 · 平板主从布局）业务逻辑 composable + provide/inject 辅助。
 *
 * 平板变体持有大量本地 UI 状态（当前选中书、列表 dock、编辑模式、卷展开、章节翻译
 * 进度、卷 / 章节 ⋮ 动作菜单、排序移动等），并复用 useChapterManagement 的对话框 CRUD。
 * 为了把超大模板拆成多个片段（Sidebar / Detail / SideRail 等）而不在它们之间手传
 * 十几个 prop，本 composable 在 BooksPageTablet 中调用一次并 provide；片段通过
 * injectBooksTabletPage() 取同一份状态。全局书籍数据仍来自 injectBooksPage()。
 */
import { computed, reactive, ref, watch, provide, inject, type InjectionKey } from 'vue';
import { useRouter } from 'vue-router';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useBooksStore } from 'src/stores/books';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useTabletRightRail } from 'src/composables/useTabletRightRail';
import { injectBooksPage } from 'src/composables/books-page/useBooksPage';
import { useChapterManagement } from 'src/composables/book-details/useChapterManagement';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import { isPortrait } from 'src/utils/device-orientation';
import { getVolumeDisplayTitle } from 'src/utils/novel-utils';
import {
  getChapterStatus,
  chapterStatusIcon,
  chapterStatusColor,
  chapterStatusTextColor,
  chapterStatusLabel,
  type ChapterProgressMap,
} from 'src/utils/chapter-status';
import {
  buildVolumeActionMenuItems,
  buildChapterActionMenuItems,
} from 'src/components/novel/volumes-list-utils';
import type Menu from 'primevue/menu';
import type { Chapter, Novel, Paragraph, Volume } from 'src/models/novel';

export type BooksTabletPageContext = ReturnType<typeof createBooksTabletPageContext>;

const BOOKS_TABLET_PAGE_KEY: InjectionKey<BooksTabletPageContext> = Symbol('books-tablet-page');

function collectChapterIds(book: Novel): string[] {
  const ids: string[] = [];
  for (const vol of book.volumes ?? []) {
    for (const ch of vol.chapters ?? []) ids.push(ch.id);
  }
  return ids;
}

function buildChapterProgressMap(
  chapterIds: string[],
  contents: Map<string, Paragraph[] | undefined>,
): ChapterProgressMap {
  const map: ChapterProgressMap = new Map();
  for (const id of chapterIds) {
    const paras = contents.get(id) ?? [];
    const nonEmpty = paras.filter((p) => (p.text ?? '').trim().length > 0);
    const total = nonEmpty.length;
    const translated = nonEmpty.filter((p) => (p.translations?.length ?? 0) > 0).length;
    map.set(id, { total, translated });
  }
  return map;
}

function createBooksTabletPageContext() {
  const ctx = injectBooksPage();
  const router = useRouter();
  const bookDetailsStore = useBookDetailsStore();
  const booksStore = useBooksStore();
  const toast = useToastWithHistory();
  const { isChatActive, isProgressActive, activeTranslationTaskCount, toggleRail } =
    useTabletRightRail();

  // 添加书籍菜单：与桌面 SplitButton、手机底部选择器语义一致
  const addMenuRef = ref<InstanceType<typeof Menu> | null>(null);
  const addMenuItems = computed(() => [
    { label: '新建书籍', icon: 'pi pi-plus', command: () => ctx.addBook() },
    { label: '从网站导入', icon: 'pi pi-globe', command: () => ctx.importBookFromWeb() },
    { label: '从 JSON 导入', icon: 'pi pi-file-import', command: () => ctx.importBookFromJson() },
  ]);
  const toggleAddMenu = (event: Event) => addMenuRef.value?.toggle(event);
  const toggleSortMenu = (event: Event) => {
    ctx.sortMenuRef.value?.toggle(event);
  };
  const currentSortLabel = computed(
    () => ctx.sortOptions.find((opt) => opt.value === ctx.selectedSort.value)?.label ?? '排序',
  );

  // 本地 UI 状态：当前选中的书（主从布局右侧详情）。不写入任何 store。
  const selectedBookId = ref<string | null>(null);
  const isListOpen = ref(true);
  const toggleList = () => {
    isListOpen.value = !isListOpen.value;
  };
  const selectBook = (book: Novel) => {
    selectedBookId.value = book.id;
    // 竖屏：挑中后自动收起 list；横屏 list 常驻不动。
    if (isPortrait()) isListOpen.value = false;
  };
  const selectedBook = computed<Novel | null>(() => {
    const list = ctx.filteredBooks.value;
    if (list.length === 0) return null;
    const match = list.find((b) => b.id === selectedBookId.value);
    return match ?? list[0] ?? null;
  });
  watch(
    () => ctx.filteredBooks.value,
    (list) => {
      if (list.length === 0) {
        selectedBookId.value = null;
        return;
      }
      if (!list.find((b) => b.id === selectedBookId.value)) {
        selectedBookId.value = list[0]!.id;
      }
    },
    { immediate: true },
  );

  // 当前选中书的章节翻译进度（懒加载，切书时重算）
  const progressByChapter = ref<ChapterProgressMap | null>(null);
  const isLoadingProgress = ref(false);
  let progressLoadToken = 0;
  async function loadProgressFor(book: Novel | null) {
    const token = ++progressLoadToken;
    if (!book) {
      progressByChapter.value = null;
      isLoadingProgress.value = false;
      return;
    }
    const chapterIds = collectChapterIds(book);
    if (chapterIds.length === 0) {
      if (token === progressLoadToken) {
        progressByChapter.value = new Map();
        isLoadingProgress.value = false;
      }
      return;
    }
    isLoadingProgress.value = true;
    try {
      const contents = await ChapterContentService.loadChapterContentsBatch(chapterIds);
      if (token !== progressLoadToken) return; // 切书后丢弃旧结果
      progressByChapter.value = buildChapterProgressMap(chapterIds, contents);
    } catch (err) {
      // 章节内容批量加载失败：记录并提示，同时清空进度避免显示陈旧状态。
      // 否则异常会穿透到 watch 的 void loadProgressFor(...) 形成未处理 Promise，用户也看不到错误。
      if (token === progressLoadToken) progressByChapter.value = null;
      console.error('[useBooksTabletPage] 加载章节翻译进度失败:', err);
      toast.add({
        severity: 'error',
        summary: '进度加载失败',
        detail: err instanceof Error ? err.message : String(err),
        life: 3000,
      });
    } finally {
      if (token === progressLoadToken) isLoadingProgress.value = false;
    }
  }
  watch(
    () => selectedBook.value?.id ?? null,
    () => void loadProgressFor(selectedBook.value),
    { immediate: true },
  );

  // 卷展开 / 折叠状态（默认折叠，只显示前 COLLAPSED_PREVIEW 章作为预览）
  const COLLAPSED_PREVIEW = 5;
  const expandedVolumes = reactive<Record<string, boolean>>({});
  const isVolumeExpanded = (id: string): boolean => expandedVolumes[id] === true;
  const toggleVolume = (id: string): void => {
    expandedVolumes[id] = !isVolumeExpanded(id);
  };
  const visibleChapters = (volumeId: string, chapters: Chapter[]): Chapter[] =>
    isVolumeExpanded(volumeId) ? chapters : chapters.slice(0, COLLAPSED_PREVIEW);

  const chIcon = (id: string) => chapterStatusIcon(getChapterStatus(progressByChapter.value, id));
  const chColor = (id: string) => chapterStatusColor(getChapterStatus(progressByChapter.value, id));
  const chTextColor = (id: string) =>
    chapterStatusTextColor(getChapterStatus(progressByChapter.value, id));
  const chLabel = (id: string) => chapterStatusLabel(progressByChapter.value, id);

  const editMode = ref(false);
  const toggleEditMode = () => {
    editMode.value = !editMode.value;
  };
  const chapterRowRole = (chapter: Chapter) => (editMode.value ? undefined : 'button');

  function openChapter(book: Novel, chapter: Chapter): void {
    if (editMode.value) return; // 编辑模式下章节点击无效，避免误触离开列表
    void bookDetailsStore.setSelectedChapter(book.id, chapter.id);
    void router.push(`/books/${book.id}`);
  }

  // ───── 卷 / 章节编辑（复用 useChapterManagement 的 dialog 状态 + CRUD） ─────
  const selectedBookForEdit = computed<Novel | undefined>(() => selectedBook.value ?? undefined);
  const chapterMgmt = useChapterManagement(selectedBookForEdit);
  const volumeOptions = computed(() =>
    (selectedBook.value?.volumes ?? []).map((v) => ({ label: getVolumeDisplayTitle(v), value: v.id })),
  );

  // ⋮ 动作菜单：单个 Menu 实例，根据当前 target 动态生成菜单项
  const actionMenuRef = ref<InstanceType<typeof Menu> | null>(null);
  type ActionTarget =
    | { kind: 'volume'; volume: Volume }
    | { kind: 'chapter'; chapter: Chapter; volumeId: string; index: number };
  const actionTarget = ref<ActionTarget | null>(null);
  const actionMenuItems = computed(() => {
    const target = actionTarget.value;
    if (!target) return [];
    if (target.kind === 'volume') {
      return buildVolumeActionMenuItems({
        onEdit: () => chapterMgmt.openEditVolumeDialog(target.volume),
        onDelete: () => chapterMgmt.openDeleteVolumeConfirm(target.volume),
      });
    }
    const vol = selectedBook.value?.volumes?.find((v) => v.id === target.volumeId);
    const canMoveDown = !!vol?.chapters && target.index < vol.chapters.length - 1;
    return buildChapterActionMenuItems({
      canMoveUp: target.index > 0,
      canMoveDown,
      onEdit: () => chapterMgmt.openEditChapterDialog(target.chapter),
      onMoveUp: () => void moveChapter(target, 'up'),
      onMoveDown: () => void moveChapter(target, 'down'),
      onDelete: () => chapterMgmt.openDeleteChapterConfirm(target.chapter),
    });
  });
  const openVolumeMenu = (event: Event, volume: Volume) => {
    event.stopPropagation();
    actionTarget.value = { kind: 'volume', volume };
    actionMenuRef.value?.toggle(event);
  };
  const openChapterMenu = (
    event: Event,
    chapter: Chapter,
    volumeId: string,
    index: number,
  ) => {
    event.stopPropagation();
    actionTarget.value = { kind: 'chapter', chapter, volumeId, index };
    actionMenuRef.value?.toggle(event);
  };

  const isMovingChapter = ref(false);
  function resolveMoveTargetIndex(
    book: Novel,
    target: { volumeId: string; index: number },
    direction: 'up' | 'down',
  ): number | null {
    const newIndex = direction === 'up' ? target.index - 1 : target.index + 1;
    if (newIndex < 0) return null;
    const vol = book.volumes?.find((v) => v.id === target.volumeId);
    if (!vol?.chapters || newIndex >= vol.chapters.length) return null;
    return newIndex;
  }
  async function moveChapter(
    target: { chapter: Chapter; volumeId: string; index: number },
    direction: 'up' | 'down',
  ): Promise<void> {
    const book = selectedBook.value;
    if (!book || isMovingChapter.value) return;
    const targetIndex = resolveMoveTargetIndex(book, target, direction);
    if (targetIndex === null) return;
    isMovingChapter.value = true;
    try {
      const updatedVolumes = ChapterService.moveChapter(
        book,
        target.chapter.id,
        target.volumeId,
        targetIndex,
      );
      await booksStore.updateBook(book.id, { volumes: updatedVolumes, lastEdited: new Date() });
    } catch (err) {
      toast.add({
        severity: 'error',
        summary: '排序失败',
        detail: err instanceof Error ? err.message : String(err),
        life: 3000,
      });
    } finally {
      isMovingChapter.value = false;
    }
  }

  return {
    ctx,
    booksStore,
    isChatActive,
    isProgressActive,
    activeTranslationTaskCount,
    toggleRail,
    addMenuRef,
    addMenuItems,
    toggleAddMenu,
    toggleSortMenu,
    currentSortLabel,
    selectedBookId,
    selectedBook,
    isListOpen,
    toggleList,
    selectBook,
    progressByChapter,
    isLoadingProgress,
    COLLAPSED_PREVIEW,
    isVolumeExpanded,
    toggleVolume,
    visibleChapters,
    chIcon,
    chColor,
    chTextColor,
    chLabel,
    editMode,
    toggleEditMode,
    chapterRowRole,
    openChapter,
    selectedBookForEdit,
    chapterMgmt,
    volumeOptions,
    actionMenuRef,
    actionTarget,
    actionMenuItems,
    openVolumeMenu,
    openChapterMenu,
    isMovingChapter,
    moveChapter,
  };
}

export function provideBooksTabletPage(): BooksTabletPageContext {
  const context = createBooksTabletPageContext();
  provide(BOOKS_TABLET_PAGE_KEY, context);
  return context;
}

export function injectBooksTabletPage(): BooksTabletPageContext {
  const context = inject(BOOKS_TABLET_PAGE_KEY);
  if (!context) {
    throw new Error(
      'injectBooksTabletPage() called outside BooksPageTablet — ensure the fragment is mounted by BooksPageTablet.vue.',
    );
  }
  return context;
}
