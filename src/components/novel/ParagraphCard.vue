<script setup lang="ts">
import { computed, ref, onUnmounted, nextTick } from 'vue';
import Popover from 'primevue/popover';
import Inplace from 'primevue/inplace';
import Skeleton from 'primevue/skeleton';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import type { Paragraph, Terminology, CharacterSetting } from 'src/models/novel';
import TranslationHistoryDialog from 'src/components/dialogs/TranslationHistoryDialog.vue';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useContextStore } from 'src/stores/context';
import { useBooksStore } from 'src/stores/books';
import { useUiStore } from 'src/stores/ui';
import { ChapterService } from 'src/services/chapter-service';
import { parseTextForHighlighting, escapeRegex } from 'src/utils/text-matcher';

const props = defineProps<{
  paragraph: Paragraph;
  terminologies?: Terminology[];
  characterSettings?: CharacterSetting[];
  isTranslating?: boolean;
  isPolishing?: boolean;
  searchQuery?: string;
  characterScores?: Map<string, number>;
  bookId?: string;
  chapterId?: string;
  id?: string;
  selected?: boolean;
}>();

const emit = defineEmits<{
  'update-translation': [paragraphId: string, newTranslation: string];
  'retranslate': [paragraphId: string];
  'polish': [paragraphId: string];
  'select-translation': [paragraphId: string, translationId: string];
  'paragraph-click': [paragraphId: string];
  'paragraph-edit-start': [paragraphId: string];
  'paragraph-edit-stop': [paragraphId: string];
}>();

const aiModelsStore = useAIModelsStore();
const contextStore = useContextStore();
const booksStore = useBooksStore();
const uiStore = useUiStore();

const hasContent = computed(() => {
  return props.paragraph.text?.trim().length > 0;
});

// 获取当前段落的翻译文本
const translationText = computed(() => {
  if (!props.paragraph.selectedTranslationId || !props.paragraph.translations) {
    return '';
  }
  const selectedTranslation = props.paragraph.translations.find(
    (t) => t.id === props.paragraph.selectedTranslationId,
  );
  return selectedTranslation?.translation || '';
});

const hasTranslation = computed(() => {
  return translationText.value.trim().length > 0;
});

// 获取最近的翻译（除了当前应用的）
const mostRecentTranslation = computed(() => {
  if (!props.paragraph.translations || props.paragraph.translations.length === 0) {
    return null;
  }
  
  // 过滤掉当前选中的翻译
  const otherTranslations = props.paragraph.translations.filter(
    (t) => t.id !== props.paragraph.selectedTranslationId
  );
  
  if (otherTranslations.length === 0) {
    return null;
  }
  
  // 返回第一个（假设 translations 数组是按时间顺序的，最新的在最后）
  // 或者返回最后一个（如果最新的在最后）
  return otherTranslations[otherTranslations.length - 1];
});

// 是否有其他翻译可以显示
const hasOtherTranslations = computed(() => {
  // 只有当翻译数量大于1时才显示按钮
  return (
    props.paragraph.translations &&
    props.paragraph.translations.length > 1
  );
});

// 处理翻译文本的高亮
const translationNodes = computed(() => {
  const text = translationText.value;
  if (!text || !props.searchQuery || !props.searchQuery.trim()) {
    return [{ type: 'text', content: text }];
  }

  const query = props.searchQuery;
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part) => ({
    type: part.toLowerCase() === query.toLowerCase() ? 'highlight' : 'text',
    content: part
  })).filter(node => node.content);
});

// Popover refs
const termPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const characterPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const contextMenuPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const recentTranslationPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const paragraphCardRef = ref<HTMLElement | null>(null);
const hoveredTerm = ref<Terminology | null>(null);
const hoveredCharacter = ref<CharacterSetting | null>(null);
const termRefsMap = new Map<string, HTMLElement>();
const characterRefsMap = new Map<string, HTMLElement>();
const recentTranslationButtonRef = ref<HTMLElement | null>(null);

/**
 * 将文本转换为包含高亮术语和角色的节点数组
 */
