<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import TieredMenu from 'primevue/tieredmenu';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import AddVolumeDialog from 'src/components/dialogs/AddVolumeDialog.vue';
import AddChapterDialog from 'src/components/dialogs/AddChapterDialog.vue';
import EditVolumeDialog from 'src/components/dialogs/EditVolumeDialog.vue';
import EditChapterDialog from 'src/components/dialogs/EditChapterDialog.vue';
import DeleteVolumeConfirmDialog from 'src/components/dialogs/DeleteVolumeConfirmDialog.vue';
import DeleteChapterConfirmDialog from 'src/components/dialogs/DeleteChapterConfirmDialog.vue';
import { injectBooksPage } from 'src/composables/books-page/useBooksPage';
import { useChapterManagement } from 'src/composables/book-details/useChapterManagement';
import { getVolumeDisplayTitle, getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { Chapter, Novel, Paragraph, Volume } from 'src/models/novel';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useBooksStore } from 'src/stores/books';
import { useRouter } from 'vue-router';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterService } from 'src/services/chapter-service';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useTabletRightRail } from 'src/composables/useTabletRightRail';
import { isPortrait } from 'src/utils/device-orientation';
import TabletSideRail from 'src/components/layout/TabletSideRail.vue';
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
  {
    label: '新建书籍',
    icon: 'pi pi-plus',
    command: () => ctx.addBook(),
  },
  {
    label: '从网站导入',
    icon: 'pi pi-globe',
    command: () => ctx.importBookFromWeb(),
  },
  {
    label: '从 JSON 导入',
    icon: 'pi pi-file-import',
    command: () => ctx.importBookFromJson(),
  },
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

// 列表可 dock——竖屏宽度下 list + detail 同时摆显得拥挤，改成列表叠加在详情
// 之上（参考 BookDetailsTablet 的 sidebar dock 模式）。默认打开，用户挑完一本
// 书后自动关闭（on portrait）。横屏由 CSS media query 让列表重新参与 flex。
const isListOpen = ref(true);
const toggleList = () => {
  isListOpen.value = !isListOpen.value;
};
const selectBook = (book: Novel) => {
  selectedBookId.value = book.id;
  // 竖屏：挑中后自动收起 list，让详情铺满屏幕；横屏 list 常驻不动。
  if (isPortrait()) isListOpen.value = false;
};

const selectedBook = computed<Novel | null>(() => {
  const list = ctx.filteredBooks.value;
  if (list.length === 0) return null;
  const match = list.find((b) => b.id === selectedBookId.value);
  return match ?? list[0] ?? null;
});

// 列表变化时，确保选中项仍然在列表中；否则落到第一本。
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
function isVolumeExpanded(id: string): boolean {
  return expandedVolumes[id] === true;
}
function toggleVolume(id: string): void {
  expandedVolumes[id] = !isVolumeExpanded(id);
}
function visibleChapters(volumeId: string, chapters: Chapter[]): Chapter[] {
  if (isVolumeExpanded(volumeId)) return chapters;
  return chapters.slice(0, COLLAPSED_PREVIEW);
}

function chIcon(id: string): string {
  return chapterStatusIcon(getChapterStatus(progressByChapter.value, id));
}
function chColor(id: string): string {
  return chapterStatusColor(getChapterStatus(progressByChapter.value, id));
}
function chTextColor(id: string): string {
  return chapterStatusTextColor(getChapterStatus(progressByChapter.value, id));
}
function chLabel(id: string): string {
  return chapterStatusLabel(progressByChapter.value, id);
}

function openChapter(book: Novel, chapter: Chapter): void {
  if (editMode.value) return; // 编辑模式下章节点击无效，避免误触离开列表
  void bookDetailsStore.setSelectedChapter(book.id, chapter.id);
  void router.push(`/books/${book.id}`);
}

// ───── 卷 / 章节编辑（复用 useChapterManagement 的 dialog 状态 + CRUD） ─────
// 手机端 / 书籍详情页已经使用同一个 composable；本页只是把它绑到当前选中的书上。
const selectedBookForEdit = computed<Novel | undefined>(() => selectedBook.value ?? undefined);

