import type { AIModel } from 'src/services/ai/types/ai-model';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { TASK_TYPE_LABELS, type TaskType } from './task-types';

/**
 * 为特定任务获取 AI 模型
 * 优先使用书籍特定任务模型，其次是书籍默认模型，最后是全局默认任务模型
 * @param bookId 书籍 ID
 * @param taskType 任务类型
 * @returns AI 模型
 */
export async function getAIModelForTask(
  bookId: string,
  taskType: 'translation' | 'polish' | 'proofreading' | 'termsTranslation',
): Promise<AIModel> {
  const booksStore = useBooksStore();
  const aiModelsStore = useAIModelsStore();

  const novel = booksStore.books.find((b) => b.id === bookId);
  if (!novel) {
    // 这种情况下通常应该已经加载了，但为了健壮性，这里不直接抛错，而是尝试获取全局默认
    console.warn(`[AITaskHelper] 找不到 ID 为 ${bookId} 的书籍，将使用全局默认模型`);
  }

  // 1. 映射任务类型到存储的任务类型
  // Novel 模型和 AIModel 默认任务配置中，润色(polish)和校对(proofreading)统一使用 proofreading 配置
  const storeTaskType = taskType === 'polish' ? 'proofreading' : taskType;

  // 2. 尝试从小说配置中获取
  let model: AIModel | undefined = novel?.defaultAIModel?.[storeTaskType];

  // 3. 如果没有特定任务模型，尝试获取全局默认
  if (!model) {
    if (!aiModelsStore.isLoaded) {
      await aiModelsStore.loadModels();
    }
    model = aiModelsStore.getDefaultModelForTask(storeTaskType);
  }

  if (!model || !model.enabled) {
    const label =
      taskType === 'termsTranslation' ? '术语/摘要' : TASK_TYPE_LABELS[taskType as TaskType];
    throw new Error(`未配置“${label}”模型，请在设置中配置。`);
  }

  return model;
}