const highlightedText = computed(
  (): Array<{
    type: 'text' | 'term' | 'character';
    content: string;
    term?: Terminology;
    character?: CharacterSetting;
  }> => {
    if (!hasContent.value) {
      return [{ type: 'text', content: props.paragraph.text }];
    }

    return parseTextForHighlighting(
      props.paragraph.text,
      props.terminologies,
      props.characterSettings,
      props.characterScores,
    );
  },
);

// 处理术语悬停
const handleTermMouseEnter = (event: Event, term: Terminology) => {
  hoveredTerm.value = term;
  const target = event.currentTarget as HTMLElement;
  if (target && termPopoverRef.value) {
    termRefsMap.set(term.id, target);
    termPopoverRef.value.toggle(event);
  }
};

// 处理术语鼠标离开
const handleTermMouseLeave = () => {
  if (termPopoverRef.value) {
    termPopoverRef.value.hide();
  }
};

// 当术语 Popover 关闭时清理状态
const handleTermPopoverHide = () => {
  hoveredTerm.value = null;
};

// 处理角色悬停
const handleCharacterMouseEnter = (event: Event, character: CharacterSetting) => {
  hoveredCharacter.value = character;
  const target = event.currentTarget as HTMLElement;
  if (target && characterPopoverRef.value) {
    characterRefsMap.set(character.id, target);
    characterPopoverRef.value.toggle(event);
  }
};

// 处理角色鼠标离开
const handleCharacterMouseLeave = () => {
  if (characterPopoverRef.value) {
    characterPopoverRef.value.hide();
  }
};

// 当角色 Popover 关闭时清理状态
const handleCharacterPopoverHide = () => {
  hoveredCharacter.value = null;
};

// 处理段落悬停（仅用于上下文设置）
const handleParagraphMouseEnter = () => {
  // 如果提供了 bookId 和 chapterId，同时更新书籍、章节和段落
  if (props.bookId && props.chapterId) {
    contextStore.setContext(
      {
        currentBookId: props.bookId,
        currentChapterId: props.chapterId,
        hoveredParagraphId: props.paragraph.id,
      },
      props.paragraph.text,
    );
  } else {
    // 如果没有提供 bookId 和 chapterId，尝试通过段落 ID 查找
    const currentBookId = contextStore.getContext.currentBookId;
    if (currentBookId) {
      const book = booksStore.getBookById(currentBookId);
      if (book) {
        const location = ChapterService.findParagraphLocation(book, props.paragraph.id);
        if (location) {
          contextStore.setContext(
            {
              currentBookId: currentBookId,
              currentChapterId: location.chapter.id,
              hoveredParagraphId: props.paragraph.id,
            },
            props.paragraph.text,
          );
          return;
        }
      }
    }
    // 如果找不到位置信息，只设置段落
    contextStore.setHoveredParagraph(props.paragraph.id, props.paragraph.text);
  }
};

// 翻译编辑状态
const editingTranslationValue = ref('');
const translationTextareaRef = ref<InstanceType<typeof Textarea> | null>(null);
const translationInplaceRef = ref<InstanceType<typeof Inplace> | null>(null);

/**
 * 安全地从 Vue 组件实例中提取 $el 属性
 */
const getComponentElement = (componentInstance: unknown): HTMLElement | undefined => {
  const instance = componentInstance as { $el?: HTMLElement };
  return instance.$el;
};