const chapterMgmt = useChapterManagement(selectedBookForEdit);

const volumeOptions = computed(() =>
  (selectedBook.value?.volumes ?? []).map((v) => ({
    label: getVolumeDisplayTitle(v),
    value: v.id,
  })),
);

// 编辑模式：默认关闭，开启后显示 ⋮ 操作按钮，关闭时树保持干净
const editMode = ref(false);
function toggleEditMode(): void {
  editMode.value = !editMode.value;
}

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

function openVolumeMenu(event: Event, volume: Volume): void {
  event.stopPropagation();
  actionTarget.value = { kind: 'volume', volume };
  actionMenuRef.value?.toggle(event);
}

function openChapterMenu(
  event: Event,
  chapter: Chapter,
  volumeId: string,
  index: number,
): void {
  event.stopPropagation();
  actionTarget.value = { kind: 'chapter', chapter, volumeId, index };
  actionMenuRef.value?.toggle(event);
}

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
</script>

<template>
  <div
    class="tablet-library w-full h-full flex min-h-0"
    :class="{ 'tablet-library--list-open': isListOpen }"
  >
    <!-- 竖屏叠层：list dock 打开时点外侧关闭；横屏由 CSS display:none 隐藏 -->
    <div
      v-if="isListOpen"
      class="tl-list-scrim"
      aria-hidden="true"
      @click="toggleList"
    />

    <!-- 左侧书籍列表 -->
    <aside class="tl-list">
      <header class="tl-list-head">
        <div class="tl-eyebrow">LIBRARY</div>
        <h1 class="tl-title">书库</h1>
        <div class="tl-meta">
          {{ ctx.booksStore.books.length }} 本
          <template v-if="ctx.booksStore.books.filter((b) => b.starred).length > 0">
            · {{ ctx.booksStore.books.filter((b) => b.starred).length }} 本收藏
          </template>
        </div>
        <div class="tl-toolbar">
          <div class="tl-input-wrap">
            <i class="pi pi-search" aria-hidden="true" />
            <input
              v-model="ctx.searchQuery.value"
              class="tl-input"
              placeholder="搜索书名、作者…"
            />
            <button
              v-if="ctx.searchQuery.value"
              class="tl-input-clear"
              aria-label="清除搜索"
              @click="ctx.searchQuery.value = ''"
            >
              <i class="pi pi-times" />
            </button>
          </div>
          <button
            class="tl-icon-btn"
            :title="`排序：${currentSortLabel}`"
            aria-haspopup="true"
            @click="toggleSortMenu"
          >
            <i class="pi pi-sort-alt" aria-hidden="true" />
          </button>
          <button
            class="tl-icon-btn"
            title="添加书籍"
            aria-haspopup="true"
            @click="toggleAddMenu"
          >
            <i class="pi pi-plus" aria-hidden="true" />
          </button>
          <Menu
            ref="addMenuRef"
            :model="addMenuItems"
            :popup="true"
            append-to="body"
          />
          <TieredMenu
            :ref="(el) => { ctx.sortMenuRef.value = el as unknown as typeof ctx.sortMenuRef.value; }"
            :model="ctx.sortMenuItems.value"
            popup
            append-to="body"
          />
        </div>
      </header>

      <div
        v-if="ctx.booksStore.isLoading || !ctx.booksStore.isLoaded"
        class="tl-state"
      >
        <ProgressSpinner
          style="width: 28px; height: 28px"
          stroke-width="4"
          animation-duration=".8s"
          aria-label="加载中"
        />
        <span>正在加载…</span>
      </div>

      <div v-else-if="ctx.filteredBooks.value.length === 0" class="tl-state">
        <i class="pi pi-book tl-state-icon" aria-hidden="true" />
        <span>
          {{ ctx.searchQuery.value ? '未找到匹配的书籍' : '暂无书籍' }}
        </span>
      </div>

      <div v-else class="tl-list-scroll">
        <button
          v-for="book in ctx.filteredBooks.value"
          :key="book.id"
          type="button"
          class="tl-list-row"
          :class="{ 'tl-list-row--active': book.id === selectedBook?.id }"
          @click="selectBook(book)"
          @dblclick="ctx.navigateToBookDetails(book)"
        >
          <div class="tl-list-cover">
            <img :src="ctx.getCoverUrl(book)" :alt="book.title" loading="lazy" />
          </div>
          <div class="tl-list-body">
            <div class="tl-list-title">{{ book.title }}</div>
            <div class="tl-list-author">{{ book.author || '未知作者' }}</div>
            <div class="tl-list-meta">
              <span v-if="ctx.isLoadingCharCount(book)">
                <Skeleton width="42px" height="10px" />
              </span>
              <span v-else>{{ ctx.formatWordCount(ctx.getTotalWords(book)) }} 字</span>
              <span class="tl-dot">·</span>
              <span>{{ ctx.getTotalChapters(book) }} 章</span>
            </div>
          </div>
          <i
            v-if="book.starred"
            class="pi pi-star-fill tl-list-star"
            aria-hidden="true"
          />
        </button>
      </div>
    </aside>

    <!-- 右侧详情 -->
    <section class="tl-detail">
      <div v-if="!selectedBook" class="tl-detail-empty">
        <i class="pi pi-book" aria-hidden="true" />
        <div class="tl-detail-empty-title">选择一本书查看详情</div>
        <div class="tl-detail-empty-sub">或从左上角添加新书</div>
      </div>
      <div v-else class="tl-detail-scroll">
        <!-- Hero -->
        <header class="tl-hero">
          <div class="tl-hero-cover">
            <img :src="ctx.getCoverUrl(selectedBook)" :alt="selectedBook.title" loading="lazy" />
            <i
              v-if="selectedBook.starred"
              class="pi pi-star-fill tl-hero-star"
              aria-hidden="true"
            />
          </div>
          <div class="tl-hero-body">
            <div class="tl-hero-eyebrow">
              {{ selectedBook.author || '未知作者' }}
              · {{ ctx.getTotalChapters(selectedBook) }} 章
            </div>
            <h2 class="tl-hero-title">{{ selectedBook.title }}</h2>
            <div
              v-if="selectedBook.alternateTitles && selectedBook.alternateTitles.length > 0"
              class="tl-hero-alt"
            >
              《{{ selectedBook.alternateTitles[0] }}》
            </div>

            <div class="tl-hero-badges">
              <span class="tl-badge tl-badge--blue">
                <i class="pi pi-sparkles" /> {{ selectedBook.tags?.[0] || '小说' }}
              </span>
              <span
                v-for="tag in (selectedBook.tags ?? []).slice(1, 6)"
                :key="tag"
                class="tl-badge"
              >
                {{ tag }}
              </span>
              <span v-if="selectedBook.starred" class="tl-badge tl-badge--star">
                <i class="pi pi-star-fill" /> 收藏
              </span>
            </div>

            <p v-if="selectedBook.description" class="tl-desc">
              {{ selectedBook.description }}
            </p>

            <div class="tl-hero-actions">
              <Button
                label="继续翻译"
                icon="pi pi-play"
                class="p-button-primary"
                @click="ctx.navigateToBookDetails(selectedBook)"
              />
              <Button
                label="编辑元数据"
                icon="pi pi-pencil"
                class="p-button-outlined"
                @click="ctx.editBook(selectedBook)"
              />
              <Button
                :icon="selectedBook.starred ? 'pi pi-star-fill' : 'pi pi-star'"
                :class="[
                  'p-button-outlined',
                  selectedBook.starred ? '!text-warning' : '',
                ]"
                :title="selectedBook.starred ? '取消收藏' : '收藏'"
                @click="ctx.toggleStar(selectedBook)"
              />
              <Button
                icon="pi pi-trash"
                class="p-button-outlined p-button-danger"
                title="删除"
                @click="ctx.deleteBook(selectedBook)"
              />
            </div>
          </div>
        </header>

        <!-- 统计条 -->
        <div class="tl-stats">
          <div class="tl-stat">
            <div class="tl-stat-value">{{ selectedBook.volumes?.length ?? 0 }}</div>
            <div class="tl-stat-label">卷数</div>
          </div>
          <div class="tl-stat">
            <div class="tl-stat-value">{{ ctx.getTotalChapters(selectedBook) }}</div>
            <div class="tl-stat-label">章节</div>
          </div>
          <div class="tl-stat">
            <div class="tl-stat-value">
              <template v-if="ctx.isLoadingCharCount(selectedBook)">
                <Skeleton width="48px" height="16px" />
              </template>
              <template v-else>
                {{ ctx.formatWordCount(ctx.getTotalWords(selectedBook)) }}
              </template>
            </div>
            <div class="tl-stat-label">字数</div>
          </div>
          <div class="tl-stat">
            <div class="tl-stat-value">{{ ctx.formatDate(selectedBook.lastEdited) }}</div>
            <div class="tl-stat-label">上次编辑</div>
          </div>
          <div class="tl-stat tl-stat--last">
            <div class="tl-stat-value">{{ selectedBook.tags?.length ?? 0 }}</div>
            <div class="tl-stat-label">标签</div>
          </div>
        </div>

        <!-- 章节树：全部卷 / 章节，可折叠，点击跳转到阅读 -->
        <section class="tl-chapters">
          <header class="tl-chapters-head">
            <span>章节 · {{ ctx.getTotalChapters(selectedBook) }}</span>
            <span v-if="isLoadingProgress" class="tl-chapters-loading">
              <i class="pi pi-spin pi-spinner" aria-hidden="true" /> 正在统计进度…
            </span>
            <button
              type="button"
              class="tl-chapters-edit-btn"
              :class="{ 'tl-chapters-edit-btn--on': editMode }"
              :aria-pressed="editMode"
              :title="editMode ? '完成编辑' : '编辑章节'"
              @click="toggleEditMode"
            >
              <i class="pi" :class="editMode ? 'pi-check' : 'pi-pencil'" aria-hidden="true" />
              <span>{{ editMode ? '完成' : '编辑' }}</span>
            </button>
          </header>
          <div
            v-if="selectedBook.volumes && selectedBook.volumes.length > 0"
            class="tl-tree"
          >
            <div
              v-for="(volume, vi) in selectedBook.volumes"
              :key="volume.id ?? vi"
              class="tl-tree-group"
            >
              <div
                class="tl-tree-vol"
                role="button"
                :aria-expanded="isVolumeExpanded(volume.id)"
                @click="toggleVolume(volume.id)"
              >
                <i
                  class="pi"
                  :class="isVolumeExpanded(volume.id) ? 'pi-folder-open tl-tree-vol-icon-open' : 'pi-folder tl-tree-vol-icon-closed'"
                  aria-hidden="true"
                />
                <span class="tl-tree-vol-title">{{ getVolumeDisplayTitle(volume) || `卷 ${vi + 1}` }}</span>
                <span class="tl-tree-count">{{ volume.chapters?.length ?? 0 }} 章</span>
                <button
                  v-if="editMode"
                  type="button"
                  class="tl-tree-more-btn"
                  aria-label="卷操作"
                  @click.stop="openVolumeMenu($event, volume)"
                >
                  <i class="pi pi-ellipsis-v" aria-hidden="true" />
                </button>
              </div>
              <div
                v-for="(chapter, ci) in visibleChapters(volume.id, volume.chapters ?? [])"
                :key="chapter.id ?? ci"
                class="tl-tree-chap"
                :class="{ 'tl-tree-chap--readonly': editMode }"
                :role="editMode ? undefined : 'button'"
                @click="openChapter(selectedBook, chapter)"
              >
                <i
                  class="pi"
                  :class="chIcon(chapter.id)"
                  :style="{ color: chColor(chapter.id) }"
                  aria-hidden="true"
                />
                <span class="tl-tree-chap-title">
                  {{ getChapterDisplayTitle(chapter, selectedBook) || `第 ${ci + 1} 章` }}
                </span>
                <span
                  class="tl-tree-count"
                  :style="{ color: chTextColor(chapter.id) }"
                >
                  {{ chLabel(chapter.id) }}
                </span>
                <button
                  v-if="editMode"
                  type="button"
                  class="tl-tree-more-btn"
                  aria-label="章节操作"
                  @click.stop="openChapterMenu($event, chapter, volume.id, ci)"
                >
                  <i class="pi pi-ellipsis-v" aria-hidden="true" />
                </button>
              </div>
              <div
                v-if="!isVolumeExpanded(volume.id) && (volume.chapters?.length ?? 0) > COLLAPSED_PREVIEW"
                class="tl-tree-more"
                role="button"
                @click="toggleVolume(volume.id)"
              >
                展开余下 {{ (volume.chapters!.length) - COLLAPSED_PREVIEW }} 章
              </div>
            </div>
          </div>
          <div v-else class="tl-chapters-empty">
            <i class="pi pi-book" aria-hidden="true" /> 暂无章节
          </div>
        </section>
      </div>
    </section>

    <!-- 右侧 rail —— list 切换 + AI 助手 + 翻译进度。竖屏 list 是 overlay，
         toggle 按钮留在 rail 上；横屏 list 参与 flex 布局，toggle 把它收掉腾空间。 -->
    <TabletSideRail>
      <button
        type="button"
        class="tsr-btn"
        :class="{ 'tsr-btn--active': isListOpen }"
        :title="isListOpen ? '收起书籍列表' : '展开书籍列表'"
        :aria-label="isListOpen ? '收起书籍列表' : '展开书籍列表'"
        :aria-pressed="isListOpen"
        @click="toggleList"
      >
        <i
          class="pi"
          :class="isListOpen ? 'pi-angle-double-left' : 'pi-bars'"
          aria-hidden="true"
        />
      </button>

      <div class="tsr-sep" />

      <button
        type="button"
        class="tsr-btn"
        :class="{ 'tsr-btn--active': isChatActive }"
        title="AI 助手"
        @click="() => toggleRail('chat')"
      >
        <i class="pi pi-sparkles" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="tsr-btn"
        :class="{ 'tsr-btn--active': isProgressActive }"
        title="翻译进度"
        @click="() => toggleRail('progress')"
      >
        <i class="pi pi-objects-column" aria-hidden="true" />
        <span v-if="activeTranslationTaskCount > 0" class="tsr-badge">
          {{ activeTranslationTaskCount }}
        </span>
      </button>
    </TabletSideRail>

    <!-- 隐藏的文件输入（JSON 导入）—— 桌面与手机都在自己模板里挂一份 -->
    <input
      :ref="(el) => { ctx.fileInputRef.value = el as HTMLInputElement | null; }"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="ctx.handleFileSelect"
    />

    <!-- ⋮ 动作菜单 —— 卷 / 章节共用一个 Menu 实例 -->
    <Menu
      ref="actionMenuRef"
      :model="actionMenuItems"
      :popup="true"
      append-to="body"
    />

    <!-- 卷 / 章节编辑对话框 —— 绑定 useChapterManagement 的状态与处理函数 -->
    <EditVolumeDialog
      v-model:visible="chapterMgmt.showEditVolumeDialog.value"
      :title="chapterMgmt.editingVolumeTitle.value"
      :translation="chapterMgmt.editingVolumeTranslation.value"
      :loading="chapterMgmt.isEditingVolume.value"
      @save="chapterMgmt.handleEditVolume"
    />
    <EditChapterDialog
      v-model:visible="chapterMgmt.showEditChapterDialog.value"
      :title="chapterMgmt.editingChapterTitle.value || ''"
      :translation="chapterMgmt.editingChapterTranslation.value || ''"
      :target-volume-id="chapterMgmt.editingChapterTargetVolumeId.value || null"
      :volume-options="volumeOptions"
      :loading="chapterMgmt.isEditingChapter.value"
      :web-url="chapterMgmt.editingChapterWebUrl.value || ''"
      :last-updated="chapterMgmt.editingChapterLastUpdated.value"
      :last-edited="chapterMgmt.editingChapterLastEdited.value"
      :created-at="chapterMgmt.editingChapterCreatedAt.value"
      :translation-instructions="chapterMgmt.editingChapterTranslationInstructions.value || ''"
      :polish-instructions="chapterMgmt.editingChapterPolishInstructions.value || ''"
      :proofreading-instructions="chapterMgmt.editingChapterProofreadingInstructions.value || ''"
      @save="chapterMgmt.handleEditChapter"
    />
    <DeleteVolumeConfirmDialog
      v-model:visible="chapterMgmt.showDeleteVolumeConfirm.value"
      :volume-title="chapterMgmt.deletingVolumeTitle.value"
      :loading="chapterMgmt.isDeletingVolume.value"
      @confirm="chapterMgmt.handleDeleteVolume"
    />
    <DeleteChapterConfirmDialog
      v-model:visible="chapterMgmt.showDeleteChapterConfirm.value"
      :chapter-title="chapterMgmt.deletingChapterTitle.value"
      :loading="chapterMgmt.isDeletingChapter.value"
      @confirm="chapterMgmt.handleDeleteChapter"
    />
    <AddVolumeDialog
      v-model:visible="chapterMgmt.showAddVolumeDialog.value"
      :loading="chapterMgmt.isAddingVolume.value"
      @save="chapterMgmt.handleAddVolume"
    />
    <AddChapterDialog
      v-model:visible="chapterMgmt.showAddChapterDialog.value"
      :volume-options="volumeOptions"
      :loading="chapterMgmt.isAddingChapter.value"
      @save="chapterMgmt.handleAddChapter"
    />
  </div>
