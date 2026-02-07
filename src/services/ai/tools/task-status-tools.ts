import type { ToolDefinition, ToolContext } from './types';
import type {
  TaskType,
  TaskStatus,
  AIProcessingStore,
} from 'src/services/ai/tasks/utils/task-types';

const VALID_STATUSES: TaskStatus[] = ['planning', 'working', 'review', 'end'];

interface StateTransitionRules {
  [key: string]: TaskStatus[];
}

const TRANSITION_RULES: Record<TaskType, StateTransitionRules> = {
  translation: {
    planning: ['working'],
    working: ['review'],
    review: ['working', 'end'],
    end: [],
  },
  polish: {
    planning: ['working'],
    working: ['end'],
    end: [],
  },
  proofreading: {
    planning: ['working'],
    working: ['end'],
    end: [],
  },
  chapter_summary: {
    planning: ['working'],
    working: ['end'],
    end: [],
  },
};

/**
 * 验证状态值是否有效
 */
function isValidStatus(status: string): status is TaskStatus {
  return VALID_STATUSES.includes(status as TaskStatus);
}

/**
 * 验证状态转换是否有效
 */
function isValidTransition(
  taskType: TaskType,
  currentStatus: TaskStatus | undefined,
  newStatus: TaskStatus,
): { valid: boolean; error?: string } {
  // 如果是首次状态更新，必须是 planning
  if (!currentStatus) {
    if (newStatus !== 'planning') {
      return {
        valid: false,
        error: '初始状态必须是 planning',
      };
    }
    return { valid: true };
  }

  const rules = TRANSITION_RULES[taskType];
  if (!rules) {
    return {
      valid: false,
      error: `未知的任务类型: ${taskType}`,
    };
  }

  const allowedTransitions = rules[currentStatus];
  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `无效的状态转换: ${currentStatus} → ${newStatus}`,
    };
  }

  return { valid: true };
}

/**
 * 获取任务的当前状态
 */
function getTaskCurrentStatus(
  aiProcessingStore: AIProcessingStore | undefined,
  taskId: string,
): TaskStatus | undefined {
  if (!aiProcessingStore) {
    return undefined;
  }

  const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
  const status = task?.workflowStatus;

  // 验证状态值有效性
  if (status !== undefined && !isValidStatus(status)) {
    console.warn(`[getTaskCurrentStatus] 无效的状态值: ${String(status)}，任务ID: ${taskId}`);
    return undefined;
  }

  return status;
}

/**
 * 更新任务状态
 */
async function updateTaskStatus(
  aiProcessingStore: AIProcessingStore | undefined,
  taskId: string,
  newStatus: TaskStatus,
): Promise<void> {
  if (!aiProcessingStore) {
    throw new Error('AI 处理 Store 未初始化');
  }

  await aiProcessingStore.updateTask(taskId, {
    workflowStatus: newStatus,
    ...(newStatus === 'end' ? { status: 'end' } : {}),
  });
}

