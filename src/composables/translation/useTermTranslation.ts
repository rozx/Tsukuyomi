import { computed, ref } from 'vue';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useContextStore } from 'src/stores/context';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TermTranslationService } from 'src/services/ai';

/**
 * 可翻译输入控件共享的术语翻译逻辑。
 *
 * 抽离 TranslatableChips 与 TranslatableInput 两个组件里完全一致的：
 *  - 可用模型列表计算
 *  - translating / currentTaskId 状态
 *  - thinkingMessage 计算（读取当前任务的思考消息最后一行）
 *  - 默认模型解析 + 无模型提示
 *  - 调用 TermTranslationService.translate 时的 options 构建
 *  - 任务 ID 记录与 finally 清理
 *
 * 两个组件的输入预处理（数组 join vs 字符串 trim）与结果后处理（分隔符回推
 * vs 直接展示）保持在各自组件里；本 composable 只处理“中间这一段”共享流程。
 */
export function useTermTranslation() {
  const aiModelsStore = useAIModelsStore();
  const aiProcessingStore = useAIProcessingStore();
  const contextStore = useContextStore();
  const toast = useToastWithHistory();

  // 翻译状态
  const translating = ref(false);
  // 当前翻译任务 ID
  const currentTaskId = ref<string | null>(null);

  // 思考过程消息（只显示当前任务的）
  const thinkingMessage = computed(() => {
    if (!currentTaskId.value) return null;
    const task = aiProcessingStore.activeTasks.find((t) => t.id === currentTaskId.value);
    if (!task) return null;

    // 优先使用实际的思考消息
    if (task.thinkingMessage && task.thinkingMessage.trim()) {
      // 获取最后一行
      const lines = task.thinkingMessage.split('\n').filter((line) => line.trim());
      return lines.length > 0 ? lines[lines.length - 1] : task.thinkingMessage;
    }

    return task.message || `${task.modelName} 正在处理...`;
  });

  // 获取所有可用的术语翻译模型
  const availableTranslationModels = computed(() => {
    return aiModelsStore.models.filter(
      (model) => model.enabled && model.isDefault.termsTranslation?.enabled,
    );
  });

  /**
   * 执行一次术语翻译请求。
   *
   * 封装共享流程：
   *  1. 设置 translating=true
   *  2. 解析默认模型，若缺失则 toast 报错并返回 null
   *  3. 构建 options（含 aiProcessingStore 绑定 + 可选 bookId/chapterId）
   *  4. 调用 TermTranslationService.translate 并记录 taskId
   *  5. catch 仅 console.error（错误 toast 交由 MainLayout 全局处理）
   *  6. finally 清理 translating / currentTaskId
   *
   * @returns 翻译后的纯文本；任何失败路径（无模型/抛错）统一返回 null
   */
  const runTermTranslation = async (originalText: string): Promise<string | null> => {
    translating.value = true;

    // 获取默认的术语翻译模型
    const selectedModel = aiModelsStore.getDefaultModelForTask('termsTranslation');

    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '翻译失败',
        detail: '未找到可用的术语翻译模型，请在设置中配置',
        life: 3000,
      });
      translating.value = false;
      return null;
    }

    try {
      // 获取当前上下文
      const context = contextStore.getContext;

      // 构建选项对象，只在有值时才传递 bookId 和 chapterId
      const options: Parameters<typeof TermTranslationService.translate>[2] = {
        taskType: 'termsTranslation',
        aiProcessingStore: {
          addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
          updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
          appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
          appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
          removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
          activeTasks: aiProcessingStore.activeTasks,
        },
      };

      // 只在有值时才添加 bookId 和 chapterId
      if (context.currentBookId) {
        options.bookId = context.currentBookId;
      }
      if (context.currentChapterId) {
        options.chapterId = context.currentChapterId;
      }

      // 使用翻译服务进行翻译，服务会自动管理任务
      const result = await TermTranslationService.translate(originalText, selectedModel, options);

      // 保存任务 ID 以便跟踪
      if (result.taskId) {
        currentTaskId.value = result.taskId;
      }

      return result.text;
    } catch (error) {
      console.error('翻译失败:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
      return null;
    } finally {
      translating.value = false;
      // 任务移除已由服务管理，这里只需要清理本地引用
      currentTaskId.value = null;
    }
  };

  return {
    translating,
    currentTaskId,
    thinkingMessage,
    availableTranslationModels,
    runTermTranslation,
    /** 便于组件继续复用（例如对话框内成功 toast） */
    toast,
  };
}