</template>

<style scoped>
.tablet-library {
  position: relative;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  overflow: hidden;
}

/* 左侧列表 */
.tl-list {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--white-opacity-6);
  background: rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  transition:
    width 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-right-color 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* 横屏默认：list-open 不影响布局；list 关闭时宽度归零、内容面板自动填满 */
.tablet-library:not(.tablet-library--list-open) .tl-list {
  width: 0;
  border-right-color: transparent;
}

.tablet-library:not(.tablet-library--list-open) .tl-list > * {
  opacity: 0;
  pointer-events: none;
}

/* 遮罩：仅竖屏 list 打开时显示，点击关闭 */
.tl-list-scrim {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
  z-index: 15;
}

@media (orientation: portrait) {
  .tl-list-scrim {
    display: block;
  }

  /* 竖屏 list 变成 overlay drawer，不参与 flex 布局——详情面板始终全宽 */
  .tl-list {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 320px;
    max-width: 86%;
    z-index: 20;
    /* token: near night-300 @ 96% */
    background: var(--shell-opacity-96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  }

  .tablet-library:not(.tablet-library--list-open) .tl-list {
    width: 320px;
    border-right-color: var(--white-opacity-6);
    transform: translateX(-100%);
  }

  .tablet-library:not(.tablet-library--list-open) .tl-list > * {
    opacity: 1;
    pointer-events: none;
  }
}

.tl-list-head {
  padding: 20px 20px 14px;
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.tl-eyebrow {
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.22em;
  /* token: accent-silver @ 75% */
  color: var(--accent-opacity-75);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.tl-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 24px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.015em;
  margin: 0;
  line-height: 1.15;
}

.tl-meta {
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-top: 6px;
}

.tl-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.tl-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.tl-input-wrap > i {
  position: absolute;
  left: 10px;
  color: var(--moon-50-opacity-55);
  font-size: 12px;
  pointer-events: none;
}

.tl-input {
  width: 100%;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  padding: 7px 30px 7px 30px;
  color: var(--moon-50-opacity-100);
  font-family: inherit;
  font-size: 12px;
  outline: none;
}

.tl-input:focus {
  /* token: tsukuyomi-300 */
  border-color: var(--tsukuyomi-300);
  /* token: tsukuyomi-300 @ 20% */
  box-shadow: 0 0 0 2px var(--tsukuyomi-300-opacity-20);
}

.tl-input-clear {
  position: absolute;
  right: 6px;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--moon-50-opacity-55);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-input-clear i {
  font-size: 10px;
}

.tl-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  color: var(--moon-50-opacity-75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.tl-icon-btn:hover {
  background: var(--white-opacity-8);
  color: var(--moon-50-opacity-100);
}

.tl-icon-btn i {
  font-size: 12px;
}

.tl-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 0;
}

.tl-list-row {
  width: 100%;
  padding: 10px 18px;
  display: flex;
  gap: 12px;
  align-items: center;
  border: none;
  background: transparent;
  /* token: white @ 4% */
  border-bottom: 1px solid var(--white-opacity-4);
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 3px solid transparent;
}

.tl-list-row:hover {
  /* token: white @ 3% */
  background: var(--white-opacity-3);
}

.tl-list-row--active {
  background: var(--tsukuyomi-opacity-10);
  /* token: tsukuyomi-300 */
  border-left-color: var(--tsukuyomi-300);
}

.tl-list-cover {
  width: 40px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  /* token: night-300 */
  background: var(--night-300);
}

.tl-list-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tl-list-body {
  flex: 1;
  min-width: 0;
}

.tl-list-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-list-author {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-list-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-50);
  margin-top: 4px;
}

.tl-list-star {
  /* token: warning */
  color: var(--color-warning);
  font-size: 10px;
  flex-shrink: 0;
}

.tl-dot {
  opacity: 0.5;
}

.tl-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 16px;
  text-align: center;
  color: var(--moon-50-opacity-60);
  font-size: 12px;
}

