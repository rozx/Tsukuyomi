<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import type { Memory } from 'src/models/memory';

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
}>();

// 嵌入模型版本常量（与 EmbeddingService 保持一致）
const CURRENT_EMBEDDING_MODEL = 'embeddinggemma-300m@256';

// 向量状态：ready（已向量化）/ pending（待向量化）/ stale（版本过期）
const embeddingStatus = computed<'ready' | 'pending' | 'stale'>(() => {
  const { embedding, embeddingModel } = props.memory;
  if (!embedding || embedding.length === 0) return 'pending';
  if (!embeddingModel || embeddingModel !== CURRENT_EMBEDDING_MODEL) return 'stale';
  return 'ready';
});

const embeddingBadgeClass = computed(() => {
  switch (embeddingStatus.value) {
    case 'ready':
      return 'bg-emerald-500/80';
    case 'stale':
      return 'bg-rose-500/80';
    case 'pending':
    default:
      return 'bg-amber-400/80';
  }
});

const embeddingBadgeTitle = computed(() => {
  switch (embeddingStatus.value) {
    case 'ready':
      return '已向量化';
    case 'stale':
      return '向量版本过期，将被重新计算';
    case 'pending':
    default:
      return '待向量化';
  }
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
    <!-- 向量状态徽章 -->
    <div
      class="absolute top-2 right-2 w-2 h-2 rounded-full z-20"
      :class="embeddingBadgeClass"
      :title="embeddingBadgeTitle"
    />

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
            class="text-base font-medium text-moon-100 line-clamp-2 break-words pr-4"
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
        class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-5 top-2 bg-black/50 rounded backdrop-blur-sm p-1 z-10"
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
