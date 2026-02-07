<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';

/**
 * 记忆引用接口
 */
export interface MemoryReference {
  memoryId: string;
  summary: string;
  accessedAt: number;
  toolName: 'get_memory' | 'search_memory_by_keywords';
}

interface Props {
  references: MemoryReference[];
  bookId: string;
  loading?: boolean;
  alwaysExpanded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  alwaysExpanded: false,
});

const emit = defineEmits<{
  'view-memory': [memoryId: string];
}>();

// 展开/折叠状态
const isExpanded = ref(false);

// 是否强制展开
const isAlwaysExpanded = computed(() => props.alwaysExpanded);

const isPanelExpanded = computed(() => (isAlwaysExpanded.value ? true : isExpanded.value));

// 引用数量
const referenceCount = computed(() => props.references?.length || 0);

// 是否有引用
const hasReferences = computed(() => referenceCount.value > 0);

// 切换展开/折叠
function toggleExpanded() {
  if (isAlwaysExpanded.value) {
    return;
  }
  isExpanded.value = !isExpanded.value;
}

// 查看记忆详情
function viewMemory(memoryId: string) {
  emit('view-memory', memoryId);
}

// 格式化相对时间
function formatRelativeTime(timestamp: number): string {
  const date = new Date(timestamp);
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
}
</script>

<template>
  <div class="memory-reference-panel">
    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center gap-2 text-moon-100/50 text-sm py-2">
      <i class="pi pi-spinner pi-spin"></i>
      <span>检索记忆中...</span>
    </div>

    <!-- 无引用状态 -->
    <div v-else-if="!hasReferences" class="flex items-center gap-2 text-moon-100/40 text-sm py-2">
      <i class="pi pi-lightbulb"></i>
      <span>未参考记忆</span>
    </div>

    <!-- 有引用状态 -->
    <div v-else class="border border-white/10 rounded-lg overflow-hidden">
      <!-- 头部：计数和展开按钮 -->
      <div
        class="flex items-center justify-between px-3 py-2 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
        @click="toggleExpanded"
      >
        <div class="flex items-center gap-2">
          <i class="pi pi-lightbulb text-primary-400"></i>
          <span class="text-sm text-moon-100/80"> AI 参考了 {{ referenceCount }} 条记忆 </span>
        </div>

        <Button
          v-if="!isAlwaysExpanded"
          :icon="isExpanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
          class="p-button-text p-button-sm !w-8 !h-8"
          :label="isExpanded ? '收起' : '展开'"
          @click.stop="toggleExpanded"
        />
      </div>

      <!-- 展开的引用列表 -->
      <div v-show="isPanelExpanded" class="border-t border-white/10">
        <div class="divide-y divide-white/5">
          <div
            v-for="reference in references"
            :key="reference.memoryId"
            class="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors cursor-pointer group"
            @click="viewMemory(reference.memoryId)"
          >
            <!-- 图标 -->
            <div class="flex-shrink-0">
              <i
                class="pi pi-bookmark text-primary-400/70 group-hover:text-primary-400 transition-colors"
              ></i>
            </div>

            <!-- 摘要 -->
            <div class="flex-1 min-w-0">
              <p
                class="text-sm text-moon-100/70 group-hover:text-moon-100 transition-colors truncate m-0"
              >
                {{ reference.summary }}
              </p>
            </div>

            <!-- 时间 -->
            <div class="flex-shrink-0 text-xs text-moon-100/40">
              {{ formatRelativeTime(reference.accessedAt) }}
            </div>

            <!-- 查看按钮 -->
            <Button
              icon="pi pi-eye"
              class="p-button-text p-button-sm !w-7 !h-7 opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop="viewMemory(reference.memoryId)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-reference-panel {
  margin-top: 0.5rem;
}
</style>
