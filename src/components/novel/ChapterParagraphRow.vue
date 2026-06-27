<script setup lang="ts">
import ParagraphCard from 'src/components/novel/ParagraphCard.vue';
import type { Paragraph, Terminology, CharacterSetting } from 'src/models/novel';

const props = defineProps<{
  paragraph: Paragraph;
  index: number;
  isSmallScreen: boolean;
  terminologies: Terminology[];
  characterSettings: CharacterSetting[];
  bookId?: string | undefined;
  chapterId: string | null;
  isTranslating: boolean;
  isPolishing: boolean;
  isProofreading: boolean;
  searchQuery: string;
  selected: boolean;
  // 由父级持有、跨变体共享的 ParagraphCard 实例表（命令式编辑/聚焦用）
  paragraphCardRefs: Map<string, InstanceType<typeof ParagraphCard>>;
  // 由父级持有的「编辑草稿」表（段落 id → 未保存译文），用于在虚拟滚动卸载/重挂载间保留编辑内容
  editDraftStore?: Map<string, string>;
}>();

const emit = defineEmits<{
  (e: 'update-translation', paragraphId: string, newTranslation: string): void;
  (e: 'retranslate-paragraph', paragraphId: string): void;
  (e: 'polish-paragraph', paragraphId: string): void;
  (e: 'proofread-paragraph', paragraphId: string): void;
  (e: 'select-translation', paragraphId: string, translationId: string): void;
  (e: 'paragraph-click', paragraphId: string): void;
  (e: 'paragraph-edit-start', paragraphId: string): void;
  (e: 'paragraph-edit-stop', paragraphId: string): void;
}>();

// 记住本实例注册到表里的 ParagraphCard，卸载时仅当表里仍是本实例才删除。
// window↔pinned 切换时两处共用同一段落 id：滚回时 Vue 先 patch 窗口行（set 新实例）再卸载钉住行，
// 无条件 delete 会把刚注册的窗口实例一并删掉，导致该段落从 paragraphCardRefs 丢失、命令式编辑失效。
let registeredCard: InstanceType<typeof ParagraphCard> | null = null;
const setCardRef = (el: unknown) => {
  if (el) {
    registeredCard = el as InstanceType<typeof ParagraphCard>;
    props.paragraphCardRefs.set(props.paragraph.id, registeredCard);
  } else {
    if (props.paragraphCardRefs.get(props.paragraph.id) === registeredCard) {
      props.paragraphCardRefs.delete(props.paragraph.id);
    }
    registeredCard = null;
  }
};
</script>

<template>
  <div class="paragraph-with-line-number">
    <span v-if="!isSmallScreen" class="line-number">{{ index + 1 }}</span>
    <ParagraphCard
      :ref="setCardRef"
      :paragraph="paragraph"
      :terminologies="terminologies"
      :character-settings="characterSettings"
      v-bind="{
        ...(chapterId ? { chapterId } : {}),
        ...(bookId ? { bookId } : {}),
        ...(editDraftStore ? { editDraftStore } : {}),
      }"
      :is-translating="isTranslating"
      :is-polishing="isPolishing"
      :is-proofreading="isProofreading"
      :search-query="searchQuery"
      :id="`paragraph-${paragraph.id}`"
      :selected="selected"
      @update-translation="
        (paragraphId: string, newTranslation: string) =>
          emit('update-translation', paragraphId, newTranslation)
      "
      @retranslate="(paragraphId: string) => emit('retranslate-paragraph', paragraphId)"
      @polish="(paragraphId: string) => emit('polish-paragraph', paragraphId)"
      @proofread="(paragraphId: string) => emit('proofread-paragraph', paragraphId)"
      @select-translation="
        (paragraphId: string, translationId: string) =>
          emit('select-translation', paragraphId, translationId)
      "
      @paragraph-click="(paragraphId: string) => emit('paragraph-click', paragraphId)"
      @paragraph-edit-start="(paragraphId: string) => emit('paragraph-edit-start', paragraphId)"
      @paragraph-edit-stop="(paragraphId: string) => emit('paragraph-edit-stop', paragraphId)"
    />
  </div>
</template>

<style scoped>
/* 带行号的段落（从 ChapterContentPanel 迁移，随虚拟行复用） */
.paragraph-with-line-number {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  position: relative;
  /* 行间距：放在 margin（不影响 ::before 选中高亮，高亮仍贴合内容）。
     useChapterVirtualizer.measureElement 会把此 margin-bottom 并入测量高度，
     使 totalSize/偏移与文档流一致，最后一行不会溢出压到上下章按钮。 */
  margin-bottom: 16px;
  /* 只允许颜色/阴影类过渡，避免 margin/padding 等布局属性过渡导致"滚动抖动" */
  transition:
    color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 选中高亮：伪元素绘制边框/阴影，避免改变布局尺寸导致滚动"上下跳动" */
.paragraph-with-line-number::before {
  content: '';
  position: absolute;
  inset: -0.5rem;
  border-radius: 8px;
  border: 1px solid transparent;
  box-shadow: 0 0 0 1px transparent;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.paragraph-with-line-number:has(.paragraph-selected)::before {
  opacity: 1;
  border-color: var(--primary-opacity-20);
  box-shadow: 0 0 0 1px var(--primary-opacity-15);
}

.line-number {
  display: inline-block;
  flex-shrink: 0;
  width: 3rem;
  text-align: right;
  font-size: 0.8125rem;
  color: var(--moon-opacity-40);
  font-family: ui-monospace, 'Courier New', monospace;
  padding-top: 1rem;
  padding-right: 0.75rem;
  user-select: none;
  align-self: flex-start;
  line-height: 1.8;
  font-weight: 500;
  position: relative;
  z-index: 1;
}

.paragraph-with-line-number .paragraph-card {
  flex: 1;
  min-width: 0;
  padding-left: 0;
  position: relative;
  z-index: 1;
  /* 虚拟滚动已接管视口外段落渲染，无需再用 content-visibility 占位 */
}

/* 隐藏 ParagraphCard 中的原始段落符号 */
.paragraph-with-line-number .paragraph-card :deep(.paragraph-icon) {
  display: none !important;
}
</style>
