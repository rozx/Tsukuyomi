<script setup lang="ts">
/**
 * AI 思考过程面板的内容部分。桌面 Popover 和手机 MobileBottomSheet 共享同一份。
 *
 * `active` prop 由父面板传入（桌面跟 Popover show/hide，手机跟 sheet visible）。
 * 面板关闭时 watch 会短路，避免流式思考期间做无意义的滚动计算。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import { useConfirm } from 'primevue/useconfirm';
import ConfirmDialog from 'primevue/confirmdialog';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useUiStore } from 'src/stores/ui';
import ThinkingDetailDialog from './ThinkingDetailDialog.vue';
import ThinkingTaskCard from './ThinkingTaskCard.vue';
import ThinkingReviewedCard from './ThinkingReviewedCard.vue';

const props = defineProps<{
  /** 面板是否展开 —— 关闭时 watch 短路，避免无意义的 DOM 操作 */
  active: boolean;
  /** 列表容器的 max-height（桌面 500px，手机端给更大值如 58dvh） */
  listMaxHeight?: string;
}>();

const aiProcessing = useAIProcessingStore();
const confirm = useConfirm();
const uiStore = useUiStore();

const isPhone = computed(() => uiStore.deviceType === 'phone');
const hasHeaderActions = computed(
  () =>
    aiProcessing.reviewedTasksList.length > 0 || aiProcessing.allTasksList.length > 0,
);
// 头部是否渲染、以及手机端「仅动作」变体的 class，收进 computed 压低模板圈复杂度
const showHeader = computed(() => !isPhone.value || hasHeaderActions.value);
const headerClass = computed(() => ({
  'thinking-header--mobile-actions-only': isPhone.value,
}));

const now = ref(Date.now());
let nowTimer: number | null = null;

onMounted(async () => {
  await aiProcessing.loadThinkingProcesses();
  nowTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

const stopTask = async (taskId: string) => {
  await aiProcessing.stopTask(taskId);
};

const clearAllTasks = () => {
  confirm.require({
    group: 'thinking-process',
    message: '确定要清空所有思考过程记录吗？此操作不可恢复。',
    header: '确认清空',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: '取消', severity: 'secondary' },
    acceptProps: { label: '清空', severity: 'danger' },
    accept: async () => {
      await aiProcessing.clearAllTasks();
    },
  });
};

const thinkingMessageRefs = ref<Map<string, HTMLElement>>(new Map());
const userScrollingStates = ref<Map<string, boolean>>(new Map());
const pendingScrollTasks = ref<Set<string>>(new Set());
let scrollDebounceTimer: number | null = null;
let rafId: number | null = null;
const scrollHandlers = ref<Map<string, (event: Event) => void>>(new Map());

const setThinkingMessageRef = (taskId: string, el: HTMLElement | null) => {
  const oldElement = thinkingMessageRefs.value.get(taskId);
  const oldHandler = scrollHandlers.value.get(taskId);
  if (oldElement && oldHandler) {
    oldElement.removeEventListener('scroll', oldHandler);
    scrollHandlers.value.delete(taskId);
  }

  if (el) {
    thinkingMessageRefs.value.set(taskId, el);
    userScrollingStates.value.set(taskId, false);

    const scrollHandler = () => {
      const isScrolling = el.scrollHeight - el.scrollTop - el.clientHeight > 50;
      userScrollingStates.value.set(taskId, isScrolling);
    };

    scrollHandlers.value.set(taskId, scrollHandler);
    el.addEventListener('scroll', scrollHandler, { passive: true });
  } else {
    thinkingMessageRefs.value.delete(taskId);
    userScrollingStates.value.delete(taskId);
  }
};

const performBatchScroll = () => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    void nextTick(() => {
      pendingScrollTasks.value.forEach((taskId) => {
        const element = thinkingMessageRefs.value.get(taskId);
        if (!element) return;

        const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
        const isAtBottom = distanceFromBottom <= 50;

        if (isAtBottom) userScrollingStates.value.set(taskId, false);

        const isUserScrolling = userScrollingStates.value.get(taskId);
        if (!isUserScrolling) {
          element.scrollTo({
            top: element.scrollHeight,
            behavior: 'instant',
          });
        }
      });

      pendingScrollTasks.value.clear();
      rafId = null;
    });
  });
};

const scrollThinkingMessageToBottom = (taskId: string) => {
  pendingScrollTasks.value.add(taskId);
  if (scrollDebounceTimer !== null) clearTimeout(scrollDebounceTimer);
  scrollDebounceTimer = window.setTimeout(() => {
    performBatchScroll();
    scrollDebounceTimer = null;
  }, 50);
};

const thinkingMessageLengths = ref<Map<string, number>>(new Map());
let watchDebounceTimer: number | null = null;

