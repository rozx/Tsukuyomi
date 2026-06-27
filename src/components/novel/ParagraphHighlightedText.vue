<script setup lang="ts">
import type { Terminology, CharacterSetting } from 'src/models/novel';

// 段落原文高亮渲染：把文本/术语/角色三类节点的 v-if 分派与悬停事件收敛到叶子组件。
// termRefsMap/characterRefsMap 原为只写死缓存，随迁移一并移除。
defineProps<{
  nodes: Array<{
    type: 'text' | 'term' | 'character';
    content: string;
    term?: Terminology;
    character?: CharacterSetting;
    characters?: CharacterSetting[];
  }>;
}>();

defineEmits<{
  termEnter: [event: Event, term: Terminology];
  termLeave: [];
  characterEnter: [event: Event, character: CharacterSetting, characters: CharacterSetting[]];
  characterLeave: [];
}>();
</script>

<template>
  <template v-for="(node, nodeIndex) in nodes" :key="nodeIndex">
    <span v-if="node.type === 'text'">{{ node.content }}</span>
    <span
      v-else-if="node.type === 'term' && node.term"
      class="term-highlight"
      @mouseenter="$emit('termEnter', $event, node.term!)"
      @mouseleave="$emit('termLeave')"
    >
      {{ node.content }}
    </span>
    <span
      v-else-if="node.type === 'character' && node.character"
      class="character-highlight"
      @mouseenter="$emit('characterEnter', $event, node.character!, node.characters ?? [])"
      @mouseleave="$emit('characterLeave')"
    >
      {{ node.content }}
    </span>
  </template>
</template>

<style scoped>
/* 行内高亮样式。
 * 从 ParagraphCard.vue 迁移而来 —— 这些 span 渲染发生在本组件，
 * 父级 scoped 样式无法命中子组件内部嵌套元素，样式应与消费它的模板同处一个作用域。 */

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
</style>