// 开始编辑翻译
const onTranslationOpen = () => {
  editingTranslationValue.value = translationText.value;
  // 通知父组件开始编辑
  emit('paragraph-edit-start', props.paragraph.id);
  // 使用 nextTick 确保 DOM 更新后再聚焦
  nextTick(() => {
    if (translationTextareaRef.value) {
      // PrimeVue Textarea 组件内部使用 textarea 元素
      // 尝试多种方式访问 textarea 元素
      let textareaElement: HTMLTextAreaElement | null = null;
      
      // 方式1: 通过 $el 访问
      const componentElement = getComponentElement(translationTextareaRef.value);
      if (componentElement) {
        textareaElement = componentElement.querySelector('textarea');
      }
      
      // 方式2: 如果 $el 是 textarea 本身
      if (!textareaElement && componentElement instanceof HTMLTextAreaElement) {
        textareaElement = componentElement;
      }
      
      // 方式3: 通过组件实例的 input 属性（某些 PrimeVue 版本）
      if (!textareaElement) {
        const instance = translationTextareaRef.value as { input?: HTMLTextAreaElement };
        if (instance.input) {
          textareaElement = instance.input;
        }
      }
      
      if (textareaElement) {
        textareaElement.focus();
        // 将光标移到文本末尾
        const textLength = textareaElement.value.length;
        textareaElement.setSelectionRange(textLength, textLength);
      }
    }
  });
};

// 保存翻译
const onTranslationClose = () => {
  if (editingTranslationValue.value !== translationText.value) {
    emit('update-translation', props.paragraph.id, editingTranslationValue.value);
  }
  // 通知父组件停止编辑
  emit('paragraph-edit-stop', props.paragraph.id);
};

// 应用更改
const applyTranslation = (closeCallback: () => void) => {
  onTranslationClose();
  closeCallback();
};

// 取消编辑
const cancelTranslation = (closeCallback: () => void) => {
  editingTranslationValue.value = translationText.value;
  closeCallback();
};

// 处理键盘事件
const handleTranslationKeydown = (event: KeyboardEvent, closeCallback: () => void) => {
  // Enter 键：应用更改（保存并关闭）
  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    closeCallback();
    onTranslationClose();
  }
  // Shift+Enter：允许换行（不阻止默认行为，让浏览器处理换行）
  // 这里不需要处理，让默认行为发生即可
  // Escape 键：取消编辑
  else if (event.key === 'Escape') {
    event.preventDefault();
    editingTranslationValue.value = translationText.value;
    closeCallback();
  }
};

// 处理上下文菜单图标点击
const contextMenuButtonRef = ref<HTMLElement | null>(null);
const contextMenuTargetRef = ref<HTMLElement | null>(null);

const handleContextMenuClick = (event: Event) => {
  if (contextMenuButtonRef.value && contextMenuPopoverRef.value) {
    contextMenuPopoverRef.value.toggle(event);
  }
};

// 处理右键点击段落卡片
const handleParagraphContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  
  // 创建或获取临时目标元素在鼠标位置
  let target = contextMenuTargetRef.value;
  
  if (!target || !document.body.contains(target)) {
    target = document.createElement('div');
    target.style.position = 'fixed';
    target.style.width = '1px';
    target.style.height = '1px';
    target.style.pointerEvents = 'none';
    target.style.zIndex = '-1';
    target.style.opacity = '0';
    document.body.appendChild(target);
    contextMenuTargetRef.value = target;
  }
  
  // 设置临时元素位置为鼠标光标位置
  target.style.left = `${event.clientX}px`;
  target.style.top = `${event.clientY}px`;
  
  // 使用 nextTick 确保 DOM 更新后再显示菜单
  setTimeout(() => {
    if (contextMenuPopoverRef.value && target && document.body.contains(target)) {
      contextMenuPopoverRef.value.show(event, target);
    }
  }, 0);
};

// 当上下文菜单 Popover 关闭时清理状态
const handleContextMenuPopoverHide = () => {
  // 保留目标元素以便下次使用，只在组件卸载时清理
};

// 处理最近翻译按钮悬停
const handleRecentTranslationMouseEnter = (event: Event) => {
  if (recentTranslationPopoverRef.value && recentTranslationButtonRef.value && mostRecentTranslation.value) {
    recentTranslationPopoverRef.value.toggle(event);
  }
};

// 处理最近翻译按钮鼠标离开
const handleRecentTranslationMouseLeave = () => {
  if (recentTranslationPopoverRef.value) {
    recentTranslationPopoverRef.value.hide();
  }
};

// 当最近翻译 Popover 关闭时清理状态
const handleRecentTranslationPopoverHide = () => {
  // 不需要特殊处理
};

