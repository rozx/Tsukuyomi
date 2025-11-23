<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import ProgressBar from 'primevue/progressbar';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useToast } from 'primevue/usetoast';
import { TASK_TYPE_LABELS } from 'src/constants/ai';

const props = defineProps<{
  isTranslating: boolean;
  progress: {
    current: number;
    total: number;
    message: string;
  };
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
}>();

const aiProcessingStore = useAIProcessingStore();
const toast = useToast();

const showAITaskHistory = ref(false);

const taskStatusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  completed: '已完成',
  error: '错误',
  cancelled: '已取消',
};

// Recent AI Tasks
const recentAITasks = computed(() => {
  const allTasks = aiProcessingStore.activeTasks;
  return [...allTasks].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
});

// Auto Scroll State
const autoScrollEnabled = ref<Record<string, boolean>>({});

// Task Fold State
const taskFolded = ref<Record<string, boolean>>({});

const toggleTaskFold = (taskId: string) => {
  taskFolded.value[taskId] = !taskFolded.value[taskId];
};

const thinkingContainers = ref<Record<string, HTMLElement | null>>({});

const setThinkingContainer = (taskId: string, el: HTMLElement | null) => {
  if (el) {
    thinkingContainers.value[taskId] = el;
  } else {
    delete thinkingContainers.value[taskId];
  }
};