.tl-state-icon {
  font-size: 32px;
  /* token: moon-50 @ 20% */
  color: var(--moon-50-opacity-20);
}

/* 右侧详情 */
.tl-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tl-detail-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 36px 36px;
}

.tl-detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--moon-50-opacity-50);
}

.tl-detail-empty i {
  font-size: 42px;
  /* token: moon-50 @ 20% */
  color: var(--moon-50-opacity-20);
}

.tl-detail-empty-title {
  font-size: 15px;
  color: var(--moon-50-opacity-75);
  font-weight: 500;
}

.tl-detail-empty-sub {
  font-size: 12px;
  color: var(--moon-50-opacity-45);
}

/* Hero */
.tl-hero {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
}

.tl-hero-cover {
  position: relative;
  width: 140px;
  height: 210px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  /* token: tsukuyomi-500 @ 50% → night-200 */
  background: linear-gradient(135deg, var(--tsukuyomi-opacity-50), var(--night-200));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.tl-hero-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tl-hero-star {
  position: absolute;
  top: 8px;
  right: 8px;
  /* token: warning */
  color: var(--color-warning);
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.tl-hero-body {
  flex: 1;
  min-width: 0;
}

.tl-hero-eyebrow {
  font-size: 10px;
  /* token: accent-silver @ 75% */
  color: var(--accent-opacity-75);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 500;
}

.tl-hero-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 26px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.015em;
  margin: 6px 0 0;
  line-height: 1.2;
}

.tl-hero-alt {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 13px;
  /* token: moon-50 @ 65% */
  color: var(--moon-50-opacity-65);
  margin-top: 4px;
}

.tl-hero-badges {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.tl-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-8);
  color: var(--moon-50-opacity-75);
}

