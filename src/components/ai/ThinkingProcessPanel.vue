<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
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
  end: '已完成',
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

// 用于追踪每个任务的用户滚动状态
const userScrollingStates = ref<Map<string, boolean>>(new Map());

// 存储待处理的滚动任务（使用 Set 去重）
const pendingScrollTasks = ref<Set<string>>(new Set());

// 防抖定时器
let scrollDebounceTimer: number | null = null;

// 使用 requestAnimationFrame 优化滚动操作
let rafId: number | null = null;

// 存储滚动事件监听器（用于清理）
const scrollHandlers = ref<Map<string, (event: Event) => void>>(new Map());

// 设置思考消息容器的 ref
const setThinkingMessageRef = (taskId: string, el: HTMLElement | null) => {
  // 清理旧的监听器
  const oldElement = thinkingMessageRefs.value.get(taskId);
  const oldHandler = scrollHandlers.value.get(taskId);
  if (oldElement && oldHandler) {
    oldElement.removeEventListener('scroll', oldHandler);
    scrollHandlers.value.delete(taskId);
  }

  if (el) {
    thinkingMessageRefs.value.set(taskId, el);
    userScrollingStates.value.set(taskId, false);

    // 创建滚动处理函数
    const scrollHandler = () => {
      // 检测用户是否在手动滚动（距离底部超过 50px）
      const isScrolling = el.scrollHeight - el.scrollTop - el.clientHeight > 50;
      userScrollingStates.value.set(taskId, isScrolling);
    };

    // 保存监听器引用并添加
    scrollHandlers.value.set(taskId, scrollHandler);
    el.addEventListener('scroll', scrollHandler, { passive: true });
  } else {
    thinkingMessageRefs.value.delete(taskId);
    userScrollingStates.value.delete(taskId);
  }
};

// 批量执行滚动操作（使用 requestAnimationFrame 优化）
const performBatchScroll = () => {
  // 取消之前的 raf
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
  }

  rafId = requestAnimationFrame(() => {
    void nextTick(() => {
      pendingScrollTasks.value.forEach((taskId) => {
        const element = thinkingMessageRefs.value.get(taskId);
        if (!element) return;

        // 检查用户当前是否在底部（距离底部 50px 以内）
        const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
        const isAtBottom = distanceFromBottom <= 50;

        // 如果用户已经回到底部，重置滚动状态
        if (isAtBottom) {
          userScrollingStates.value.set(taskId, false);
        }

        const isUserScrolling = userScrollingStates.value.get(taskId);

        // 只有当用户不在手动滚动时才自动滚动
        if (!isUserScrolling) {
          // 使用平滑滚动优化性能
          element.scrollTo({
            top: element.scrollHeight,
            behavior: 'instant', // 使用 instant 避免动画开销
          });
        }
      });

      // 清空待处理的任务
      pendingScrollTasks.value.clear();
      rafId = null;
    });
  });
};

// 滚动到思考消息底部（防抖 + 批处理）
// 优化：增加防抖时间，减少更新频率
const scrollThinkingMessageToBottom = (taskId: string) => {
  // 将任务添加到待处理集合
  pendingScrollTasks.value.add(taskId);

  // 清除之前的定时器
  if (scrollDebounceTimer !== null) {
    clearTimeout(scrollDebounceTimer);
  }

  // 使用防抖，50ms 减少更新频率，避免频繁滚动导致页面卡顿
  scrollDebounceTimer = window.setTimeout(() => {
    performBatchScroll();
    scrollDebounceTimer = null;
  }, 50);
};

// 使用 Map 存储每个任务的思考消息长度，用于检测变化
const thinkingMessageLengths = ref<Map<string, number>>(new Map());

// 防抖定时器，用于批量处理 watch 回调
let watchDebounceTimer: number | null = null;