// 处理按钮点击（占位函数，暂不实现逻辑）
const handleProofread = () => {
  // TODO: 实现校对段落逻辑
};

const handlePolish = () => {
  // 关闭上下文菜单
  if (contextMenuPopoverRef.value) {
    contextMenuPopoverRef.value.hide();
  }
  // 触发润色事件
  emit('polish', props.paragraph.id);
};

const handleRetranslate = () => {
  emit('retranslate', props.paragraph.id);
};

// 复制段落原文到 AI 助手输入框
const handleCopyToAssistant = () => {
  // 关闭上下文菜单
  if (contextMenuPopoverRef.value) {
    contextMenuPopoverRef.value.hide();
  }
  // 将段落原文复制到助手输入框
  if (props.paragraph.text) {
    uiStore.setAssistantInputMessage(props.paragraph.text);
  }
};

// 翻译历史对话框
const showTranslationHistoryDialog = ref(false);

// 获取可用的翻译历史数量（用于显示按钮文本）
const translationHistoryCount = computed(() => {
  if (!props.paragraph.translations || props.paragraph.translations.length === 0) {
    return 0;
  }
  return Math.min(props.paragraph.translations.length, 5);
});

// 打开翻译历史对话框
const openTranslationHistory = () => {
  showTranslationHistoryDialog.value = true;
  if (contextMenuPopoverRef.value) {
    contextMenuPopoverRef.value.hide();
  }
  if (recentTranslationPopoverRef.value) {
    recentTranslationPopoverRef.value.hide();
  }
};

// 处理对话框中选择翻译
const handleDialogSelectTranslation = (translationId: string) => {
  emit('select-translation', props.paragraph.id, translationId);
};

// 组件卸载时清理临时元素
onUnmounted(() => {
  if (contextMenuTargetRef.value) {
    try {
      document.body.removeChild(contextMenuTargetRef.value);
    } catch {
      // 元素可能已经被移除，忽略错误
    }
    contextMenuTargetRef.value = null;
  }
});

// 暴露方法供父组件调用
defineExpose({
  startEditing: () => {
    if (translationInplaceRef.value && hasTranslation.value) {
      // 通过点击 display 区域来触发编辑
      const inplaceElement = getComponentElement(translationInplaceRef.value);
      if (inplaceElement) {
        const displayElement = inplaceElement.querySelector('.p-inplace-display') as HTMLElement;
        if (displayElement) {
          displayElement.click();
        }
      }
    }
  },
  stopEditing: () => {
    if (translationInplaceRef.value) {
      // 查找取消按钮并点击它来关闭编辑
      // 点击取消按钮会触发 @close 事件，从而调用 onTranslationClose 并发出 paragraph-edit-stop 事件
      const inplaceElement = getComponentElement(translationInplaceRef.value);
      if (inplaceElement) {
        // 查找取消按钮（通过图标类名）
        const cancelButton = inplaceElement.querySelector(
          '.translation-edit-buttons button .pi-times',
        )?.closest('button') as HTMLElement;
        if (cancelButton) {
          cancelButton.click();
        } else {
          // 如果没有找到取消按钮，尝试查找并点击应用按钮（保存并关闭）
          const applyButton = inplaceElement.querySelector(
            '.translation-edit-buttons button .pi-check',
          )?.closest('button') as HTMLElement;
          if (applyButton) {
            applyButton.click();
          }
        }
      }
    }
  },
  scrollIntoView: (options?: ScrollIntoViewOptions) => {
    if (paragraphCardRef.value) {
      paragraphCardRef.value.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        ...options,
      });
    }
  },
});
</script>

