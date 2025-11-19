<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import { ref, computed, watch, nextTick, type ComponentPublicInstance } from 'vue';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import OverlayPanel from 'primevue/overlaypanel';
import { useUiStore } from '../stores/ui';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import ToastHistoryDialog from './ToastHistoryDialog.vue';

const ui = useUiStore();
const { unreadCount } = useToastHistory();
const aiProcessing = useAIProcessingStore();

// 获取最新的思考消息（只显示最后一行）
const latestThinkingMessage = computed(() => {
  // 直接访问 store 的 state 以确保响应式
  const activeTasks = aiProcessing.activeTasks;
  const thinkingTasks = activeTasks.filter(
    (task) => task.status === 'thinking' || task.status === 'processing',
  );

  if (thinkingTasks.length === 0) {
    return 'AI 思考过程';
  }

  const latest = thinkingTasks.sort((a, b) => b.startTime - a.startTime)[0];
  if (!latest) {
    return 'AI 思考过程';
  }

  // 优先使用实际的思考消息
  if (latest.thinkingMessage && latest.thinkingMessage.trim()) {
    // 获取最后一行
    const lines = latest.thinkingMessage.split('\n').filter((line) => line.trim());
    const lastLine =
      lines.length > 0 ? lines[lines.length - 1] || latest.thinkingMessage : latest.thinkingMessage;

    // 限制显示长度，避免按钮过长
    if (lastLine && lastLine.length > 50) {
      return lastLine.substring(0, 47) + '...';
    }

    return lastLine || latest.message || 'AI 思考过程';
  }

  return latest.message || `${latest.modelName} 正在思考...`;
});

const menuItems = ref<MenuItem[]>([
  // {
  //   label: '首页',
  //   icon: 'pi pi-home',
  //   command: () => {
  //     void router.push('/');
  //   },
  // },
]);

const bellButtonRef = ref<HTMLElement | null>(null);
const thinkingButtonRef = ref<HTMLElement | null>(null);
const toastHistoryRef = ref<ComponentPublicInstance<{ toggle: (event: Event) => void }> | null>(
  null,
);
const thinkingPanelRef = ref<InstanceType<typeof OverlayPanel> | null>(null);

const toggleHistoryDialog = (event: Event) => {
  toastHistoryRef.value?.toggle(event);
};

const toggleThinkingPanel = (event: Event) => {
  thinkingPanelRef.value?.toggle(event);
};

const taskTypeLabels: Record<string, string> = {
  translation: '翻译',
  proofreading: '校对',
  polishing: '润色',
  characterExtraction: '角色提取',
  terminologyExtraction: '术语提取',
  termsTranslation: '术语翻译',
  config: '配置获取',
  other: '其他',
};

const statusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  completed: '已完成',
  error: '错误',
  cancelled: '已取消',
};

