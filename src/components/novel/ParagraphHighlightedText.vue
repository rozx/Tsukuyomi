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
