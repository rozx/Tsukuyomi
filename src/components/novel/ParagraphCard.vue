<script setup lang="ts">
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import type { Paragraph, Terminology, CharacterSetting } from 'src/types/novel';

const props = defineProps<{
  paragraph: Paragraph;
  terminologies?: Terminology[];
  characterSettings?: CharacterSetting[];
}>();

const hasContent = computed(() => {
  return props.paragraph.text?.trim().length > 0;
});

// Popover refs
const termPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const characterPopoverRef = ref<InstanceType<typeof Popover> | null>(null);
const hoveredTerm = ref<Terminology | null>(null);
const hoveredCharacter = ref<CharacterSetting | null>(null);
const termRefsMap = new Map<string, HTMLElement>();
const characterRefsMap = new Map<string, HTMLElement>();

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将文本转换为包含高亮术语和角色的节点数组
 */
const highlightedText = computed((): Array<{
  type: 'text' | 'term' | 'character';
  content: string;
  term?: Terminology;
  character?: CharacterSetting;
}> => {
  if (!hasContent.value) {
    return [{ type: 'text', content: props.paragraph.text }];
  }

  const text = props.paragraph.text;
  const nodes: Array<{
    type: 'text' | 'term' | 'character';
    content: string;
    term?: Terminology;
    character?: CharacterSetting;
  }> = [];

  // 收集所有匹配项（术语和角色）
  interface Match {
    index: number;
    length: number;
    type: 'term' | 'character';
    term?: Terminology;
    character?: CharacterSetting;
    text: string;
  }

  const matches: Match[] = [];

  // 处理术语
  if (props.terminologies && props.terminologies.length > 0) {
    const sortedTerms = [...props.terminologies].sort((a, b) => b.name.length - a.name.length);
    const termMap = new Map<string, Terminology>();
    for (const term of sortedTerms) {
      if (term.name && term.name.trim()) {
        termMap.set(term.name.trim(), term);
      }
    }

    const termNames = Array.from(termMap.keys())
      .map((name) => escapeRegex(name))
      .join('|');

    if (termNames) {
      const regex = new RegExp(`(${termNames})`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[0];
        const term = termMap.get(matchedText);
        if (term) {
          matches.push({
            index: match.index,
            length: matchedText.length,
            type: 'term',
            term,
            text: matchedText,
          });
        }
      }
    }
  }

  // 处理角色（包括名称和别名）
  if (props.characterSettings && props.characterSettings.length > 0) {
    const nameToCharacterMap = new Map<string, CharacterSetting>();
    for (const char of props.characterSettings) {
      // 添加角色名称
      if (char.name && char.name.trim()) {
        nameToCharacterMap.set(char.name.trim(), char);
      }
      // 添加所有别名
      if (char.aliases && char.aliases.length > 0) {
        for (const alias of char.aliases) {
          if (alias.name && alias.name.trim()) {
            nameToCharacterMap.set(alias.name.trim(), char);
          }
        }
      }
    }

    // 按名称长度降序排序，优先匹配较长的名称
    const sortedNames = Array.from(nameToCharacterMap.keys()).sort((a, b) => b.length - a.length);

    if (sortedNames.length > 0) {
      const namePatterns = sortedNames.map((name) => escapeRegex(name)).join('|');
      const regex = new RegExp(`(${namePatterns})`, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[0];
        const char = nameToCharacterMap.get(matchedText);
        if (char) {
          matches.push({
            index: match.index,
            length: matchedText.length,
            type: 'character',
            character: char,
            text: matchedText,
          });
        }
      }
    }
  }

  // 如果没有匹配项，直接返回文本
  if (matches.length === 0) {
    return [{ type: 'text', content: text }];
  }

  // 按索引排序，然后处理重叠（优先保留较长的匹配）
  matches.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    // 如果索引相同，优先较长的匹配
    return b.length - a.length;
  });

  // 移除重叠的匹配（保留第一个，即较长的）
  const filteredMatches: Match[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    let hasOverlap = false;

    for (const existing of filteredMatches) {
      const currentEnd = current.index + current.length;
      const existingEnd = existing.index + existing.length;

      // 检查是否有重叠
      if (
        (current.index >= existing.index && current.index < existingEnd) ||
        (currentEnd > existing.index && currentEnd <= existingEnd) ||
        (current.index <= existing.index && currentEnd >= existingEnd)
      ) {
        hasOverlap = true;
        break;
      }
    }

    if (!hasOverlap) {
      filteredMatches.push(current);
    }
  }

  // 再次按索引排序
  filteredMatches.sort((a, b) => a.index - b.index);

  // 构建节点数组
  let lastIndex = 0;
  for (const match of filteredMatches) {
    // 添加匹配项前面的普通文本
    if (match.index > lastIndex) {
      nodes.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    // 添加匹配项
    if (match.type === 'term' && match.term) {
      nodes.push({
        type: 'term',
        content: match.text,
        term: match.term,
      });
    } else if (match.type === 'character' && match.character) {
      nodes.push({
        type: 'character',
        content: match.text,
        character: match.character,
      });
    }

    lastIndex = match.index + match.length;
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
            @mouseleave="handleTermMouseLeave"
          >
            {{ node.content }}
          </span>
          <span
            v-else-if="node.type === 'character' && node.character"
            :ref="(el) => {
              if (el && node.character) {
                characterRefsMap.set(node.character.id, el as HTMLElement);
              }
            }"
            class="character-highlight"
            @mouseenter="handleCharacterMouseEnter($event, node.character!)"
            @mouseleave="handleCharacterMouseLeave"
          >
            {{ node.content }}
          </span>
        </template>
      </p>
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
            <span
              v-if="hoveredCharacter.sex"
              class="popover-character-sex"
            >
              {{ hoveredCharacter.sex === 'male' ? '男' : hoveredCharacter.sex === 'female' ? '女' : '其他' }}
            </span>
          </div>
          <span class="popover-translation">{{ hoveredCharacter.translation.translation }}</span>
        </div>
        <div v-if="hoveredCharacter.description" class="popover-description">
          {{ hoveredCharacter.description }}
        </div>
        <div v-if="hoveredCharacter.aliases && hoveredCharacter.aliases.length > 0" class="popover-aliases">
          <span class="popover-aliases-label">别名：</span>
          <span class="popover-aliases-list">
            {{ hoveredCharacter.aliases.map(a => a.name).join('、') }}
          </span>
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
</style>