.tl-badge i {
  font-size: 9px;
}

.tl-badge--blue {
  background: var(--tsukuyomi-opacity-15);
  border-color: var(--tsukuyomi-opacity-30);
  /* token: tsukuyomi-200 */
  color: var(--tsukuyomi-200);
}

.tl-badge--star {
  /* token: warning @ 12% */
  background: var(--color-warning-opacity-12);
  /* token: warning @ 30% */
  border-color: var(--color-warning-opacity-30);
  /* token: warning */
  color: var(--color-warning);
}

.tl-hero-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}

/* 统计条 */
.tl-stats {
  padding: 16px 24px;
  /* token: white @ 2.5% */
  background: var(--white-opacity-2-5);
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-bottom: 24px;
}

.tl-stat {
  text-align: center;
  border-right: 1px solid var(--white-opacity-6);
  padding: 0 8px;
}

.tl-stat--last {
  border-right: none;
}

.tl-stat-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-stat-label {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* 章节树 */
.tl-chapters {
  margin-bottom: 24px;
}

.tl-chapters-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 500;
  margin-bottom: 12px;
}

.tl-chapters-loading {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  letter-spacing: 0.1em;
  /* token: accent-silver @ 70% */
  color: var(--accent-opacity-70);
  text-transform: none;
}

