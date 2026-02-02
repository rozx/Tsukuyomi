<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import type { Memory, MemoryAttachment } from 'src/models/memory';
import MemoryAttachmentTag from './MemoryAttachmentTag.vue';
import { useMemoryAttachments } from 'src/composables/useMemoryAttachments';

interface Props {
  memory: Memory;
  bookId: string;
  showCheckbox?: boolean;
  checked?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showCheckbox: false,
  checked: false,
});

const emit = defineEmits<{
  click: [memory: Memory, openInEditMode?: boolean];
  delete: [memory: Memory];
  check: [checked: boolean, memoryId: string];
  'filter-by-attachment': [type: string, id: string];
}>();

// 使用 useMemoryAttachments composable
const { resolveNames } = useMemoryAttachments({
  bookId: computed(() => props.bookId),
});

// 附件名称状态（计算属性，自动响应缓存变化）
const attachmentsWithNames = computed(() => {
  if (!props.memory.attachedTo || props.memory.attachedTo.length === 0) {
    return [];
  }
  return resolveNames(props.memory.attachedTo);
});

// 内容预览（限制字符数）
const contentPreview = computed(() => {
  const content = props.memory.content || '';
  if (content.length <= 100) return content;
  return content.slice(0, 100) + '...';
});

// 格式化相对时间
const relativeTime = computed(() => {
  const date = new Date(props.memory.lastAccessedAt);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
});

// 显示的附件（最多3个）
const visibleAttachments = computed(() => {
  return attachmentsWithNames.value.slice(0, 3);
});

// 剩余附件数量
const remainingCount = computed(() => {
  return Math.max(0, attachmentsWithNames.value.length - 3);
});

// 处理附件点击
function handleAttachmentClick(type: string, id: string) {
  emit('filter-by-attachment', type, id);
}

// 处理卡片点击
function handleCardClick() {
  emit('click', props.memory);
}

// 处理复选框点击
function handleCheck(checked: boolean) {
  emit('check', checked, props.memory.id);
}
</script>

<template>
  <div
    class="group relative flex flex-col h-full rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors overflow-hidden w-full max-w-full cursor-pointer"
    :class="{ 'ring-2 ring-primary/50': showCheckbox && checked }"
    @click="handleCardClick"
  >
    <!-- 头部：摘要和操作 -->
    <div class="flex justify-between items-start mb-3 gap-3">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <!-- 复选框（批量操作模式） -->
        <Checkbox
          v-if="showCheckbox"
          :model-value="checked"
          :binary="true"
          @update:model-value="handleCheck"
          @click.stop
        />
        <div class="flex-1 min-w-0">
          <h3
            class="text-base font-medium text-moon-100 line-clamp-2 break-words"
            :title="memory.summary"
          >
            <i class="pi pi-bookmark text-primary-400 mr-2"></i>
            {{ memory.summary }}
          </h3>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div
        v-if="!showCheckbox"
        class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 bg-black/50 rounded backdrop-blur-sm p-1 z-10"
      >
        <Button
          icon="pi pi-pencil"
          class="p-button-text p-button-sm !w-8 !h-8 !text-white/80 hover:!text-white"
          @click.stop="$emit('click', memory, true)"
        />
        <Button
          icon="pi pi-trash"
          class="p-button-text p-button-sm p-button-danger !w-8 !h-8"
          @click.stop="$emit('delete', memory)"
        />
      </div>
    </div>

    <!-- 内容预览 -->
    <div class="mb-4 flex-1">
      <p
        class="text-sm text-moon-100/60 break-words overflow-hidden line-clamp-3"
        :title="memory.content"
      >
        {{ contentPreview }}
      </p>
    </div>

    <!-- 附件标签 -->
    <div v-if="visibleAttachments.length > 0" class="mb-3">
      <div class="flex flex-wrap gap-1.5 items-center">
        <MemoryAttachmentTag
          v-for="attachment in visibleAttachments"
          :key="`${attachment.type}:${attachment.id}`"
          :type="attachment.type"
          :id="attachment.id"
          :name="attachment.name"
          :loading="attachment.loading"
          :clickable="true"
          @click="handleAttachmentClick"
        />
        <!-- 更多附件指示器 -->
        <div
          v-if="remainingCount > 0"
          class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-white/10 text-moon-100/60 border border-white/10"
        >
          +{{ remainingCount }}
        </div>
      </div>
    </div>

    <!-- 底部：时间戳 -->
    <div class="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
      <div class="flex items-center gap-1.5 text-xs text-moon-100/40">
        <i class="pi pi-clock"></i>
        <span>{{ relativeTime }}</span>
      </div>

      <div class="text-xs text-moon-100/30 font-mono">
        {{ memory.id }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