<template>
  <div
    :id="props.id"
    ref="paragraphCardRef"
    class="paragraph-card"
    :class="{ 'has-content': hasContent, 'paragraph-selected': props.selected }"
    tabindex="-1"
    @contextmenu="handleParagraphContextMenu"
    @mouseenter="handleParagraphMouseEnter"
    @click="emit('paragraph-click', props.paragraph.id)"
  >
    <span v-if="hasContent" class="paragraph-icon">¶</span>
    <!-- 最近翻译按钮 -->
    <button
      v-if="hasOtherTranslations"
      ref="recentTranslationButtonRef"
      class="recent-translation-icon-button"
      @click.stop="openTranslationHistory"
      @mouseenter="handleRecentTranslationMouseEnter"
      @mouseleave="handleRecentTranslationMouseLeave"
    >
      <i class="pi pi-history" />
    </button>
    <button
      v-if="hasContent"
      ref="contextMenuButtonRef"
      class="context-menu-icon-button"
      @click.stop="handleContextMenuClick"
    >
      <i class="pi pi-ellipsis-v" />
    </button>
    <div class="paragraph-content">
      <p class="paragraph-text">
        <template v-for="(node, nodeIndex) in highlightedText" :key="nodeIndex">
          <span v-if="node.type === 'text'">{{ node.content }}</span>
          <span
            v-else-if="node.type === 'term' && node.term"
            :ref="
              (el) => {
                if (el && node.term) {
                  termRefsMap.set(node.term.id, el as HTMLElement);
                }
              }
            "
            class="term-highlight"
            @mouseenter="handleTermMouseEnter($event, node.term!)"
            @mouseleave="handleTermMouseLeave"
          >
            {{ node.content }}
          </span>
          <span
            v-else-if="node.type === 'character' && node.character"
            :ref="
              (el) => {
                if (el && node.character) {
                  characterRefsMap.set(node.character.id, el as HTMLElement);
                }
              }
            "
            class="character-highlight"
            @mouseenter="handleCharacterMouseEnter($event, node.character!)"
            @mouseleave="handleCharacterMouseLeave"
          >
            {{ node.content }}
          </span>
        </template>
      </p>
      <div v-if="hasTranslation || props.isTranslating || props.isPolishing" class="paragraph-translation-wrapper">
        <!-- 正在翻译或润色时显示 skeleton（覆盖现有翻译） -->
        <div v-if="props.isTranslating || props.isPolishing" class="paragraph-translation-skeleton">
          <Skeleton width="100%" height="1.5rem" />
          <Skeleton width="85%" height="1.5rem" />
          <Skeleton width="70%" height="1.5rem" />
        </div>
        <!-- 有翻译文本且不在翻译时显示可编辑的翻译 -->
        <Inplace
          ref="translationInplaceRef"
          v-else-if="hasTranslation"
          class="translation-inplace"
          @open="onTranslationOpen"
          @close="onTranslationClose"
        >
          <template #display>
            <p class="paragraph-translation">
              <template v-for="(node, index) in translationNodes" :key="index">
                <span v-if="node.type === 'text'">{{ node.content }}</span>
                <mark v-else class="search-highlight">{{ node.content }}</mark>
              </template>
            </p>
          </template>
          <template #content="{ closeCallback }">
            <div class="paragraph-translation-edit">
              <Textarea
                ref="translationTextareaRef"
                v-model="editingTranslationValue"
                class="translation-textarea"
                :auto-resize="true"
                @keydown="(e) => handleTranslationKeydown(e, closeCallback)"
              />
              <div class="translation-edit-actions">
                <div class="translation-edit-hints">
                  <span class="hint-text">Enter 保存，Shift+Enter 换行，Esc 取消</span>
                </div>
                <div class="translation-edit-buttons">
                  <Button
                    label="取消"
                    icon="pi pi-times"
                    class="p-button-text p-button-sm"
                    size="small"
                    @click="cancelTranslation(closeCallback)"
                  />
                  <Button
                    label="应用"
                    icon="pi pi-check"
                    class="p-button-sm"
                    size="small"
                    @click="applyTranslation(closeCallback)"
                  />
                </div>
              </div>
            </div>
          </template>
        </Inplace>
      </div>
    </div>

    <!-- 术语提示框 - 使用 PrimeVue Popover -->
    <Popover
      ref="termPopoverRef"
      :dismissable="true"
      :show-close-icon="false"
      style="width: 20rem; max-width: 90vw"
      class="term-popover"
      @hide="handleTermPopoverHide"
    >
      <div v-if="hoveredTerm" class="term-popover-content">
        <div class="popover-header">
          <span class="popover-term-name">{{ hoveredTerm.name }}</span>
          <span class="popover-translation">{{ hoveredTerm.translation.translation }}</span>
        </div>
        <div v-if="hoveredTerm.description" class="popover-description">
          {{ hoveredTerm.description }}
        </div>
      </div>
    </Popover>

    <!-- 角色提示框 - 使用 PrimeVue Popover -->
    <Popover
      ref="characterPopoverRef"
      :dismissable="true"
      :show-close-icon="false"
      style="width: 20rem; max-width: 90vw"
      class="character-popover"
      @hide="handleCharacterPopoverHide"
    >
      <div v-if="hoveredCharacter" class="character-popover-content">
        <div class="popover-header">
          <div class="popover-character-name-row">
            <span class="popover-character-name">{{ hoveredCharacter.name }}</span>
            <span v-if="hoveredCharacter.sex" class="popover-character-sex">
              {{
                hoveredCharacter.sex === 'male'
                  ? '男'
                  : hoveredCharacter.sex === 'female'
                    ? '女'
                    : '其他'
              }}
            </span>
          </div>
          <span class="popover-translation">{{ hoveredCharacter.translation.translation }}</span>
        </div>
        <div v-if="hoveredCharacter.description" class="popover-description">
          {{ hoveredCharacter.description }}
        </div>
        <div
          v-if="hoveredCharacter.aliases && hoveredCharacter.aliases.length > 0"
          class="popover-aliases"
        >
          <span class="popover-aliases-label">别名：</span>
          <span class="popover-aliases-list">
            {{ hoveredCharacter.aliases.map((a) => a.name).join('、') }}
          </span>
        </div>
      </div>
    </Popover>

    <!-- 最近翻译提示框 - 使用 PrimeVue Popover -->
    <Popover
      ref="recentTranslationPopoverRef"
      :dismissable="true"
      :show-close-icon="false"
      style="width: 24rem; max-width: 90vw"
      class="recent-translation-popover"
      @hide="handleRecentTranslationPopoverHide"
    >
      <div v-if="mostRecentTranslation" class="recent-translation-popover-content">
        <div class="popover-header">
          <span class="popover-label">最近的翻译</span>
        </div>
        <div class="recent-translation-text">
          {{ mostRecentTranslation.translation }}
        </div>
        <div class="recent-translation-hint">
          点击按钮查看完整翻译历史
        </div>
      </div>
    </Popover>

    <!-- 上下文菜单 - 使用 PrimeVue Popover -->
    <Popover
      ref="contextMenuPopoverRef"
      :dismissable="true"
      :show-close-icon="false"
      style="width: 16rem"
      class="context-menu-popover"
      @hide="handleContextMenuPopoverHide"
    >
      <div class="context-menu-content">
        <Button
          label="校对段落"
          icon="pi pi-check-circle"
          class="context-menu-button"
          text
          severity="secondary"
          @click="handleProofread"
        />
        <Button
          label="润色段落"
          icon="pi pi-sparkles"
          class="context-menu-button"
          text
          severity="secondary"
          @click="handlePolish"
        />
        <Button
          label="重新翻译"
          icon="pi pi-refresh"
          class="context-menu-button"
          text
          severity="secondary"
          @click="handleRetranslate"
        />
        <Button
          label="复制原文到助手"
          icon="pi pi-copy"
          class="context-menu-button"
          text
          severity="secondary"
          @click="handleCopyToAssistant"
        />
        
        <!-- 翻译历史分隔线 -->
        <div v-if="translationHistoryCount > 0" class="context-menu-divider" />
        
        <!-- 翻译历史按钮 -->
        <Button
          v-if="translationHistoryCount > 0"
          :label="`翻译历史 (${translationHistoryCount})`"
          icon="pi pi-history"
          class="context-menu-button"
          text
          severity="secondary"
          @click="openTranslationHistory"
        />
      </div>
    </Popover>

    <!-- 翻译历史对话框 -->
    <TranslationHistoryDialog
      :visible="showTranslationHistoryDialog"
      :paragraph="paragraph"
      @update:visible="(val) => (showTranslationHistoryDialog = val)"
      @select-translation="handleDialogSelectTranslation"
    />
  </div>