.tl-chapters-loading i {
  font-size: 10px;
}

/* 章节树：2 列 grid（依照 mockup），同一卷的 header + 章节保持在一个 group 内避免跨列断裂 */
.tl-tree {
  columns: 2;
  column-gap: 20px;
}

.tl-tree-group {
  break-inside: avoid;
  page-break-inside: avoid;
  margin-bottom: 4px;
}

.tl-tree-vol {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  margin: 0 -4px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  cursor: pointer;
  transition: background 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-tree-vol:hover {
  /* token: white @ 3% */
  background: var(--white-opacity-3);
}

.tl-tree-vol-icon-open {
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  font-size: 11px;
}

.tl-tree-vol-icon-closed {
  /* token: accent-silver @ 55% */
  color: var(--accent-opacity-55);
  font-size: 11px;
}

.tl-tree-vol-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-tree-chap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0 6px 20px;
  font-size: 11px;
  /* token: moon-50 @ 80% */
  color: var(--moon-50-opacity-80);
  cursor: pointer;
  border-radius: 4px;
  transition: background 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-tree-chap:hover {
  /* token: white @ 3% */
  background: var(--white-opacity-3);
}

.tl-tree-chap--readonly {
  cursor: default;
}

.tl-tree-chap--readonly:hover {
  background: transparent;
}

.tl-tree-chap > i {
  font-size: 10px;
  flex-shrink: 0;
}

.tl-tree-chap-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-tree-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-50);
  flex-shrink: 0;
}