// 监听所有任务的思考消息变化，自动滚动到底部
// 优化：直接监听 activeTasks，确保能检测到 thinkingMessage 的变化
// 使用防抖机制，减少 watch 回调的执行频率
watch(
  () => aiProcessing.activeTasks.map((task) => ({
    id: task.id,
    thinkingMessageLength: task.thinkingMessage?.length || 0,
    status: task.status,
  })),
  (newTasks, oldTasks) => {
    // 清除之前的定时器
    if (watchDebounceTimer !== null) {
      clearTimeout(watchDebounceTimer);
    }
    
    // 使用防抖，100ms 批量处理一次
    // store 层面已经有 300ms 节流，这里使用较短的防抖时间确保及时响应
    watchDebounceTimer = window.setTimeout(() => {
      // 使用 requestIdleCallback 或 setTimeout 延迟执行，避免阻塞主线程
      const scheduleUpdate = () => {
        // 获取当前活动的任务列表（基于最新状态，不依赖过时的 oldTasks）
        const activeTasks = aiProcessing.activeTasksList;
        
        // 获取当前所有任务的状态映射（用于清理逻辑）
        const currentTaskStatusMap = new Map<
          string,
          'thinking' | 'processing' | 'end' | 'error' | 'cancelled'
        >();
        aiProcessing.activeTasks.forEach((task) => {
          currentTaskStatusMap.set(task.id, task.status);
        });
        
        // 当任何任务的思考消息更新时，滚动对应的容器到底部
        activeTasks.forEach((task) => {
          if (
            task.thinkingMessage &&
            (task.status === 'thinking' || task.status === 'processing')
          ) {
            // 检查消息是否真的变化了（长度增加表示有新内容）
            const oldLength = thinkingMessageLengths.value.get(task.id) || 0;
            const newLength = task.thinkingMessage.length;
            
            if (newLength > oldLength) {
              // 更新长度记录
              thinkingMessageLengths.value.set(task.id, newLength);
              // 触发滚动（已包含防抖）
              scrollThinkingMessageToBottom(task.id);
            }
          }
        });
        
        // 清理已完成任务的长度记录
        // 基于当前状态进行清理，而不是依赖过时的 oldTasks
        // 遍历所有已记录的任务 ID，检查它们是否仍然处于活动状态
        const taskIdsToCleanup: string[] = [];
        thinkingMessageLengths.value.forEach((_, taskId) => {
          const currentStatus = currentTaskStatusMap.get(taskId);
          // 如果任务不存在于当前任务列表中，或者状态不是 'thinking'/'processing'，则清理
          if (!currentStatus || (currentStatus !== 'thinking' && currentStatus !== 'processing')) {
            taskIdsToCleanup.push(taskId);
          }
        });
        
        // 执行清理
        taskIdsToCleanup.forEach((taskId) => {
          thinkingMessageLengths.value.delete(taskId);
        });
      };
      
      // 使用 requestIdleCallback 延迟执行，如果浏览器不支持则使用 setTimeout
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(scheduleUpdate, { timeout: 50 });
      } else {
        setTimeout(scheduleUpdate, 0);
      }
      
      watchDebounceTimer = null;
    }, 100);
  },
  { flush: 'post' }, // 在 DOM 更新后执行
);

// Popover ref
const popoverRef = ref<InstanceType<typeof Popover> | null>(null);

// 暴露方法供父组件调用
defineExpose({
  toggle: (event: Event) => {
    popoverRef.value?.toggle(event);
  },
});