</template>

<style scoped>
/* 段落卡片 */
.paragraph-card {
  padding: 1rem 1.25rem;
  width: 100%;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.paragraph-card:focus {
  outline: none;
}

.paragraph-card.paragraph-selected {
  /* 选中效果由外层容器处理，这里不添加样式 */
}

.paragraph-icon {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  font-size: 1rem;
  color: var(--moon-opacity-40);
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 1;
}

.paragraph-card.has-content:hover .paragraph-icon {
  opacity: 1;
  color: var(--primary-opacity-70);
  transform: translateY(-2px);
}

.recent-translation-icon-button {
  position: absolute;
  top: 0.75rem;
  right: 4rem;
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--white-opacity-20);
  border-radius: 4px;
  color: var(--moon-opacity-40);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;
}

.recent-translation-icon-button:hover {
  background-color: var(--white-opacity-10);
  border-color: var(--primary-opacity-50);
  color: var(--primary-opacity-100);
  opacity: 1;
}

.paragraph-card.has-content:hover .recent-translation-icon-button {
  opacity: 1;
}

.context-menu-icon-button {
  position: absolute;
  top: 0.75rem;
  right: 1.25rem;
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--white-opacity-20);
  border-radius: 4px;
  color: var(--moon-opacity-40);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;
}