const toggleAutoScroll = (taskId: string) => {
  autoScrollEnabled.value[taskId] = !autoScrollEnabled.value[taskId];
  if (autoScrollEnabled.value[taskId]) {
    setTimeout(() => {
      const container = thinkingContainers.value[taskId];
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 0);
  }
};

const clearCompletedTasks = async () => {
  try {
    await aiProcessingStore.clearCompletedTasks();
    toast.add({
      severity: 'success',
      summary: '清除成功',
      detail: '已清除所有已完成和已取消的任务',
      life: 3000,
    });
  } catch (error) {
    console.error('Failed to clear completed tasks:', error);
    toast.add({
      severity: 'error',
      summary: '清除失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 3000,
    });
  }
};

const formatTaskDuration = (startTime: number, endTime?: number): string => {
  const end = endTime || Date.now();
  const duration = Math.floor((end - startTime) / 1000);
  if (duration < 60) {
    return `${duration}秒`;
  }
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}分${seconds}秒`;
};

// Auto scroll watcher
watch(
  () =>
    recentAITasks.value.map((task) => ({
      id: task.id,
      message: task.thinkingMessage,
      length: task.thinkingMessage?.length || 0,
    })),
  () => {
    setTimeout(() => {
      for (const task of recentAITasks.value) {
        if (autoScrollEnabled.value[task.id] && task.thinkingMessage) {
          const container = thinkingContainers.value[task.id];
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }
    }, 0);
  },
  { deep: true, flush: 'post' },
);

</script>

<template>
  <div v-if="isTranslating" class="translation-progress-toolbar">
    <div class="translation-progress-content">
      <div class="translation-progress-info">
        <div class="translation-progress-header">
          <i class="pi pi-language translation-progress-icon"></i>
          <span class="translation-progress-title">正在翻译章节</span>
        </div>
        <div class="translation-progress-message">
          {{ progress.message || '正在处理...' }}
        </div>
      </div>
      <div class="translation-progress-bar-wrapper">
        <ProgressBar
          :value="
            progress.total > 0
              ? (progress.current / progress.total) * 100
              : 0
          "
          :show-value="false"
          class="translation-progress-bar"
        />
        <div class="translation-progress-text">
          {{ progress.current }} / {{ progress.total }}
        </div>
      </div>
      <Button
        icon="pi pi-list"
        :class="[
          'p-button-text p-button-sm translation-progress-history-toggle',
          { 'p-highlight': showAITaskHistory },
        ]"
        :title="showAITaskHistory ? '隐藏 AI 任务历史' : '显示 AI 任务历史'"
        @click="showAITaskHistory = !showAITaskHistory"
      />
      <Button
        icon="pi pi-times"
        label="取消"
        class="p-button-text p-button-sm translation-progress-cancel"
        @click="emit('cancel')"
      />
    </div>
    <!-- AI 任务历史 -->
    <div v-if="showAITaskHistory" class="translation-progress-ai-history">
      <div class="ai-history-content">
        <div v-if="recentAITasks.length === 0" class="ai-history-empty">
          <i class="pi pi-info-circle"></i>
          <span>暂无 AI 任务记录</span>
        </div>
        <div v-else class="ai-history-tasks">
          <!-- 清除已完成/已取消任务按钮 -->
          <div
            v-if="
              recentAITasks.some(
                (t) =>
                  t.status === 'completed' || t.status === 'error' || t.status === 'cancelled',
              )
            "
            class="ai-history-clear-actions"
          >
            <Button
              icon="pi pi-trash"
              label="清除已完成/已取消的任务"
              class="p-button-text p-button-sm ai-history-clear-button"
              @click="clearCompletedTasks"
            />
          </div>
          <div
            v-for="task in recentAITasks"
            :key="task.id"
            class="ai-history-task-item"
            :class="{
              'task-active': task.status === 'thinking' || task.status === 'processing',
              'task-completed': task.status === 'completed',
              'task-error': task.status === 'error',
              'task-cancelled': task.status === 'cancelled',
              'task-folded': taskFolded[task.id],
            }"
          >
            <div class="ai-task-header">
              <div class="ai-task-info">
                <Button
                  :icon="taskFolded[task.id] ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"
                  class="p-button-text p-button-sm ai-task-fold-toggle"
                  @click="toggleTaskFold(task.id)"
                  title="折叠/展开"
                />
                <i
                  class="pi ai-task-status-icon"
                  :class="{
                    'pi-spin pi-spinner':
                      task.status === 'thinking' || task.status === 'processing',
                    'pi-check-circle': task.status === 'completed',
                    'pi-times-circle': task.status === 'error',
                    'pi-ban': task.status === 'cancelled',
                  }"
                ></i>
                <span class="ai-task-model">{{ task.modelName }}</span>
                <Badge
                  :value="TASK_TYPE_LABELS[task.type] || task.type"
                  severity="info"
                  class="ai-task-type-badge"
                />
                <span class="ai-task-status">{{
                  taskStatusLabels[task.status] || task.status
                }}</span>
              </div>
              <div class="ai-task-meta">
                <span class="ai-task-duration">{{
                  formatTaskDuration(task.startTime, task.endTime)
                }}</span>
                <Button
                  v-if="task.status === 'thinking' || task.status === 'processing'"
                  icon="pi pi-stop"
                  class="p-button-text p-button-sm p-button-danger ai-task-stop"
                  @click="void aiProcessingStore.stopTask(task.id)"
                  title="停止任务"
                />
              </div>
            </div>
            <Transition name="task-content">
              <div v-if="!taskFolded[task.id]" class="ai-task-content">
                <div v-if="task.message" class="ai-task-message">{{ task.message }}</div>
                <div
                  v-if="task.thinkingMessage && task.thinkingMessage.trim()"
                  class="ai-task-thinking"
                >
                  <div class="ai-task-thinking-header">
                    <span class="ai-task-thinking-label">思考过程：</span>
                    <Button
                      :icon="autoScrollEnabled[task.id] ? 'pi pi-arrow-down' : 'pi pi-arrows-v'"
                      :class="[
                        'p-button-text p-button-sm ai-task-auto-scroll-toggle',
                        { 'auto-scroll-enabled': autoScrollEnabled[task.id] },
                      ]"
                      :title="
                        autoScrollEnabled[task.id]
                          ? '禁用自动滚动'
                          : '启用自动滚动（新内容出现时自动滚动到底部）'
                      "
                      @click="toggleAutoScroll(task.id)"
                    />
                  </div>
                  <div
                    :ref="(el) => setThinkingContainer(task.id, el as HTMLElement)"
                    class="ai-task-thinking-text"
                  >
                    {{ task.thinkingMessage }}
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.translation-progress-toolbar {
  flex-shrink: 0;
  padding: 0.75rem 1.5rem;
  background: var(--white-opacity-95);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--white-opacity-20);
  box-shadow: 0 -2px 12px var(--black-opacity-10);
  z-index: 10;
}

.translation-progress-content {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  max-width: 56rem;
  margin: 0 auto;
}

.translation-progress-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.translation-progress-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.translation-progress-icon {
  font-size: 1.125rem;
  color: var(--primary-opacity-80);
}

.translation-progress-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.translation-progress-message {
  font-size: 0.8125rem;
  color: var(--moon-opacity-70);
  line-height: 1.4;
}

.translation-progress-bar-wrapper {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.translation-progress-bar {
  flex: 1;
  height: 0.5rem;
}

.translation-progress-text {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--moon-opacity-80);
  white-space: nowrap;
  min-width: 4rem;
  text-align: right;
}

.translation-progress-history-toggle {
  flex-shrink: 0;
}

.translation-progress-cancel {
  flex-shrink: 0;
}

/* AI 任务历史 */
.translation-progress-ai-history {
  border-top: 1px solid var(--white-opacity-20);
  background: var(--white-opacity-3);
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
}

.ai-history-content {
  padding: 1rem 1.5rem;
}

.ai-history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--moon-opacity-60);
  font-size: 0.875rem;
}

.ai-history-tasks {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ai-history-clear-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.ai-history-clear-button {
  color: var(--moon-opacity-70);
  font-size: 0.8125rem;
}

.ai-history-clear-button:hover {
  color: var(--red-500);
  background: var(--red-500-opacity-10);
}

.ai-history-task-item {
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-5);
  transition: all 0.2s;
}

.ai-history-task-item.task-active {
  border-color: var(--primary-opacity-30);
  background: var(--primary-opacity-10);
}

.ai-history-task-item.task-completed {
  border-color: var(--green-500-opacity-30);
  background: var(--green-500-opacity-10);
}

.ai-history-task-item.task-error {
  border-color: var(--red-500-opacity-30);
  background: var(--red-500-opacity-10);
}

.ai-history-task-item.task-cancelled {
  border-color: var(--orange-500-opacity-30);
  background: var(--orange-500-opacity-10);
}

.ai-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.ai-task-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.ai-task-fold-toggle {
  padding: 0.25rem;
  min-width: 1.5rem;
  height: 1.5rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s;
}

.ai-task-fold-toggle:hover {
  color: var(--primary-opacity-80);
  background: var(--white-opacity-5);
}

.ai-task-status-icon {
  font-size: 0.875rem;
  flex-shrink: 0;
}

.ai-task-status-icon.pi-spinner {
  color: var(--primary-opacity-80);
}

.ai-task-status-icon.pi-check-circle {
  color: var(--green-500);
}

.ai-task-status-icon.pi-times-circle {
  color: var(--red-500);
}

.ai-task-status-icon.pi-ban {
  color: var(--orange-500);
}

.ai-task-model {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  white-space: nowrap;
}

.ai-task-type-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

.ai-task-status {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  white-space: nowrap;
}

.ai-task-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.ai-task-duration {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  white-space: nowrap;
}

.ai-task-stop {
  padding: 0.25rem;
  min-width: 1.5rem;
  height: 1.5rem;
}

.ai-task-content {
  overflow: hidden;
}

.ai-task-message {
  font-size: 0.8125rem;
  color: var(--moon-opacity-70);
  margin-top: 0.5rem;
  line-height: 1.4;
}

/* 折叠/展开过渡动画 */
.task-content-enter-active,
.task-content-leave-active {
  transition: all 0.3s ease;
  max-height: 2000px;
  opacity: 1;
}

.task-content-enter-from,
.task-content-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.ai-task-thinking {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-5);
  font-size: 0.75rem;
  line-height: 1.5;
}

.ai-task-thinking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.ai-task-thinking-label {
  color: var(--moon-opacity-50);
  font-weight: 500;
  margin-right: 0.5rem;
}

.ai-task-auto-scroll-toggle {
  color: var(--moon-opacity-50);
  padding: 0.25rem;
  min-width: auto;
  width: 1.5rem;
  height: 1.5rem;
  transition: all 0.2s;
}

.ai-task-auto-scroll-toggle:hover {
  color: var(--primary-opacity-80);
  background: var(--white-opacity-5);
}

.ai-task-auto-scroll-toggle.auto-scroll-enabled {
  color: var(--primary-opacity-80);
}

.ai-task-thinking-text {
  color: var(--moon-opacity-70);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  display: block;
  scroll-behavior: smooth;
}
</style>

