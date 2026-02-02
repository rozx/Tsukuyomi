<script setup lang="ts">
import { computed } from 'vue';
import type { MemoryAttachmentType } from 'src/models/memory';

interface Props {
  type: MemoryAttachmentType;
  id: string;
  name?: string;
  clickable?: boolean;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  clickable: true,
  loading: false,
});

const emit = defineEmits<{
  click: [type: MemoryAttachmentType, id: string];
}>();

// 类型配置
const typeConfig = computed(() => {
  switch (props.type) {
    case 'book':
      return {
        icon: 'pi pi-book',
        label: '书籍',
        colorClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30',
        iconClass: 'text-blue-400',
      };
    case 'character':
      return {
        icon: 'pi pi-user',
        label: '角色',
        colorClass: 'bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30',
        iconClass: 'text-green-400',
      };
    case 'term':
      return {
        icon: 'pi pi-tag',
        label: '术语',
        colorClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30',
        iconClass: 'text-purple-400',
      };
    case 'chapter':
      return {
        icon: 'pi pi-file',
        label: '章节',
        colorClass: 'bg-orange-500/20 text-orange-300 border-orange-500/30 hover:bg-orange-500/30',
        iconClass: 'text-orange-400',
      };
    default:
      return {
        icon: 'pi pi-question-circle',
        label: '未知',
        colorClass: 'bg-gray-500/20 text-gray-300 border-gray-500/30 hover:bg-gray-500/30',
        iconClass: 'text-gray-400',
      };
  }
});

// 显示文本
const displayText = computed(() => {
  if (props.loading) return '...';
  if (props.name === undefined) return '...';
  if (props.name === '[已删除]') return '[已删除]';
  // 如果是书籍类型，直接显示 "书籍" 而不是书名
  if (props.type === 'book') {
    return '书籍';
  }
  // 截断过长的名称（增加长度限制）
  if (props.name.length > 20) {
    return props.name.slice(0, 20) + '...';
  }
  return props.name;
});

// 是否已删除
const isDeleted = computed(() => props.name === '[已删除]');

// 处理点击
function handleClick() {
  if (!props.clickable || isDeleted.value) return;
  emit('click', props.type, props.id);
}
</script>

<template>
  <div
    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all duration-200"
    :class="[
      typeConfig.colorClass,
      clickable && !isDeleted ? 'cursor-pointer' : 'cursor-default opacity-70',
      isDeleted ? 'opacity-50 line-through' : '',
    ]"
    :title="name ? `${typeConfig.label}: ${name}` : typeConfig.label"
    @click="handleClick"
  >
    <i :class="[typeConfig.icon, typeConfig.iconClass]" class="text-sm"></i>
    <span class="truncate max-w-[180px]">{{ displayText }}</span>
  </div>
</template>
