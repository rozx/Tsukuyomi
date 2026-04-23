<script setup lang="ts">
/**
 * 平板章节树——视觉完全对齐 BookDetailsMobile 的 `.mbd-tree`：
 * 卷折叠行（folder 图标 + 标题 + 章数 + ⋮）、展开后的章节行（状态图标 +
 * 标题 + 百分比 + ⋮）。没有拖拽、没有多列图标——干净的单列布局。
 *
 * `⋮` 点击会打开一个 PrimeVue `Menu` popup（mobile 上用的是底部抽屉；
 * tablet 上换成就近的 popup，不额外引入 sheet 栈）。菜单选项以事件形式
 * 冒泡到父组件，由 BookDetailsDesktop 统一派发到 useBookDetailsPage。
 */
import { computed, ref } from 'vue';
import Menu from 'primevue/menu';
import type { MenuItem } from 'primevue/menuitem';
import type { Volume, Chapter, Novel } from 'src/models/novel';
import { getVolumeDisplayTitle, getChapterDisplayTitle } from 'src/utils';
import {
  canNavigateToChapter,
  buildVolumeActionMenuItems,
  buildChapterActionMenuItems,
} from 'src/components/novel/volumes-list-utils';

const props = defineProps<{
  volumes: Volume[];
  book: Novel | null;
  selectedChapterId: string | null;
  isPageLoading: boolean;
  isLoadingChapterContent?: boolean;
  isVolumeExpanded: (volumeId: string) => boolean;
  chapterStatusIcon: (chapterId: string) => string;
  chapterStatusColor: (chapterId: string) => string;
  chapterStatusTextColor: (chapterId: string) => string;
  chapterStatusLabel: (chapterId: string) => string;
}>();

const emit = defineEmits<{
  (e: 'toggle-volume', volumeId: string): void;
  (e: 'navigate-to-chapter', chapter: Chapter): void;
  (e: 'edit-volume', volume: Volume): void;
  (e: 'delete-volume', volume: Volume): void;
  (e: 'edit-chapter', chapter: Chapter): void;
  (e: 'delete-chapter', chapter: Chapter): void;
  (
    e: 'move-chapter',
    payload: { chapter: Chapter; volumeId: string; index: number; direction: 'up' | 'down' },
  ): void;
}>();

type ActionTarget =
  | { kind: 'volume'; volume: Volume }
  | { kind: 'chapter'; chapter: Chapter; volumeId: string; index: number; chaptersLen: number };

const actionMenuRef = ref<{ toggle: (event: Event) => void } | null>(null);
const actionTarget = ref<ActionTarget | null>(null);

// 与 BooksPageTablet 的 ⋮ 菜单 dispatch 模板结构一致；callback 闭包不同无法抽成工厂
// fallow-ignore-next-line code-duplication
const actionMenuItems = computed<MenuItem[]>(() => {
  const target = actionTarget.value;
  if (!target) return [];
  if (target.kind === 'volume') {
    return buildVolumeActionMenuItems({
      onEdit: () => emit('edit-volume', target.volume),
      onDelete: () => emit('delete-volume', target.volume),
    });
  }
  return buildChapterActionMenuItems({
    canMoveUp: target.index > 0,
    canMoveDown: target.index < target.chaptersLen - 1,
    onEdit: () => emit('edit-chapter', target.chapter),
    onMoveUp: () =>
      emit('move-chapter', {
        chapter: target.chapter,
        volumeId: target.volumeId,
        index: target.index,
        direction: 'up',
      }),
    onMoveDown: () =>
      emit('move-chapter', {
        chapter: target.chapter,
        volumeId: target.volumeId,
        index: target.index,
        direction: 'down',
      }),
    onDelete: () => emit('delete-chapter', target.chapter),
  });
});

const openVolumeActions = (event: Event, volume: Volume) => {
  actionTarget.value = { kind: 'volume', volume };
  actionMenuRef.value?.toggle(event);
};

const openChapterActions = (
  event: Event,
  chapter: Chapter,
  volumeId: string,
  index: number,
  chaptersLen: number,
) => {
  actionTarget.value = { kind: 'chapter', chapter, volumeId, index, chaptersLen };
  actionMenuRef.value?.toggle(event);
};

const handleNavigateToChapter = (chapter: Chapter) => {
  if (
    !canNavigateToChapter(
      {
        isLoadingChapterContent: props.isLoadingChapterContent,
        selectedChapterId: props.selectedChapterId,
      },
      chapter.id,
    )
  ) {
    return;
  }
  emit('navigate-to-chapter', chapter);
};

const statusIconFor = (chapterId: string) => props.chapterStatusIcon(chapterId);
const statusColorFor = (chapterId: string) => props.chapterStatusColor(chapterId);
const statusTextColorFor = (chapterId: string) => props.chapterStatusTextColor(chapterId);
const statusLabelFor = (chapterId: string) => props.chapterStatusLabel(chapterId);
</script>

