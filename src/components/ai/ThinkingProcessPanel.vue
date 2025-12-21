<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue';
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import { useConfirm } from 'primevue/useconfirm';
import ConfirmDialog from 'primevue/confirmdialog';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';

const aiProcessing = useAIProcessingStore();
const confirm = useConfirm();

// 加载思考过程
onMounted(async () => {
  await aiProcessing.loadThinkingProcesses();
});

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
const stopTask = async (taskId: string) => {
  await aiProcessing.stopTask(taskId);
};

// 手动清空所有任务
const clearAllTasks = () => {
  confirm.require({
    group: 'thinking-process',
    message: '确定要清空所有思考过程记录吗？此操作不可恢复。',
    header: '确认清空',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
    },
    acceptProps: {
      label: '清空',
      severity: 'danger',
    },
    accept: async () => {
      await aiProcessing.clearAllTasks();
    },
  });
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

// Popover ref
const popoverRef = ref<InstanceType<typeof Popover> | null>(null);

// 暴露方法供父组件调用
defineExpose({
  toggle: (event: Event) => {
    popoverRef.value?.toggle(event);
  },
});
</script>

<template>
  <Popover
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    style="width: 32rem; max-height: 600px"
    class="thinking-popover"
  >
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
        <h3 class="text-lg font-semibold text-moon/90">AI 思考过程</h3>
        <div class="flex items-center gap-2">
          <Button
            v-if="aiProcessing.completedTasksList.length > 0"
            icon="pi pi-trash"
            class="p-button-text p-button-danger p-button-sm"
            title="清空已完成"
            @click="aiProcessing.clearCompletedTasks()"
          />
          <Button
            v-if="aiProcessing.allTasksList.length > 0"
            icon="pi pi-times-circle"
            class="p-button-text p-button-danger p-button-sm"
            title="清空所有"
            @click="clearAllTasks"
          />
        </div>
      </div>

      <div class="flex-1 overflow-auto min-h-0 space-y-3" style="max-height: 500px">
        <div v-if="aiProcessing.allTasksList.length === 0" class="text-center py-8">
          <i class="pi pi-check-circle text-4xl text-moon/40 mb-4" />
          <p class="text-moon/60">当前没有思考过程记录</p>
        </div>

        <!-- 正在进行的任务 -->
        <div
          v-for="task in aiProcessing.activeTasksList"
          :key="task.id"
          class="p-4 rounded-lg border border-white/10 bg-white/5"
        >
          <div class="flex items-start justify-between mb-2 gap-2">
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <i
                class="pi flex-shrink-0"
                :class="{
                  'pi-spin pi-spinner text-primary':
                    task.status === 'thinking' || task.status === 'processing',
                  'pi-check-circle text-green-500': task.status === 'completed',
                  'pi-times-circle text-red-500': task.status === 'error',
                  'pi-ban text-orange-500': task.status === 'cancelled',
                }"
              />
              <span class="font-medium text-moon/90 truncate">{{ task.modelName }}</span>
              <span class="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary flex-shrink-0">{{
                TASK_TYPE_LABELS[task.type] || task.type
              }}</span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
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

          <p v-if="task.message" class="text-sm text-moon/70 mt-2 break-words">{{ task.message }}</p>

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

          <div class="flex items-center gap-2 mt-3 text-xs text-moon/50 break-words">
            <span>运行时间: {{ formatDuration(task.startTime, task.endTime) }}</span>
            <span v-if="task.endTime" class="break-words">
              · 完成于 {{ new Date(task.endTime).toLocaleTimeString('zh-CN') }}
            </span>
          </div>
        </div>

        <!-- 已完成的任务 -->
        <div
          v-if="aiProcessing.completedTasksList.length > 0"
          class="mt-6"
        >
          <h4 class="text-sm font-medium text-moon/70 mb-3">已完成的任务</h4>
          <div class="space-y-2">
            <div
              v-for="task in aiProcessing.completedTasksList.slice(0, 10)"
              :key="task.id"
              class="p-3 rounded-lg border border-white/5 bg-white/2"
            >
              <div class="flex items-start justify-between mb-2 gap-2">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <i
                    class="pi text-sm flex-shrink-0"
                    :class="{
                      'pi-check-circle text-green-500': task.status === 'completed',
                      'pi-times-circle text-red-500': task.status === 'error',
                      'pi-ban text-orange-500': task.status === 'cancelled',
                    }"
                  />
                  <span class="text-sm text-moon/70 truncate">{{ task.modelName }}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded bg-white/5 text-moon/50 flex-shrink-0">{{
                    TASK_TYPE_LABELS[task.type] || task.type
                  }}</span>
                </div>
                <span class="text-xs text-moon/50 flex-shrink-0">{{
                  formatDuration(task.startTime, task.endTime)
                }}</span>
              </div>
              <p v-if="task.message" class="text-xs text-moon/60 mb-2 break-words">{{ task.message }}</p>
              <!-- 显示思考消息（如果有） -->
              <div
                v-if="task.thinkingMessage && task.thinkingMessage.trim()"
                class="mt-2 p-2 rounded bg-white/3 border border-white/5"
              >
                <p class="text-xs text-moon/50 mb-1">思考过程：</p>
                <p
                  class="text-xs text-moon/70 whitespace-pre-wrap break-words max-h-24 overflow-y-auto"
                >
                  {{ task.thinkingMessage }}
                </p>
              </div>
              <div class="flex items-center gap-2 mt-2 text-xs text-moon/50 break-words">
                <span v-if="task.endTime" class="break-words">
                  完成于 {{ new Date(task.endTime).toLocaleString('zh-CN') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Popover>
  <ConfirmDialog group="thinking-process" />
</template>

<style scoped>
.thinking-popover :deep(.p-popover-content) {
  padding: 1rem;
}
</style>