watch(
  () =>
    aiProcessing.activeTasks.map((task) => ({
      id: task.id,
      thinkingMessageLength: task.thinkingMessage?.length || 0,
      status: task.status,
    })),
  () => {
    // 面板关闭时不执行任何滚动相关工作
    if (!props.active) return;

    if (watchDebounceTimer !== null) clearTimeout(watchDebounceTimer);

    watchDebounceTimer = window.setTimeout(() => {
      const scheduleUpdate = () => {
        const activeTasks = aiProcessing.activeTasksList;

        const currentTaskStatusMap = new Map<
          string,
          'thinking' | 'processing' | 'end' | 'error' | 'cancelled'
        >();
        aiProcessing.activeTasks.forEach((task) => {
          currentTaskStatusMap.set(task.id, task.status);
        });

        activeTasks.forEach((task) => {
          if (
            task.thinkingMessage &&
            (task.status === 'thinking' || task.status === 'processing')
          ) {
            const oldLength = thinkingMessageLengths.value.get(task.id) || 0;
            const newLength = task.thinkingMessage.length;
            if (newLength > oldLength) {
              thinkingMessageLengths.value.set(task.id, newLength);
              scrollThinkingMessageToBottom(task.id);
            }
          }
        });

        const taskIdsToCleanup: string[] = [];
        thinkingMessageLengths.value.forEach((_, taskId) => {
          const currentStatus = currentTaskStatusMap.get(taskId);
          if (!currentStatus || (currentStatus !== 'thinking' && currentStatus !== 'processing')) {
            taskIdsToCleanup.push(taskId);
          }
        });

        taskIdsToCleanup.forEach((taskId) => {
          thinkingMessageLengths.value.delete(taskId);
        });
      };

      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(scheduleUpdate, { timeout: 50 });
      } else {
        setTimeout(scheduleUpdate, 0);
      }

      watchDebounceTimer = null;
    }, 100);
  },
  { flush: 'post' },
);

const detailVisible = ref(false);
const detailTask = ref<AIProcessingTask | null>(null);

const openDetail = (task: AIProcessingTask) => {
  detailTask.value = task;
  detailVisible.value = true;
};

const handleDetailVisibilityChange = (value: boolean) => {
  detailVisible.value = value;
};

const listContainerStyle = () => ({
  maxHeight: props.listMaxHeight ?? '500px',
});

// v-memo 数组里原先带三元与 ||，搬到函数里求值，避免计入模板圈复杂度
const activeTaskMemo = (task: AIProcessingTask): unknown[] => [
  task.id,
  task.status,
  task.message,
  task.thinkingMessage?.length,
  task.status === 'thinking' || task.status === 'processing' ? Math.floor(now.value / 1000) : 0,
];

const reviewedTaskMemo = (task: AIProcessingTask): unknown[] => [
  task.id,
  task.status,
  task.message,
];

onUnmounted(() => {
  if (nowTimer !== null) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
  if (scrollDebounceTimer !== null) {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = null;
  }
  if (watchDebounceTimer !== null) {
    clearTimeout(watchDebounceTimer);
    watchDebounceTimer = null;
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  scrollHandlers.value.forEach((handler, taskId) => {
    const element = thinkingMessageRefs.value.get(taskId);
    if (element) element.removeEventListener('scroll', handler);
  });

  scrollHandlers.value.clear();
  thinkingMessageRefs.value.clear();
  userScrollingStates.value.clear();
  pendingScrollTasks.value.clear();
  thinkingMessageLengths.value.clear();
});
</script>

<template>
  <div class="flex flex-col thinking-body">
    <div
      v-if="showHeader"
      class="thinking-header flex items-center justify-between mb-4 pb-3 border-b border-white/10"
      :class="headerClass"
    >
      <h3 v-if="!isPhone" class="text-lg font-semibold text-moon/90">AI 思考过程</h3>
      <div class="thinking-header-actions flex items-center gap-2">
        <Button
          v-if="aiProcessing.reviewedTasksList.length > 0"
          icon="pi pi-trash"
          class="p-button-text p-button-danger p-button-sm"
          title="清空已完成"
          @click="aiProcessing.clearReviewedTasks()"
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

    <div class="thinking-list overflow-auto min-h-0 space-y-3" :style="listContainerStyle()">
      <div v-if="aiProcessing.allTasksList.length === 0" class="text-center py-8">
        <i class="pi pi-check-circle text-4xl text-moon/40 mb-4" />
        <p class="text-moon/60">当前没有思考过程记录</p>
      </div>

      <ThinkingTaskCard
        v-for="task in aiProcessing.activeTasksList"
        :key="task.id"
        v-memo="activeTaskMemo(task)"
        :task="task"
        :now-ms="now"
        :on-open-detail="openDetail"
        :on-stop-task="stopTask"
        :set-thinking-message-ref="setThinkingMessageRef"
      />

      <div v-if="aiProcessing.reviewedTasksList.length > 0" class="mt-6">
        <h4 class="text-sm font-medium text-moon/70 mb-3">已完成的任务</h4>
        <div class="space-y-2">
          <ThinkingReviewedCard
            v-for="task in aiProcessing.reviewedTasksList.slice(0, 10)"
            :key="task.id"
            v-memo="reviewedTaskMemo(task)"
            :task="task"
            :now-ms="now"
            :on-open-detail="openDetail"
          />
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog group="thinking-process" />
  <ThinkingDetailDialog
    :visible="detailVisible"
    :task="detailTask"
    @update:visible="handleDetailVisibilityChange"
  />
</template>

<style scoped>
/* 优化滚动容器的性能 */
.thinking-body :deep(.overflow-y-auto) {
  will-change: scroll-position;
  contain: content;
  scroll-behavior: auto;
  transform: translateZ(0);
}

@media (max-width: 640px) {
  .thinking-header {
    margin-bottom: 0.75rem;
    padding-bottom: 0.65rem;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .thinking-header--mobile-actions-only {
    justify-content: flex-end;
    padding-bottom: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .thinking-header-actions {
    align-self: flex-end;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.25rem;
  }
}
/* 注：进行中卡片 / 已完成卡片的 @media 移动端规则已迁移到对应子组件
 * (ThinkingTaskCard.vue / ThinkingReviewedCard.vue) —— scoped 样式无法穿透到子组件内部嵌套元素。 */
</style>
