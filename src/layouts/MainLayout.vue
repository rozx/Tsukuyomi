<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref, computed } from 'vue';
import AppHeader from '../components/layout/AppHeader.vue';
import AppFooter from '../components/layout/AppFooter.vue';
import AppSideMenu from '../components/layout/AppSideMenu.vue';
import AppRightPanel from '../components/layout/AppRightPanel.vue';
import AskUserDialog from 'src/components/dialogs/AskUserDialog.vue';
import QuickStartGuideDialog from 'src/components/dialogs/QuickStartGuideDialog.vue';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import { RouterView } from 'vue-router';
import { useUiStore } from '../stores/ui';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useAutoSync } from 'src/composables/useAutoSync';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useQuickStartGuide } from 'src/composables/useQuickStartGuide';
import { useResponsiveLayout } from 'src/composables/useResponsiveLayout';
import { useOverlayCloseStack } from 'src/composables/useOverlayCloseStack';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import {
  useAskUserStore,
  type AskUserBatchPayload,
  type AskUserBatchResult,
  type AskUserPayload,
  type AskUserResult,
} from 'src/stores/ask-user';

const ui = useUiStore();
const { markAsReadByMessage } = useToastHistory();
const toast = useToastWithHistory();
const aiProcessingStore = useAIProcessingStore();
const askUserStore = useAskUserStore();
const { quickStartGuideVisible, dismissQuickStartGuide } = useQuickStartGuide();
const { isPhone, isTablet, isDesktop } = useResponsiveLayout();

const showPersistentSidebar = computed(() => isDesktop.value || isTablet.value);
const rightPanelOverlayStyle = computed(() => ({
  width: isPhone.value ? '100vw' : `min(92vw, ${ui.rightPanelWidth}px)`,
}));

const closeSideMenu = () => {
  ui.closeSideMenu();
};

const closeRightPanel = () => {
  ui.closeRightPanel();
};

useOverlayCloseStack({
  isOpen: computed(() => ui.sideMenuOpen),
  enabled: computed(() => !isDesktop.value),
  onClose: closeSideMenu,
});

useOverlayCloseStack({
  isOpen: computed(() => ui.rightPanelOpen),
  enabled: computed(() => !isDesktop.value),
  onClose: closeRightPanel,
});

// 注册全局 toast 函数，供静态方法使用
if (typeof window !== 'undefined') {
  (window as unknown as { __lunaToast?: typeof toast.add }).__lunaToast = toast.add.bind(toast);
}

// 注册全局 ask_user 桥接函数，供工具层使用
if (typeof window !== 'undefined') {
  (
    window as unknown as {
      __lunaAskUser?: (payload: AskUserPayload) => Promise<AskUserResult>;
      __lunaAskUserBatch?: (payload: AskUserBatchPayload) => Promise<AskUserBatchResult>;
    }
  ).__lunaAskUser = (payload: AskUserPayload) => askUserStore.ask(payload);
  (
    window as unknown as {
      __lunaAskUserBatch?: (payload: AskUserBatchPayload) => Promise<AskUserBatchResult>;
    }
  ).__lunaAskUserBatch = (payload: AskUserBatchPayload) => askUserStore.askBatch(payload);
}

// 跟踪之前的任务状态，用于检测状态变化
const previousTasks = ref<Map<string, AIProcessingTask>>(new Map());