.context-menu-icon-button:hover {
  background-color: var(--white-opacity-10);
  border-color: var(--primary-opacity-50);
  color: var(--primary-opacity-100);
}

.paragraph-card.has-content:hover .context-menu-icon-button {
  opacity: 1;
}


.paragraph-content {
  width: 100%;
  padding-right: 6rem; /* 为按钮留出空间：历史按钮右边距4rem + 宽度1.75rem ≈ 6rem */
}

.paragraph-text {
  margin: 0;
  color: var(--moon-opacity-60);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.paragraph-translation-wrapper {
  margin: 0.75rem 0 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--white-opacity-10);
}

.translation-inplace {
  width: 100%;
}

.translation-inplace :deep(.p-inplace-display) {
  padding: 0;
  border: none;
  background: transparent;
  cursor: text;
  transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.translation-inplace :deep(.p-inplace-display:focus) {
  outline: none;
}

.translation-inplace :deep(.p-inplace-display:hover) {
  background-color: var(--white-opacity-5);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  margin: -0.25rem -0.5rem;
}

.paragraph-translation {
  margin: 0;
  color: var(--primary-opacity-90);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.paragraph-translation:focus {
  outline: none;
}

.paragraph-translation-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.paragraph-translation-skeleton :deep(.p-skeleton) {
  background: var(--white-opacity-10);
  border-radius: 4px;
}

.paragraph-translation-edit {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 300px;
}

.translation-textarea {
  width: 100%;
}

.translation-textarea :deep(textarea) {
  color: var(--primary-opacity-90);
  font-size: 0.9375rem;
  line-height: 1.8;
  font-family: inherit;
  background: var(--white-opacity-5);
  border: 1px solid var(--primary-opacity-30);
  border-radius: 4px;
  padding: 0.5rem;
  resize: vertical;
  min-height: 3rem;
}

.translation-textarea :deep(textarea:focus) {
  outline: none;
  border-color: var(--primary-opacity-60);
  background: var(--white-opacity-8);
}

.translation-edit-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.translation-edit-hints {
  display: flex;
  align-items: center;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  font-style: italic;
}

.translation-edit-buttons {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

/* 术语高亮 */
.term-highlight {
  background: linear-gradient(180deg, transparent 60%, var(--primary-opacity-30) 60%);
  color: var(--moon-opacity-95);
  cursor: help;
  padding: 0 0.125rem;
  border-radius: 2px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.term-highlight:hover {
  background: linear-gradient(180deg, transparent 60%, var(--primary-opacity-50) 60%);
  color: var(--primary-opacity-100);
}

/* 角色高亮 */
.character-highlight {
  background: linear-gradient(180deg, transparent 60%, rgba(168, 85, 247, 0.3) 60%);
  color: var(--moon-opacity-95);
  cursor: help;
  padding: 0 0.125rem;
  border-radius: 2px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.character-highlight:hover {
  background: linear-gradient(180deg, transparent 60%, rgba(168, 85, 247, 0.5) 60%);
  color: rgba(196, 181, 253, 1);
}

/* 术语 Popover 样式 */
:deep(.term-popover .p-popover-content),
:deep(.character-popover .p-popover-content) {
  padding: 0.75rem 1rem;
}

.term-popover-content,
.character-popover-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.popover-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.popover-term-name,
.popover-character-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-100);
  line-height: 1.4;
}

.popover-character-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.popover-character-sex {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: rgba(168, 85, 247, 0.2);
  color: rgba(196, 181, 253, 1);
  font-weight: 500;
}

.popover-translation {
  font-size: 0.875rem;
  color: var(--moon-opacity-90);
  line-height: 1.4;
  font-weight: 500;
}

.popover-description {
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  line-height: 1.5;
  margin-top: 0.25rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--white-opacity-20);
}

.popover-aliases {
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  line-height: 1.5;
  margin-top: 0.25rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--white-opacity-20);
}

.popover-aliases-label {
  color: var(--moon-opacity-70);
}

.popover-aliases-list {
  color: var(--moon-opacity-90);
}

/* 搜索高亮 */
.search-highlight {
  background-color: rgba(242, 192, 55, 0.3);
  color: theme('colors.warning.DEFAULT');
  border-radius: 2px;
  padding: 0 1px;
}

/* 最近翻译 Popover 样式 */
:deep(.recent-translation-popover .p-popover-content) {
  padding: 0.75rem 1rem;
}

.recent-translation-popover-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.recent-translation-text {
  font-size: 0.875rem;
  color: var(--moon-opacity-90);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  padding: 0.5rem;
  background: var(--white-opacity-5);
  border-radius: 4px;
  border: 1px solid var(--white-opacity-10);
}

.recent-translation-hint {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  font-style: italic;
  text-align: center;
  padding-top: 0.25rem;
}

.popover-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
  margin-bottom: 0.25rem;
}