export const taskStatusTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_task_status',
        description:
          '更新当前 AI 任务的状态。使用此工具来报告任务进展：planning(规划中) → working(执行中) → review(复核中) → end(完成)。注意：翻译任务支持 review → working 返回修改，润色/校对任务不支持 review 状态。',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['planning', 'working', 'review', 'end'],
              description:
                '新的任务状态。planning: 正在规划；working: 正在执行翻译/润色/校对；review: 正在复核（仅翻译任务可用）；end: 任务完成',
            },
            reason: {
              type: 'string',
              description: '状态变更的原因（可选）',
            },
          },
          required: ['status'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { taskId, onAction } = context;
      const { status, reason: _reason } = args as { status: string; reason?: string };

      // 验证状态值
      if (!isValidStatus(status)) {
        return JSON.stringify({
          success: false,
          error: `无效的状态值: "${status}"。有效的状态值为：${VALID_STATUSES.join('、')}`,
        });
      }

      // 获取 AI 处理 Store（由服务层注入）
      // 限制：当前工具只能在提供 aiProcessingStore 的调用链中使用（已在文档记录）
      const aiProcessingStore = context.aiProcessingStore;

      if (!taskId) {
        return JSON.stringify({
          success: false,
          error: '未提供任务 ID',
        });
      }

      if (!aiProcessingStore) {
        return JSON.stringify({
          success: false,
          error: 'AI 处理 Store 未初始化',
        });
      }

      // 获取当前任务信息以确定任务类型
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      if (!task) {
        return JSON.stringify({
          success: false,
          error: `任务不存在: ${taskId}`,
        });
      }

      const taskType = task.type as TaskType;

      // 验证状态转换
      const currentStatus = getTaskCurrentStatus(aiProcessingStore, taskId);
      const validation = isValidTransition(taskType, currentStatus, status);

      if (!validation.valid) {
        return JSON.stringify({
          success: false,
          error: validation.error,
        });
      }

      // 特殊检查：当翻译任务状态变更为 review 时，进行完整性检查
      if (taskType === 'translation' && status === 'review') {
        const chapterId = task.chapterId;
        const bookId = task.bookId || context.bookId;

        if (!chapterId || !bookId) {
          // 如果没有关联章节，可能是全书任务或其他类型，跳过检查或报错
          // 这里选择宽容处理，或者记录警告
        } else {
          try {
            // 延迟导入以避免循环依赖
            const { BookService } = await import('src/services/book-service');
            const { ChapterService } = await import('src/services/chapter-service');
            const { ChapterContentService } = await import('src/services/chapter-content-service');

            const book = await BookService.getBookById(bookId);
            if (book) {
              const chapterInfo = ChapterService.findChapterById(book, chapterId);
              if (chapterInfo) {
                const { chapter } = chapterInfo;

                // 检查 2: 章节标题是否已翻译
                let hasTitleTranslation = false;
                if (typeof chapter.title === 'string') {
                  // 旧格式，无法区分，假设已翻译或是原文
                  // 严格来说旧格式没有 translation 字段，所以视为未翻译？
                  // 或者不检查旧格式
                  hasTitleTranslation = true;
                } else {
                  hasTitleTranslation =
                    !!chapter.title.translation && !!chapter.title.translation.translation;
                }

                if (!hasTitleTranslation) {
                  return JSON.stringify({
                    success: false,
                    error: '无法提交复核：章节标题尚未翻译',
                  });
                }

                // 检查 1: 所有非空段落是否有翻译
                const fullContent =
                  chapter.content || (await ChapterContentService.loadChapterContent(chapterId));

                let contentToCheck = fullContent;
                let isChunkCheck = false;
                if (context.chunkBoundaries && fullContent) {
                  // 如果存在 chunkBoundaries，仅检查当前块内的段落
                  contentToCheck = fullContent.filter((p) =>
                    context.chunkBoundaries!.allowedParagraphIds.has(p.id),
                  );
                  isChunkCheck = true;
                }

                if (contentToCheck && contentToCheck.length > 0) {
                  const nonEmptyParagraphs = contentToCheck.filter(
                    (p) => p.text && p.text.trim().length > 0,
                  );
                  const untranslatedParagraphs = nonEmptyParagraphs.filter(
                    (p) => !p.translations || p.translations.length === 0,
                  );

                  if (untranslatedParagraphs.length > 0) {
                    const scopeMsg = isChunkCheck ? '当前分块' : '全文章节';
                    // 列出未翻译的段落 ID (最多显示 10 个)
                    const MAX_IDS_SHOW = 10;
                    const idsToShow = untranslatedParagraphs
                      .slice(0, MAX_IDS_SHOW)
                      .map((p) => p.id);
                    let missingIds = idsToShow.join(', ');

                    if (untranslatedParagraphs.length > MAX_IDS_SHOW) {
                      missingIds += `... (等共 ${untranslatedParagraphs.length} 个)`;
                    }

                    return JSON.stringify({
                      success: false,
                      error: `无法提交复核：${scopeMsg}内仍有 ${untranslatedParagraphs.length} 个非空段落未翻译 (ID: ${missingIds})`,
                    });
                  }
                }
              }
            }
          } catch (checkError) {
            console.error('Review check failed:', checkError);
            return JSON.stringify({
              success: false,
              error: `完整性检查失败: ${checkError instanceof Error ? checkError.message : String(checkError)}`,
            });
          }
        }
      }

      try {
        // 执行状态更新
        await updateTaskStatus(aiProcessingStore, taskId, status);

        // 报告操作
        if (onAction) {
          onAction({
            type: 'update',
            entity: 'todo',
            data: {
              id: taskId,
              name: `任务状态更新: ${currentStatus || '初始'} → ${status}`,
            },
          });
        }

        return JSON.stringify({
          success: true,
          message: `任务状态已更新: ${currentStatus || '初始'} → ${status}`,
          task_id: taskId,
          new_status: status,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        return JSON.stringify({
          success: false,
          error: `状态更新失败: ${errorMsg}`,
        });
      }
    },
  },
];