// 监听 AI 任务状态变化
watch(
  () => aiProcessingStore.activeTasks,
  (newTasks, _oldTasks) => {
    // 收集本周期内取消的任务
    const cancelledTasks: AIProcessingTask[] = [];
    const errorTasks: AIProcessingTask[] = [];

    // 处理新添加的任务
    for (const task of newTasks) {
      const oldTask = previousTasks.value.get(task.id);

      // 如果任务状态发生变化
      if (oldTask && oldTask.status !== task.status) {
        // 不显示任务开始和完成的 toast，只显示错误和取消
        if (task.status === 'error') {
          errorTasks.push(task);
        } else if (task.status === 'cancelled') {
          cancelledTasks.push(task);
        }
      }

      // 更新任务记录
      previousTasks.value.set(task.id, { ...task });
    }

    // 处理错误任务（每个错误任务单独显示 toast）
    for (const task of errorTasks) {
      const taskTypeLabel = TASK_TYPE_LABELS[task.type] || task.type;
      const errorMessage = task.message || '未知错误';
      toast.add({
        severity: 'error',
        summary: 'AI 任务失败',
        detail: `${task.modelName} 执行${taskTypeLabel}任务时出错：${errorMessage}`,
        life: 5000,
      });
    }

    // 处理取消的任务
    if (cancelledTasks.length > 0) {
      // 分离助手任务和其他任务
      const assistantCancelled = cancelledTasks.filter((t) => t.type === 'assistant');
      const otherCancelled = cancelledTasks.filter((t) => t.type !== 'assistant');

      // 如果多个助手任务被取消，显示一个合并的 toast
      if (assistantCancelled.length > 1) {
        toast.add({
          severity: 'warn',
          summary: 'AI 任务已取消',
          detail: `已取消 ${assistantCancelled.length} 个助手任务`,
          life: 3000,
        });
      } else if (assistantCancelled.length === 1) {
        // 单个助手任务取消，显示单独的 toast
        const task = assistantCancelled[0];
        if (task) {
          const taskTypeLabel = TASK_TYPE_LABELS[task.type] || task.type;
          toast.add({
            severity: 'warn',
            summary: 'AI 任务已取消',
            detail: `${task.modelName} 的${taskTypeLabel}任务已取消`,
            life: 3000,
          });
        }
      }

      // 其他类型的任务取消，每个单独显示 toast
      for (const task of otherCancelled) {
        const taskTypeLabel = TASK_TYPE_LABELS[task.type] || task.type;
        toast.add({
          severity: 'warn',
          summary: 'AI 任务已取消',
          detail: `${task.modelName} 的${taskTypeLabel}任务已取消`,
          life: 3000,
        });
      }
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
const { setupAutoSync, stopAutoSync } = useAutoSync();

watch(
  () => ui.deviceType,
  (newType, oldType) => {
    if (newType === oldType) return;
    // 进入手机端时默认收起抽屉，避免遮挡内容
    if (newType === 'phone') {
      ui.closeSideMenu();
      ui.closeRightPanel();
    }
  },
);

onMounted(() => {
  setupAutoSync();
});

onUnmounted(() => {
  stopAutoSync();
});
</script>

<template>
  <div class="h-screen overflow-hidden bg-tsukuyomi-sky text-moon-100 flex flex-col">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden min-h-0 relative">
      <div
        v-if="isPhone && ui.sideMenuOpen"
        class="layout-overlay-mask z-40"
        @click="closeSideMenu"
      />
      <div
        v-if="!isDesktop && ui.rightPanelOpen"
        class="layout-overlay-mask z-40"
        @click="closeRightPanel"
      />

      <div
        v-if="showPersistentSidebar"
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

      <div
        v-if="isPhone"
        class="phone-sidebar-wrapper z-50"
        :class="{ 'phone-sidebar-open': ui.sideMenuOpen }"
        :inert="!ui.sideMenuOpen"
      >
        <AppSideMenu />
      </div>

      <main
        class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-night-900/60 backdrop-blur-xl"
      >
        <RouterView />
      </main>

      <div
        v-if="isDesktop"
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

      <div
        v-if="!isDesktop"
        class="overlay-right-panel z-50"
        :class="{ 'overlay-right-panel-open': ui.rightPanelOpen }"
        :style="rightPanelOverlayStyle"
        :inert="!ui.rightPanelOpen"
      >
        <AppRightPanel />
      </div>
    </div>

    <AppFooter />
  </div>

  <!-- Toast 组件 -->
  <Toast position="top-right" @close="handleToastClose" />
  <ConfirmDialog />

  <!-- ask_user 全屏问答对话框（全局挂载） -->
  <AskUserDialog />

  <!-- 首次启动快速开始引导 -->
  <QuickStartGuideDialog :visible="quickStartGuideVisible" @dismiss="dismissQuickStartGuide" />

  <!-- 冲突解决对话框 -->
</template>

<style scoped>
.sidebar-wrapper,
.right-panel-wrapper {
  transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
  height: 100%;
}

.layout-overlay-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
}

.phone-sidebar-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 16rem;
  max-width: 86vw;
  transform: translateX(-100%);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.phone-sidebar-open {
  transform: translateX(0);
}

.overlay-right-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  transform: translateX(100%);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.overlay-right-panel-open {
  transform: translateX(0);
}

main {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0; /* Required for flexbox overflow to work */
  height: 100%; /* Ensure main takes full height of flex container */
}
</style>