/* 上下文菜单 Popover 样式 */
:deep(.context-menu-popover .p-popover-content) {
  padding: 0.5rem;
}

.context-menu-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.context-menu-button {
  width: 100%;
  justify-content: flex-start;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: var(--moon-opacity-90);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.context-menu-button:hover {
  background-color: var(--white-opacity-10);
  color: var(--primary-opacity-100);
}

.context-menu-button :deep(.p-button-label) {
  font-weight: 500;
}

/* 上下文菜单分隔线 */
.context-menu-divider {
  height: 1px;
  background: var(--white-opacity-20);
  margin: 0.5rem 0;
}

/* 上下文菜单分隔线 */
.context-menu-divider {
  height: 1px;
  background: var(--white-opacity-20);
  margin: 0.5rem 0;
}

/* 翻译历史部分 */
.translation-history-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.translation-history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 20rem;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.translation-history-item {
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
}

.translation-history-item:hover {
  background-color: var(--white-opacity-10);
  border-color: var(--primary-opacity-30);
}

.translation-history-item.is-selected {
  background-color: var(--primary-opacity-20);
  border-color: var(--primary-opacity-50);
}

.translation-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.translation-history-model {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  font-weight: 500;
}

.translation-history-check {
  font-size: 0.75rem;
  color: var(--primary-opacity-100);
}

.translation-history-text {
  font-size: 0.8125rem;
  color: var(--moon-opacity-90);
  line-height: 1.4;
  word-break: break-word;
}
</style>
