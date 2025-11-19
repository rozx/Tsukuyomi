<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import { ref, type ComponentPublicInstance } from 'vue';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import Dialog from 'primevue/dialog';
import { useUiStore } from '../stores/ui';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import ToastHistoryDialog from './ToastHistoryDialog.vue';

const ui = useUiStore();
const { unreadCount } = useToastHistory();
const aiProcessing = useAIProcessingStore();

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
const toastHistoryRef = ref<ComponentPublicInstance<{ toggle: (event: Event) => void }> | null>(null);
const showThinkingDialog = ref(false);

const toggleHistoryDialog = (event: Event) => {
  toastHistoryRef.value?.toggle(event);
};

const toggleThinkingDialog = () => {
  showThinkingDialog.value = !showThinkingDialog.value;
};

const taskTypeLabels: Record<string, string> = {
  translation: '翻译',
  proofreading: '校对',
  polishing: '润色',
  characterExtraction: '角色提取',
  terminologyExtraction: '术语提取',
  config: '配置获取',
  other: '其他',
};

const statusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  completed: '已完成',
  error: '错误',
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
            aria-label="AI 思考过程"
            class="p-button-text p-button-rounded relative thinking-button"
            :class="{ 'thinking-active': aiProcessing.hasActiveTasks }"
            @click="toggleThinkingDialog"
          >
            <i class="pi pi-sparkles" :class="{ 'animate-spin': aiProcessing.hasActiveTasks }" />
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

    <!-- AI 思考过程对话框 -->
    <Dialog
      v-model:visible="showThinkingDialog"
      modal
      header="AI 思考过程"
      :style="{ width: '32rem' }"
      class="thinking-dialog"
    >
      <div class="space-y-3">
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
                  'pi-spin pi-spinner text-primary': task.status === 'thinking' || task.status === 'processing',
                  'pi-check-circle text-green-500': task.status === 'completed',
                  'pi-times-circle text-red-500': task.status === 'error',
                }"
              />
              <span class="font-medium text-moon/90">{{ task.modelName }}</span>
              <span class="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">{{
                taskTypeLabels[task.type] || task.type
              }}</span>
            </div>
            <span class="text-xs text-moon/60">{{ statusLabels[task.status] || task.status }}</span>
          </div>

          <p v-if="task.message" class="text-sm text-moon/70 mt-2">{{ task.message }}</p>

          <div class="flex items-center gap-2 mt-3 text-xs text-moon/50">
            <span>运行时间: {{ formatDuration(task.startTime, task.endTime) }}</span>
            <span v-if="task.endTime">
              · 完成于 {{ new Date(task.endTime).toLocaleTimeString('zh-CN') }}
            </span>
          </div>
        </div>

        <!-- 最近完成的任务 -->
        <div v-if="aiProcessing.activeTasks.filter((t) => t.status === 'completed' || t.status === 'error').length > 0" class="mt-6">
          <h4 class="text-sm font-medium text-moon/70 mb-3">最近完成的任务</h4>
          <div class="space-y-2">
            <div
              v-for="task in aiProcessing.activeTasks
                .filter((t) => t.status === 'completed' || t.status === 'error')
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
                <span class="text-xs text-moon/50">{{ formatDuration(task.startTime, task.endTime) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between items-center">
          <Button
            label="清空已完成"
            icon="pi pi-trash"
            class="p-button-text p-button-sm"
            :disabled="aiProcessing.activeTasks.filter((t) => t.status === 'completed' || t.status === 'error').length === 0"
            @click="aiProcessing.clearCompletedTasks()"
          />
          <Button label="关闭" icon="pi pi-times" class="p-button-text p-button-sm" @click="showThinkingDialog = false" />
        </div>
      </template>
    </Dialog>
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

.thinking-button i {
  color: var(--moon-opacity-85) !important;
  font-size: 1rem;
  transition: all 0.3s ease;
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

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
