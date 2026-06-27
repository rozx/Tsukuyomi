<script setup lang="ts">
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import type { Terminology, CharacterSetting, Translation } from 'src/models/novel';
import { useContextMenuManager } from 'src/composables/useContextMenuManager';
import ParagraphCharacterPopoverList from 'src/components/novel/ParagraphCharacterPopoverList.vue';

// 段落卡片的四个 Popover（术语 / 角色 / 最近翻译 / 上下文菜单）。
// 从 ParagraphCard 拆出：拥有 Popover 实例与 ref，通过 defineExpose 暴露
// toggle/hide 给父级调用；hide/mouseenter 通过事件回传父级以管理延迟关闭定时器。
const props = defineProps<{
  term: Terminology | null;
  character: CharacterSetting | null;
  characters: CharacterSetting[];
  recentTranslation: Translation | null | undefined;
  hasTextSelection: boolean;
  translationHistoryCount: number;
}>();

const emit = defineEmits<{
  'term-enter': [];
  'term-hide': [];
  'character-enter': [];
  'character-hide': [];
  'explain-selection': [];
  proofread: [];
  polish: [];
  retranslate: [];
  'copy-to-assistant': [];
  'open-history': [];
}>();

const { showContextMenu } = useContextMenuManager();

const termPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const characterPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const contextMenuPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const recentTranslationPopoverRef = ref<InstanceType<typeof Popover> | null>(null);

import { ref, computed } from 'vue';

const characterPopoverWidth = computed(() => (props.characters.length > 1 ? '24rem' : '20rem'));

const hideContextMenu = () => contextMenuPopoverRef.value?.hide();

const toggleTerm = (event: Event, target: HTMLElement) =>
  termPopoverRef.value?.toggle(event, target);
const hideTerm = () => termPopoverRef.value?.hide();
const toggleCharacter = (event: Event, target: HTMLElement) =>
  characterPopoverRef.value?.toggle(event, target);
const hideCharacter = () => characterPopoverRef.value?.hide();
const toggleRecent = (event: Event, target: HTMLElement) =>
  recentTranslationPopoverRef.value?.toggle(event, target);
const hideRecent = () => recentTranslationPopoverRef.value?.hide();
const showContext = (event: MouseEvent | Event, target: HTMLElement) => {
  if (contextMenuPopoverRef.value) showContextMenu(contextMenuPopoverRef, event, target);
};

defineExpose({
  toggleTerm,
  hideTerm,
  toggleCharacter,
  hideCharacter,
  toggleRecent,
  hideRecent,
  showContextMenu: showContext,
  hideContextMenu,
});

const onExplain = () => {
  hideContextMenu();
  emit('explain-selection');
};
const onProofread = () => {
  hideContextMenu();
  emit('proofread');
};
const onPolish = () => {
  hideContextMenu();
  emit('polish');
};
const onRetranslate = () => {
  hideContextMenu();
  emit('retranslate');
};
const onCopy = () => {
  hideContextMenu();
  emit('copy-to-assistant');
};
const onOpenHistory = () => {
  hideContextMenu();
  hideRecent();
  emit('open-history');
};
</script>

<template>
  <!-- 术语提示框 - 使用 PrimeVue Popover -->
  <Popover
    ref="termPopoverRef"
    :dismissable="true"
    :show-close-icon="false"
    style="width: 20rem; max-width: 90vw"
    class="term-popover"
    @hide="$emit('term-hide')"
  >
    <div
      v-if="term"
      class="term-popover-content"
      @mouseenter="$emit('term-enter')"
      @mouseleave="hideTerm"
    >
      <div class="popover-header">
        <span class="popover-term-name">{{ term.name }}</span>
        <span class="popover-translation">{{ term.translation.translation }}</span>
      </div>
      <div v-if="term.description" class="popover-description">{{ term.description }}</div>
    </div>
  </Popover>

  <!-- 角色提示框 - 使用 PrimeVue Popover -->
  <Popover
    ref="characterPopoverRef"
    :dismissable="true"
    :show-close-icon="false"
    :style="{ width: characterPopoverWidth, maxWidth: '90vw' }"
    class="character-popover"
    @hide="$emit('character-hide')"
  >
    <div
      v-if="character && characters.length > 0"
      class="character-popover-content"
      @mouseenter="$emit('character-enter')"
      @mouseleave="hideCharacter"
    >
      <ParagraphCharacterPopoverList :characters="characters" />
    </div>
  </Popover>

  <!-- 最近翻译提示框 - 使用 PrimeVue Popover -->
  <Popover
    ref="recentTranslationPopoverRef"
    :dismissable="true"
    :show-close-icon="false"
    style="width: 24rem; max-width: 90vw"
    class="recent-translation-popover"
  >
    <div v-if="recentTranslation" class="recent-translation-popover-content">
      <div class="popover-header">
        <span class="popover-label">最近的翻译</span>
      </div>
      <div class="recent-translation-text">{{ recentTranslation.translation }}</div>
      <div class="recent-translation-hint">点击按钮查看完整翻译历史</div>
    </div>
  </Popover>

  <!-- 上下文菜单 - 使用 PrimeVue Popover -->
  <Popover
    ref="contextMenuPopoverRef"
    :dismissable="true"
    :show-close-icon="false"
    style="width: 16rem"
    class="context-menu-popover"
  >
    <div class="context-menu-content">
      <Button
        v-if="hasTextSelection"
        label="解释选中文本"
        icon="pi pi-question-circle"
        class="context-menu-button"
        text
        @click="onExplain"
      />
      <div v-if="hasTextSelection" class="context-menu-divider" />
      <Button
        label="校对段落"
        icon="pi pi-check-circle"
        class="context-menu-button"
        text
        @click="onProofread"
      />
      <Button
        label="润色段落"
        icon="pi pi-sparkles"
        class="context-menu-button"
        text
        @click="onPolish"
      />
      <Button
        label="重新翻译"
        icon="pi pi-refresh"
        class="context-menu-button"
        text
        @click="onRetranslate"
      />
      <Button
        label="复制原文到助手"
        icon="pi pi-copy"
        class="context-menu-button"
        text
        @click="onCopy"
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
        @click="onOpenHistory"
      />
    </div>
  </Popover>
</template>

<style scoped>
.popover-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.popover-term-name {
  font-weight: 600;
  color: var(--moon-opacity-95);
  font-size: 0.9375rem;
}

.popover-translation {
  color: var(--primary-opacity-90);
  font-size: 0.875rem;
}

.popover-description {
  font-size: 0.8125rem;
  color: var(--moon-opacity-70);
  line-height: 1.5;
  margin-top: 0.375rem;
}

.popover-character-name-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.popover-character-name {
  font-weight: 600;
  color: var(--moon-opacity-95);
  font-size: 0.9375rem;
}

.popover-character-sex {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--white-opacity-5);
}

.popover-character-divider {
  height: 1px;
  background: var(--white-opacity-10);
  margin: 0.5rem 0;
}

.popover-multiple-characters-hint .hint-text {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}

.popover-aliases {
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}

.popover-aliases-label {
  color: var(--moon-opacity-50);
}

.popover-aliases-list {
  color: var(--moon-opacity-80);
}

.popover-label {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.recent-translation-text {
  font-size: 0.875rem;
  color: var(--moon-opacity-90);
  line-height: 1.6;
  margin: 0.25rem 0 0.5rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.recent-translation-hint {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
}

.context-menu-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.context-menu-divider {
  height: 1px;
  background: var(--white-opacity-10);
  margin: 0.25rem 0;
}

.context-menu-button {
  justify-content: flex-start;
  width: 100%;
  text-align: left;
}
</style>
