<script setup lang="ts">
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import type { Paragraph, Terminology } from 'src/types/novel';

const props = defineProps<{
  paragraph: Paragraph;
  terminologies?: Terminology[];
}>();

const hasContent = computed(() => {
  return props.paragraph.text?.trim().length > 0;
});

// Popover ref
const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const hoveredTerm = ref<Terminology | null>(null);
const termRefsMap = new Map<string, HTMLElement>();

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将文本转换为包含高亮术语的节点数组
 */
const highlightedText = computed(() => {
  if (!hasContent.value || !props.terminologies || props.terminologies.length === 0) {
    return [{ type: 'text', content: props.paragraph.text }];
  }

  // 按名称长度降序排序，优先匹配较长的术语
  const sortedTerms = [...props.terminologies].sort((a, b) => b.name.length - a.name.length);

  // 创建术语映射（用于快速查找）
  const termMap = new Map<string, Terminology>();
  for (const term of sortedTerms) {
    if (term.name && term.name.trim()) {
      termMap.set(term.name.trim(), term);
    }
  }

  const text = props.paragraph.text;
  const nodes: Array<{ type: 'text' | 'term'; content: string; term?: Terminology }> = [];
  let lastIndex = 0;

  // 构建正则表达式：匹配所有术语名称
  const termNames = Array.from(termMap.keys())
    .map((name) => escapeRegex(name))
    .join('|');
  
  if (!termNames) {
    return [{ type: 'text', content: text }];
  }

  const regex = new RegExp(`(${termNames})`, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    const term = termMap.get(matchedText);

    // 如果匹配项前面还有普通文本
    if (match.index > lastIndex) {
      nodes.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    // 添加术语节点
    if (term) {
      nodes.push({
        type: 'term',
        content: matchedText,
        term,
      });
    } else {
      // 如果没有找到对应的术语（理论上不应该发生），作为普通文本处理
      nodes.push({
        type: 'text',
        content: matchedText,
      });
    }

    lastIndex = match.index + matchedText.length;
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    nodes.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', content: text }];
});

// 处理术语悬停
const handleTermMouseEnter = (event: Event, term: Terminology) => {
  hoveredTerm.value = term;
  const target = event.currentTarget as HTMLElement;
  if (target && popoverRef.value) {
    termRefsMap.set(term.id, target);
    popoverRef.value.toggle(event);
  }
};

// Popover 会在鼠标移开时自动关闭（dismissable=true）
// 不需要在 mouseLeave 中手动关闭，让 Popover 自己处理

// 当 Popover 关闭时清理状态
const handlePopoverHide = () => {
  hoveredTerm.value = null;
};

</script>

<template>
  <div class="paragraph-card" :class="{ 'has-content': hasContent }">
    <span v-if="hasContent" class="paragraph-icon">¶</span>
    <div class="paragraph-content">
      <p class="paragraph-text">
        <template v-for="(node, nodeIndex) in highlightedText" :key="nodeIndex">
          <span v-if="node.type === 'text'">{{ node.content }}</span>
          <span
            v-else-if="node.type === 'term' && node.term"
            :ref="(el) => {
              if (el && node.term) {
                termRefsMap.set(node.term.id, el as HTMLElement);
              }
            }"
            class="term-highlight"
            @mouseenter="handleTermMouseEnter($event, node.term!)"
          >
            {{ node.content }}
          </span>
        </template>
      </p>
    </div>

    <!-- 术语提示框 - 使用 PrimeVue Popover -->
    <Popover
      ref="popoverRef"
      :dismissable="true"
      :show-close-icon="false"
      style="width: 20rem; max-width: 90vw"
      class="term-popover"
      @hide="handlePopoverHide"
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
  </div>
</template>

<style scoped>
/* 段落卡片 */
.paragraph-card {
  padding: 1rem 1.25rem;
  width: 100%;
  position: relative;
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

.paragraph-content {
  width: 100%;
}

.paragraph-text {
  margin: 0;
  color: var(--moon-opacity-90);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
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

/* 术语 Popover 样式 */
:deep(.term-popover .p-popover-content) {
  padding: 0.75rem 1rem;
}

.term-popover-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.popover-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.popover-term-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-100);
  line-height: 1.4;
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
</style>