.tl-tree-more {
  padding: 6px 0 6px 20px;
  font-size: 10px;
  /* token: tsukuyomi-300 @ 75% */
  color: var(--tsukuyomi-300-opacity-75);
  cursor: pointer;
  font-style: italic;
  transition: color 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-tree-more:hover {
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.tl-tree-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--moon-50-opacity-55);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 120ms cubic-bezier(0.4, 0, 0.2, 1),
    color 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-tree-more-btn i {
  font-size: 11px;
}

.tl-tree-more-btn:hover {
  background: var(--white-opacity-8);
  color: var(--moon-50-opacity-100);
}

.tl-chapters-edit-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid transparent;
  background: transparent;
  /* token: tsukuyomi-300 @ 85% */
  color: var(--tsukuyomi-300-opacity-85);
  border-radius: 6px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-chapters-edit-btn:hover {
  background: var(--white-opacity-4);
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.tl-chapters-edit-btn--on {
  background: var(--tsukuyomi-opacity-18);
  border-color: var(--tsukuyomi-opacity-30);
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.tl-chapters-edit-btn--on:hover {
  /* token: tsukuyomi-500 @ 24% */
  background: var(--tsukuyomi-opacity-24);
}

.tl-chapters-edit-btn i {
  font-size: 10px;
}

.tl-chapters-empty {
  padding: 20px;
  color: var(--moon-50-opacity-45);
  font-size: 12px;
  text-align: center;
}

.tl-chapters-empty i {
  margin-right: 6px;
}

.tl-desc {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--moon-50-opacity-70);
  line-height: 1.65;
  white-space: pre-line;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