// 组件卸载时清理资源
onUnmounted(() => {
  // 清理定时器
  if (scrollDebounceTimer !== null) {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = null;
  }
  
  // 清理 watch 防抖定时器
  if (watchDebounceTimer !== null) {
    clearTimeout(watchDebounceTimer);
    watchDebounceTimer = null;
  }

  // 清理 RAF
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  // 清理所有事件监听器
  scrollHandlers.value.forEach((handler, taskId) => {
    const element = thinkingMessageRefs.value.get(taskId);
    if (element) {
      element.removeEventListener('scroll', handler);
    }
  });

  // 清空所有引用
  scrollHandlers.value.clear();
  thinkingMessageRefs.value.clear();
  userScrollingStates.value.clear();
  pendingScrollTasks.value.clear();
  thinkingMessageLengths.value.clear();
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

      <div class="flex-1 overflow-auto min-h-0 space-y-3" style="max-height: 500px">
        <div v-if="aiProcessing.allTasksList.length === 0" class="text-center py-8">
          <i class="pi pi-check-circle text-4xl text-moon/40 mb-4" />
          <p class="text-moon/60">当前没有思考过程记录</p>
        </div>

        <!-- 正在进行的任务 -->
        <div
          v-for="task in aiProcessing.activeTasksList"
          :key="task.id"
          v-memo="[task.id, task.status, task.message, task.thinkingMessage?.length]"
          class="p-4 rounded-lg border border-white/10 bg-white/5"
        >
          <div class="flex items-start justify-between mb-2 gap-2">
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <i
                class="pi flex-shrink-0"
                :class="{
                  'pi-spin pi-spinner text-primary':
                    task.status === 'thinking' || task.status === 'processing',
                  'pi-check-circle text-green-500': task.status === 'end',
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

          <p v-if="task.message" class="text-sm text-moon/70 mt-2 break-words">
            {{ task.message }}
          </p>

          <!-- 显示思考消息 -->
          <div
            v-if="task.thinkingMessage && task.thinkingMessage.trim()"
            class="mt-2 p-2 rounded bg-white/3 border border-white/5"
          >
            <p class="text-xs text-moon/50 mb-1">思考过程：</p>
            <p
              :ref="(el) => setThinkingMessageRef(task.id, el as HTMLElement)"
              class="text-xs text-moon/70 whitespace-pre-wrap break-words max-h-32 overflow-y-auto"
              style="word-break: break-all; overflow-wrap: anywhere"
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

        <!-- 已复核的任务 -->
        <div v-if="aiProcessing.reviewedTasksList.length > 0" class="mt-6">
          <h4 class="text-sm font-medium text-moon/70 mb-3">已完成的任务</h4>
          <div class="space-y-2">
            <div
              v-for="task in aiProcessing.reviewedTasksList.slice(0, 10)"
              :key="task.id"
              v-memo="[task.id, task.status, task.message]"
              class="p-3 rounded-lg border border-white/5 bg-white/2"
            >
              <div class="flex items-start justify-between mb-2 gap-2">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <i
                    class="pi text-sm flex-shrink-0"
                    :class="{
                      'pi-check-circle text-green-500': task.status === 'end',
                      'pi-times-circle text-red-500': task.status === 'error',
                      'pi-ban text-orange-500': task.status === 'cancelled',
                    }"
                  />
                  <span class="text-sm text-moon/70 truncate">{{ task.modelName }}</span>
                  <span
                    class="text-xs px-1.5 py-0.5 rounded bg-white/5 text-moon/50 flex-shrink-0"
                    >{{ TASK_TYPE_LABELS[task.type] || task.type }}</span
                  >
                </div>
                <span class="text-xs text-moon/50 flex-shrink-0">{{
                  formatDuration(task.startTime, task.endTime)
                }}</span>
              </div>
              <p v-if="task.message" class="text-xs text-moon/60 mb-2 break-words">
                {{ task.message }}
              </p>
              <!-- 显示思考消息（如果有） -->
              <div
                v-if="task.thinkingMessage && task.thinkingMessage.trim()"
                class="mt-2 p-2 rounded bg-white/3 border border-white/5"
              >
                <p class="text-xs text-moon/50 mb-1">思考过程：</p>
                <p
                  class="text-xs text-moon/70 whitespace-pre-wrap break-words max-h-24 overflow-y-auto"
                  style="word-break: break-all; overflow-wrap: anywhere"
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

/* 优化滚动容器的性能 */
.thinking-popover :deep(.overflow-y-auto) {
  /* 启用硬件加速 */
  will-change: scroll-position;
  /* 限制重排范围 */
  contain: content;
  /* 平滑滚动 */
  scroll-behavior: auto;
  /* 减少重绘 */
  transform: translateZ(0);
}
</style>
