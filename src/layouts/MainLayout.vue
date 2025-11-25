<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref } from 'vue';
import AppHeader from '../components/layout/AppHeader.vue';
import AppFooter from '../components/layout/AppFooter.vue';
import AppSideMenu from '../components/layout/AppSideMenu.vue';
import AppRightPanel from '../components/layout/AppRightPanel.vue';
import Toast from 'primevue/toast';
import ProgressSpinner from 'primevue/progressspinner';
import { RouterView } from 'vue-router';
import { useUiStore } from '../stores/ui';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useAutoSync } from 'src/composables/useAutoSync';
import ConflictResolutionDialog from 'src/components/dialogs/ConflictResolutionDialog.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';

const ui = useUiStore();
const { markAsReadByMessage } = useToastHistory();
const toast = useToastWithHistory();
const aiProcessingStore = useAIProcessingStore();

// 跟踪之前的任务状态，用于检测状态变化
const previousTasks = ref<Map<string, AIProcessingTask>>(new Map());

// 监听 AI 任务状态变化
watch(
  () => aiProcessingStore.activeTasks,
  (newTasks, oldTasks) => {
    // 处理新添加的任务
    for (const task of newTasks) {
      const oldTask = previousTasks.value.get(task.id);

      // 如果任务状态发生变化
      if (oldTask && oldTask.status !== task.status) {
        const taskTypeLabel = TASK_TYPE_LABELS[task.type] || task.type;

        // 不显示任务开始和完成的 toast，只显示错误和取消
        if (task.status === 'error') {
          const errorMessage = task.message || '未知错误';
          toast.add({
            severity: 'error',
            summary: 'AI 任务失败',
            detail: `${task.modelName} 执行${taskTypeLabel}任务时出错：${errorMessage}`,
            life: 5000,
          });
        } else if (task.status === 'cancelled') {
          toast.add({
            severity: 'warn',
            summary: 'AI 任务已取消',
            detail: `${task.modelName} 的${taskTypeLabel}任务已取消`,
            life: 3000,
          });
        }
      }

      // 更新任务记录
      previousTasks.value.set(task.id, { ...task });
    }

    // 清理已移除的任务记录
    const currentTaskIds = new Set(newTasks.map((t) => t.id));
    for (const [taskId] of previousTasks.value) {
      if (!currentTaskIds.has(taskId)) {
        previousTasks.value.delete(taskId);
      }
    }
  },
  { deep: true },
);

// 处理 Toast 关闭事件
const handleToastClose = (event: any) => {
  if (event?.message) {
    void markAsReadByMessage(event.message);
  }
};

// 自动同步
const {
  showConflictDialog,
  detectedConflicts,
  handleConflictResolve,
  handleConflictCancel,
  setupAutoSync,
  stopAutoSync,
} = useAutoSync();

// 处理冲突解决（带错误处理）
const handleConflictResolveWithError = async (resolutions: any[]) => {
  try {
    await handleConflictResolve(resolutions);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '同步失败',
      detail: error instanceof Error ? error.message : '解决冲突时发生未知错误',
      life: 5000,
    });
  }
};

onMounted(() => {
  setupAutoSync();
});

onUnmounted(() => {
  stopAutoSync();
});
</script>

<template>
  <div class="h-screen overflow-hidden bg-luna-sky text-moon-100 flex flex-col">
    <!-- 初始数据加载指示器 -->
    <div
      v-if="ui.isInitialDataLoading"
      class="fixed inset-0 z-50 flex items-center justify-center bg-night-900/90 backdrop-blur-sm"
    >
      <div class="flex flex-col items-center gap-4">
        <ProgressSpinner
          style="width: 4rem; height: 4rem"
          stroke-width="4"
          animation-duration="1s"
        />
        <p class="text-moon/90 text-lg font-medium">正在加载应用数据...</p>
        <p class="text-moon/60 text-sm">请稍候</p>
      </div>
    </div>

    <AppHeader />

    <div class="flex flex-1 overflow-hidden min-h-0">
      <div
        class="sidebar-wrapper flex-shrink-0 flex flex-col"
        :style="{ width: ui.sideMenuOpen ? '16rem' : '0' }"
        :inert="!ui.sideMenuOpen"
      >
        <div
          class="h-full w-64 transform transition duration-200 flex flex-col"
          :class="ui.sideMenuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'"
        >
          <AppSideMenu />
        </div>
      </div>
      <main
        class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-night-900/80 backdrop-blur-xl"
      >
        <RouterView />
      </main>
      <div
        class="right-panel-wrapper flex-shrink-0 flex flex-col"
        :style="{ width: ui.rightPanelOpen ? `${ui.rightPanelWidth}px` : '0' }"
        :inert="!ui.rightPanelOpen"
      >
        <div
          class="h-full transform transition duration-200 flex flex-col"
          :style="{ width: `${ui.rightPanelWidth}px` }"
          :class="ui.rightPanelOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'"
        >
          <AppRightPanel />
        </div>
      </div>
    </div>

    <AppFooter />
  </div>

  <!-- Toast 组件 -->
  <Toast position="top-right" @close="handleToastClose" />

  <!-- 冲突解决对话框 -->
  <ConflictResolutionDialog
    :visible="showConflictDialog"
    :conflicts="detectedConflicts"
    @resolve="handleConflictResolveWithError"
    @cancel="handleConflictCancel"
  />
</template>

<style scoped>
.sidebar-wrapper,
.right-panel-wrapper {
  transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
  height: 100%;
}

main {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0; /* Required for flexbox overflow to work */
  height: 100%; /* Ensure main takes full height of flex container */
}
</style>
