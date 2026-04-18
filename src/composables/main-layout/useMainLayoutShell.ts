import { onMounted, onUnmounted, watch } from 'vue';
import { useUiStore } from 'src/stores/ui';
import { useToastHistory, useToastWithHistory } from 'src/composables/useToastHistory';
import { useAutoSync } from 'src/composables/useAutoSync';
import { useQuickStartGuide } from 'src/composables/useQuickStartGuide';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import {
  useAskUserStore,
  type AskUserBatchPayload,
  type AskUserBatchResult,
  type AskUserPayload,
  type AskUserResult,
} from 'src/stores/ask-user';

/**
 * MainLayout 壳层业务逻辑 composable。
 *
 * 一次性副作用（auto-sync 注册、全局 window 桥接、AI 任务侦听、embedding warmup、
 * device-type 变化时的面板关闭）必须只在应用启动时执行一次。因此本 composable
 * 仅由 MainLayout 的**分派器**调用；各变体（Desktop / Tablet / Mobile）不应
 * 直接调用本 composable。变体需要读取的 ui 状态通过各自的 `useUiStore()` 获取
 * 即可（Pinia 全局单例，不存在重复订阅问题）。
 *
 * 返回仅用于在模板中渲染全局 dialog 的少量状态 / 事件处理。
 */
export function useMainLayoutShell() {
  const ui = useUiStore();
  const aiProcessingStore = useAIProcessingStore();
  const askUserStore = useAskUserStore();
  const { markAsReadByMessage } = useToastHistory();
  const toast = useToastWithHistory();
  const { quickStartGuideVisible, dismissQuickStartGuide } = useQuickStartGuide();

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
  // 使用非响应式 Map：这个 Map 只用于存储上一轮快照，从不被模板/计算属性读取，
  // 设为 ref 会让 Vue 在每次 .set()/.delete() 时做无意义的响应式通知。
  const previousTasks = new Map<string, AIProcessingTask>();

  // 监听 AI 任务状态变化
  // 性能优化：之前使用 `{ deep: true }`，会在每次 updateTask() 调用（流式响应每帧都可能触发）
  // 时对整个 activeTasks 数组做深度遍历。使用轻量签名字符串（id:status:type）替代：
  // 仅在任务数量、id、状态或类型真正变化时触发回调，流式文本长度变化不会触发。
  watch(
    () => aiProcessingStore.activeTasks.map((t) => `${t.id}:${t.status}:${t.type}`).join(','),
    (_newKey, _oldKey) => {
      const newTasks = aiProcessingStore.activeTasks;
      // 收集本周期内取消的任务
      const cancelledTasks: AIProcessingTask[] = [];
      const errorTasks: AIProcessingTask[] = [];

      // 处理新添加的任务
      for (const task of newTasks) {
        const oldTask = previousTasks.get(task.id);

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
        previousTasks.set(task.id, { ...task });
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
      for (const [taskId] of previousTasks) {
        if (!currentTaskIds.has(taskId)) {
          previousTasks.delete(taskId);
        }
      }
    },
  );

  // 处理 Toast 关闭事件
  const handleToastClose = (event: any) => {
    if (event?.message) {
      void markAsReadByMessage(event.message);
    }
  };

  // 自动同步
  const { setupAutoSync, stopAutoSync } = useAutoSync();

  // 断点切换：进入手机端时默认收起抽屉，避免遮挡内容
  watch(
    () => ui.deviceType,
    (newType, oldType) => {
      if (newType === oldType) return;
      if (newType === 'phone') {
        ui.closeSideMenu();
        ui.closeRightPanel();
      }
    },
  );

  onMounted(async () => {
    setupAutoSync();

    // 语义检索启用且模型已被缓存时，应用启动后自动预热（复用浏览器已缓存的模型文件，无需重新下载）
    // 注意：首次安装/首次启用时不会自动触发，需用户在设置页主动下载，避免意外产生 ~195MB 带宽消耗
    // 检测路径双保险:
    //   1. settings.embeddingModelCached 标记（App.vue 全局监听器负责维护）
    //   2. 浏览器 Cache Storage 实测命中（兼容旧版本 / 标记缺失场景）
    const { useSettingsStore } = await import('src/stores/settings');
    const settings = useSettingsStore();
    if (!settings.isLoaded) {
      await settings.loadSettings();
    }
    if (settings.settings.memoryInjection?.enableSemantic !== false) {
      const { EmbeddingService } = await import('src/services/embedding-service');
      if (!EmbeddingService.isReady()) {
        const flagSet = settings.settings.memoryInjection?.embeddingModelCached === true;
        const cacheHit = flagSet ? true : await EmbeddingService.isModelCachedInBrowser();
        if (cacheHit) {
          void EmbeddingService.warmup();
        }
      }
    }
  });

  onUnmounted(() => {
    stopAutoSync();
  });

  return {
    handleToastClose,
    quickStartGuideVisible,
    dismissQuickStartGuide,
  };
}