<template>
  <div class="vt-tree">
    <template v-for="vol in volumes" :key="vol.id">
      <button
        type="button"
        class="vt-row vt-row--vol"
        :class="{ 'vt-row--vol-open': isVolumeExpanded(vol.id) }"
        @click="emit('toggle-volume', vol.id)"
      >
        <i
          class="pi vt-vol-icon"
          :class="isVolumeExpanded(vol.id) ? 'pi-folder-open' : 'pi-folder'"
          aria-hidden="true"
        />
        <span class="vt-row-title">{{ getVolumeDisplayTitle(vol) }}</span>
        <span class="vt-row-count">{{ vol.chapters?.length ?? 0 }} 章</span>
        <button
          type="button"
          class="vt-row-more"
          aria-label="卷操作"
          @click.stop="(event: Event) => openVolumeActions(event, vol)"
        >
          <i class="pi pi-ellipsis-v" aria-hidden="true" />
        </button>
      </button>

      <template v-if="isVolumeExpanded(vol.id)">
        <div
          v-for="(ch, chIdx) in vol.chapters || []"
          :key="ch.id"
          class="vt-row vt-row--chapter"
          :class="{ 'vt-row--active': selectedChapterId === ch.id }"
          role="button"
          tabindex="0"
          @click="handleNavigateToChapter(ch)"
          @keydown.enter.space.prevent="handleNavigateToChapter(ch)"
        >
          <i
            class="pi vt-chap-icon"
            :class="statusIconFor(ch.id)"
            :style="{ color: statusColorFor(ch.id) }"
            aria-hidden="true"
          />
          <span class="vt-row-title">
            {{ getChapterDisplayTitle(ch, book || undefined) }}
          </span>
          <span class="vt-row-count" :style="{ color: statusTextColorFor(ch.id) }">
            {{ statusLabelFor(ch.id) }}
          </span>
          <button
            type="button"
            class="vt-row-more"
            aria-label="章节操作"
            @click.stop="
              (event: Event) =>
                openChapterActions(event, ch, vol.id, chIdx, (vol.chapters || []).length)
            "
          >
            <i class="pi pi-ellipsis-v" aria-hidden="true" />
          </button>
        </div>
      </template>
    </template>

    <div v-if="volumes.length === 0" class="vt-empty">
      <i class="pi pi-folder-open" aria-hidden="true" />
      <span>尚未创建卷或章节</span>
    </div>

    <Menu ref="actionMenuRef" :model="actionMenuItems" popup />
  </div>
</template>

<style scoped>
/* 直接对齐 BookDetailsMobile 的 mbd-tree tokens——卡片包一层，
   卷行高亮折线，章节行缩进 28px + 较小的字号。 */
.vt-tree {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 6px 12px 10px;
  border: 1px solid var(--white-opacity-6);
  border-radius: 10px;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--white-opacity-2); /* token: white @ 2% */
  scrollbar-width: thin;
  scrollbar-color: var(--white-opacity-20) transparent;
}

.vt-tree::-webkit-scrollbar {
  width: 6px;
}

.vt-tree::-webkit-scrollbar-thumb {
  background: var(--white-opacity-20);
  border-radius: 3px;
}

.vt-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  color: var(--moon-50-opacity-90);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.vt-row:hover {
  background: var(--white-opacity-3);
}

.vt-row--vol {
  border-bottom: 1px solid var(--white-opacity-4);
  font-weight: 500;
}

.vt-row--vol-open {
  background: var(--white-opacity-2); /* token: white @ 2% */
}

.vt-row--chapter {
  padding-left: 28px;
  font-size: 12.5px;
  color: var(--moon-50-opacity-80); /* token: moon-50 @ 80% */
}

.vt-row--active {
  background: var(--tsukuyomi-opacity-12);
  color: var(--primary-300); /* token: primary-300 */
}

.vt-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vt-row-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  flex-shrink: 0;
}

.vt-row-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 2px;
  margin-right: -4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--moon-50-opacity-45);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.vt-row-more:hover {
  background: var(--white-opacity-6);
  color: var(--moon-50-opacity-85);
}

.vt-row-more i {
  font-size: 12px;
}

.vt-vol-icon {
  color: var(--accent-opacity-85); /* token: accent-silver @ 85% */
  font-size: 14px;
  width: 14px;
  flex-shrink: 0;
}

.vt-chap-icon {
  font-size: 13px;
  width: 13px;
  flex-shrink: 0;
}

.vt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  color: var(--moon-50-opacity-45);
  font-size: 12px;
}

.vt-empty i {
  font-size: 20px;
  opacity: 0.6;
}
</style>