const formatDuration = (startTime: number, endTime?: number): string => {
  const end = endTime || Date.now();
  const duration = Math.floor((end - startTime) / 1000);
  if (duration < 60) {
    return `${duration}秒`;
  }
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}分${seconds}秒`;
};

// 停止任务
const stopTask = (taskId: string) => {
  aiProcessing.stopTask(taskId);
};

// 思考消息滚动容器 refs（使用 Map 存储每个任务的滚动元素）
const thinkingMessageRefs = ref<Map<string, HTMLElement>>(new Map());

// 设置思考消息容器的 ref
const setThinkingMessageRef = (taskId: string, el: HTMLElement | null) => {
  if (el) {
    thinkingMessageRefs.value.set(taskId, el);
  } else {
    thinkingMessageRefs.value.delete(taskId);
  }
};

// 滚动到思考消息底部
const scrollThinkingMessageToBottom = (taskId: string) => {
  void nextTick(() => {
    const element = thinkingMessageRefs.value.get(taskId);
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  });
};

// 监听所有任务的思考消息变化，自动滚动到底部
watch(
  () =>
    aiProcessing.activeTasks.map((task) => ({
      id: task.id,
      thinkingMessage: task.thinkingMessage,
      status: task.status,
    })),
  (newTasks, oldTasks) => {
    // 当任何任务的思考消息更新时，滚动对应的容器到底部
    newTasks.forEach((newTask) => {
      if (
        newTask.thinkingMessage &&
        (newTask.status === 'thinking' || newTask.status === 'processing')
      ) {
        // 检查消息是否真的变化了（长度增加表示有新内容）
        const oldTask = oldTasks?.find((t) => t.id === newTask.id);
        if (!oldTask || newTask.thinkingMessage.length > (oldTask.thinkingMessage?.length || 0)) {
          scrollThinkingMessageToBottom(newTask.id);
        }
      }
    });
  },
  { deep: true },
);
</script>

<template>
  <header class="sticky top-0 z-20 shadow-sm shrink-0">
    <Menubar :model="menuItems" class="!rounded-none">
      <template #start>
        <div class="flex items-center gap-2 px-2 mr-3">
          <Button
            aria-label="切换侧边栏"
            class="p-button-text p-button-rounded"
            icon="pi pi-bars"
            @click="ui.toggleSideMenu()"
          />
          <i class="pi pi-moon text-primary-600" />
          <span class="font-semibold">Luna AI Translator</span>
        </div>
      </template>

      <template #end>
        <div class="flex items-center gap-2 px-2 mr-3">
          <!-- AI 思考过程按钮 -->
          <Button
            ref="thinkingButtonRef"
            aria-label="AI 思考过程"
            class="p-button-text p-button-rounded relative thinking-button"
            :class="{ 'thinking-active': aiProcessing.hasActiveTasks }"
            @click="toggleThinkingPanel"
          >
            <i class="pi pi-sparkles" :class="{ 'animate-spin': aiProcessing.hasActiveTasks }" />
            <span v-if="latestThinkingMessage" class="thinking-button-label">{{
              latestThinkingMessage
            }}</span>
          </Button>

          <!-- 消息历史按钮 -->
          <Button
            ref="bellButtonRef"
            aria-label="消息历史"
            class="p-button-text p-button-rounded relative bell-button"
            @click="toggleHistoryDialog"
          >
            <i class="pi pi-bell" />
            <Badge
              v-if="unreadCount > 0"
              :value="unreadCount > 99 ? '99+' : unreadCount"
              class="absolute top-0 right-0"
              severity="danger"
            />
          </Button>
        </div>
      </template>
    </Menubar>

    <!-- Toast 历史 Popover -->
    <ToastHistoryDialog ref="toastHistoryRef" />

    <!-- AI 思考过程 Popover -->
    <OverlayPanel
      ref="thinkingPanelRef"
      :dismissable="true"
      :show-close-icon="false"
      style="width: 32rem; max-height: 600px"
      class="thinking-overlay"
    >
      <div class="flex flex-col h-full">
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
          <h3 class="text-lg font-semibold text-moon/90">AI 思考过程</h3>
          <Button
            v-if="
              aiProcessing.activeTasks.filter(
                (t: AIProcessingTask) => t.status === 'completed' || t.status === 'error',
              ).length > 0
            "
            icon="pi pi-trash"
            class="p-button-text p-button-danger p-button-sm"
            title="清空已完成"
            @click="aiProcessing.clearCompletedTasks()"
          />
        </div>

        <div class="flex-1 overflow-auto min-h-0 space-y-3" style="max-height: 500px">
          <div v-if="aiProcessing.activeTasksList.length === 0" class="text-center py-8">
            <i class="pi pi-check-circle text-4xl text-moon/40 mb-4" />
            <p class="text-moon/60">当前没有正在进行的任务</p>
          </div>

          <div
            v-for="task in aiProcessing.activeTasksList"
            :key="task.id"
            class="p-4 rounded-lg border border-white/10 bg-white/5"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <i
                  class="pi"
                  :class="{
                    'pi-spin pi-spinner text-primary':
                      task.status === 'thinking' || task.status === 'processing',
                    'pi-check-circle text-green-500': task.status === 'completed',
                    'pi-times-circle text-red-500': task.status === 'error',
                    'pi-ban text-orange-500': task.status === 'cancelled',
                  }"
                />
                <span class="font-medium text-moon/90">{{ task.modelName }}</span>
                <span class="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">{{
                  taskTypeLabels[task.type] || task.type
                }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-moon/60">{{
                  statusLabels[task.status] || task.status
                }}</span>
                <Button
                  v-if="task.status === 'thinking' || task.status === 'processing'"
                  icon="pi pi-stop"
                  class="p-button-text p-button-sm p-button-rounded p-button-danger"
                  @click="stopTask(task.id)"
                  :pt="{
                    root: { class: '!p-1 !min-w-0 !h-6 !w-6' },
                  }"
                  aria-label="停止任务"
                />
              </div>
            </div>

            <p v-if="task.message" class="text-sm text-moon/70 mt-2">{{ task.message }}</p>

            <!-- 显示思考消息 -->
            <div
              v-if="task.thinkingMessage && task.thinkingMessage.trim()"
              class="mt-2 p-2 rounded bg-white/3 border border-white/5"
            >
              <p class="text-xs text-moon/50 mb-1">思考过程：</p>
              <p
                :ref="(el) => setThinkingMessageRef(task.id, el as HTMLElement)"
                class="text-xs text-moon/70 whitespace-pre-wrap break-words max-h-32 overflow-y-auto"
              >
                {{ task.thinkingMessage }}
              </p>
            </div>

            <div class="flex items-center gap-2 mt-3 text-xs text-moon/50">
              <span>运行时间: {{ formatDuration(task.startTime, task.endTime) }}</span>
              <span v-if="task.endTime">
                · 完成于 {{ new Date(task.endTime).toLocaleTimeString('zh-CN') }}
              </span>
            </div>
          </div>

          <!-- 最近完成的任务 -->
          <div
            v-if="
              aiProcessing.activeTasks.filter(
                (t: AIProcessingTask) => t.status === 'completed' || t.status === 'error',
              ).length > 0
            "
            class="mt-6"
          >
            <h4 class="text-sm font-medium text-moon/70 mb-3">最近完成的任务</h4>
            <div class="space-y-2">
              <div
                v-for="task in aiProcessing.activeTasks
                  .filter((t: AIProcessingTask) => t.status === 'completed' || t.status === 'error')
                  .slice(0, 5)"
                :key="task.id"
                class="p-3 rounded-lg border border-white/5 bg-white/2"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <i
                      class="pi text-sm"
                      :class="{
                        'pi-check-circle text-green-500': task.status === 'completed',
                        'pi-times-circle text-red-500': task.status === 'error',
                      }"
                    />
                    <span class="text-sm text-moon/70">{{ task.modelName }}</span>
                    <span class="text-xs px-1.5 py-0.5 rounded bg-white/5 text-moon/50">{{
                      taskTypeLabels[task.type] || task.type
                    }}</span>
                  </div>
                  <span class="text-xs text-moon/50">{{
                    formatDuration(task.startTime, task.endTime)
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </OverlayPanel>
  </header>
</template>

<style scoped>
.bell-button i {
  color: var(--moon-opacity-85) !important;
  font-size: 1rem;
}

.bell-button:hover i {
  color: var(--moon-opacity-95) !important;
}

.thinking-button {
  max-width: 500px;
  overflow: visible;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.thinking-button i {
  color: var(--moon-opacity-85) !important;
  font-size: 1rem;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.thinking-button:hover i {
  color: var(--moon-opacity-95) !important;
}

.thinking-button.thinking-active i {
  color: var(--primary-color) !important;
}

.thinking-button .animate-spin {
  animation: spin 1s linear infinite;
}

.thinking-button-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
  display: inline-block;
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
  margin-left: 0.5rem;
}

.thinking-button.thinking-active .thinking-button-label {
  color: var(--primary-color);
}

.thinking-overlay :deep(.p-overlaypanel-content) {
  padding: 1rem;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
