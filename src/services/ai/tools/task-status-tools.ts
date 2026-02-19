import type { ToolDefinition, ToolContext } from './types';
import type {
  TaskType,
  TaskStatus,
  AIProcessingStore,
} from 'src/services/ai/tasks/utils/task-types';
import { TodoListService } from 'src/services/todo-list-service';

const VALID_STATUSES: TaskStatus[] = ['planning', 'preparing', 'working', 'review', 'end'];

interface StateTransitionRules {
  [key: string]: TaskStatus[];
}

const TRANSITION_RULES: Record<TaskType, StateTransitionRules> = {
  translation: {
    planning: ['preparing'],
    preparing: ['working'],
    working: ['review'],
    review: ['working', 'end'],
    end: [],
  },
  polish: {
    planning: ['preparing'],
    preparing: ['working'],
    working: ['end'],
    end: [],
  },
  proofreading: {
    planning: ['preparing'],
    preparing: ['working'],
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
 * 获取更友好的状态转换错误信息
 */
function getTransitionErrorMessage(
  taskType: TaskType,
  currentStatus: TaskStatus,
  newStatus: TaskStatus,
): string {
  if (taskType === 'translation' && currentStatus === 'planning' && newStatus === 'working') {
    return '翻译任务必须先进入 preparing 状态';
  }

  if (
    (taskType === 'polish' || taskType === 'proofreading') &&
    currentStatus === 'planning' &&
    newStatus === 'working'
  ) {
    return '润色/校对任务必须先进入 preparing 状态';
  }

  if (taskType === 'translation' && currentStatus === 'working' && newStatus === 'end') {
    return '翻译任务必须先进入 review 状态';
  }

  if (newStatus === 'review') {
    if (taskType === 'polish') {
      return '润色任务不支持 review 状态';
    }
    if (taskType === 'proofreading') {
      return '校对任务不支持 review 状态';
    }
    if (taskType === 'chapter_summary') {
      return '章节摘要任务不支持 review 状态';
    }
  }

  return `无效的状态转换: ${currentStatus} → ${newStatus}`;
}

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
      error: getTransitionErrorMessage(taskType, currentStatus, newStatus),
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
          '更新当前 AI 任务的状态。翻译任务：planning(规划中) → preparing(准备中) → working(执行中) → review(复核中) → end(完成)；润色/校对任务：planning → preparing → working → end。注意：翻译任务支持 review → working 返回修改。',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['planning', 'preparing', 'working', 'review', 'end'],
              description:
                '新的任务状态。planning: 正在规划；preparing: 正在准备数据（术语/角色/记忆）；working: 正在执行翻译/润色/校对；review: 正在复核（仅翻译任务可用）；end: 任务完成',
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
        // 非首块不需要检查标题翻译（标题仅在首块处理）
        const isFirstChunk = context.chunkIndex === undefined || context.chunkIndex === 0;

        if (!chapterId || !bookId) {
          // 缺少章节或书籍关联信息，无法进行完整性检查，阻止进入 review
          return JSON.stringify({
            success: false,
            error: `无法提交复核：任务缺少${!chapterId ? '章节' : '书籍'}关联信息，无法验证翻译完整性`,
          });
        } else {
          try {
            // 延迟导入以避免循环依赖
            const { BookService } = await import('src/services/book-service');
            const { ChapterService } = await import('src/services/chapter-service');

            const book = await BookService.getBookById(bookId);
            if (book) {
              const chapterInfo = ChapterService.findChapterById(book, chapterId);
              if (chapterInfo) {
                const { chapter } = chapterInfo;

                // 检查: 章节标题是否已翻译（仅首块需要检查）
                if (isFirstChunk) {
                  let hasTitleTranslation = false;
                  if (typeof chapter.title === 'string') {
                    // 旧格式，无法区分，假设已翻译或是原文
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
                }

                // 检查: 所有非空段落是否有翻译
                //
                // ⚠️ 重要：不要依赖 BookService.getBookById() 返回的 chapter.content 或
                // ChapterContentService.loadChapterContent() 的数据。
                //
                // 根本原因：translateAllParagraphs 使用 skipSave:true 优化，翻译实时写入
                // 内存的 book.value.volumes（Vue 响应式对象），但直到整个翻译完成才批量落盘
                // 到 IndexedDB。BookService.getBookById() 读取的是 IndexedDB 快照，不包含
                // 这部分尚未落盘的翻译，导致误报"段落未翻译"。
                //
                // 修复策略：优先使用 accumulatedParagraphs（task-runner.ts 在内存中实时维护
                // 的、本次 session 已成功翻译的段落 ID → 翻译文本映射）。若存在该数据，直接
                // 以此为准；否则回退到数据库检查（保持向后兼容）。
                const accumulatedParagraphs = context.accumulatedParagraphs;

                if (accumulatedParagraphs && accumulatedParagraphs.size > 0) {
                  // 路径一：使用内存数据（最准确，避免 skipSave 竞态）
                  // 获取需要检查的段落 ID 列表
                  const paragraphIdsToCheck: string[] = context.chunkBoundaries
                    ? context.chunkBoundaries.paragraphIds // 分块场景：只检查当前块
                    : []; // 全章场景：没有 accumulated 也无法完整判断，退到路径二

                  if (paragraphIdsToCheck.length > 0) {
                    // 分块场景：检查本块所有段落是否都在 accumulatedParagraphs 中
                    // 注意：这里我们只检查 chunkBoundaries 中的段落 ID，
                    // 空段落不需要翻译（它们不会出现在 accumulatedParagraphs 中，但也不是遗漏）。
                    // 为了区分「空段落（正常跳过）」和「非空段落（需要翻译）」，
                    // 仍需要段落文本数据，退到路径二来获取 content 但用 accumulatedParagraphs 判断。
                    const { ChapterContentService } =
                      await import('src/services/chapter-content-service');
                    const fullContent = await ChapterContentService.loadChapterContent(chapterId);

                    if (fullContent) {
                      // 构建段落 ID → 段落文本的映射，以判断哪些是非空段落
                      const paragraphTextMap = new Map(fullContent.map((p) => [p.id, p.text]));

                      const missingIds: string[] = [];
                      for (const pId of paragraphIdsToCheck) {
                        const text = paragraphTextMap.get(pId);
                        const isNonEmpty = text && text.trim().length > 0;
                        if (isNonEmpty && !accumulatedParagraphs.has(pId)) {
                          missingIds.push(pId);
                        }
                      }

                      if (missingIds.length > 0) {
                        const MAX_IDS_SHOW = 10;
                        const idsToShow = missingIds.slice(0, MAX_IDS_SHOW);
                        let missingIdsStr = idsToShow.join(', ');
                        if (missingIds.length > MAX_IDS_SHOW) {
                          missingIdsStr += `... (等共 ${missingIds.length} 个)`;
                        }
                        return JSON.stringify({
                          success: false,
                          error: `无法提交复核：当前分块内仍有 ${missingIds.length} 个非空段落未翻译 (ID: ${missingIdsStr})`,
                        });
                      }
                      // fullContent 有数据且所有非空段落均已翻译，允许 review
                    } else {
                      // fullContent 为 null：IndexedDB 中暂无该章节的内容记录（可能是新章节首次翻译）。
                      // ⚠️ 不能 fail-open——无段落文本时无法区分「空段落」和「非空段落」。
                      // 保守策略：比较 paragraphIdsToCheck.length 与 accumulatedParagraphs.size。
                      // 若有段落 ID 尚未提交翻译，拒绝 review；若已提交数 >= 块内总段落数，放行。
                      console.warn(
                        `[task-status-tools] ⚠️ review 检查：章节 ${chapterId} 在 IndexedDB 中无内容记录，` +
                          `无法通过段落文本判断空段落，改用段落数量保守估算`,
                      );
                      const notSubmitted = paragraphIdsToCheck.filter(
                        (id) => !accumulatedParagraphs.has(id),
                      );
                      if (notSubmitted.length > 0) {
                        const MAX_IDS_SHOW = 10;
                        const missingIdsStr =
                          notSubmitted.slice(0, MAX_IDS_SHOW).join(', ') +
                          (notSubmitted.length > MAX_IDS_SHOW
                            ? `... (等共 ${notSubmitted.length} 个)`
                            : '');
                        return JSON.stringify({
                          success: false,
                          error:
                            `无法提交复核：章节内容未在本地存储中初始化，` +
                            `且当前分块内有 ${notSubmitted.length} 个段落尚未提交翻译` +
                            `（可能包含空段落，若确认均为空段落请手动继续）(ID: ${missingIdsStr})`,
                        });
                      }
                      // notSubmitted.length === 0：块内所有段落均已提交，允许 review
                    }
                  }
                  // accumulatedParagraphs 存在但无 chunkBoundaries（全章场景）
                  // 无法以 accumulatedParagraphs 完整校验（不知道全章需要哪些段落），退到路径二
                }

                if (!accumulatedParagraphs || !context.chunkBoundaries) {
                  // === 路径二：回退到数据库检查（向后兼容） ===
                  // 当 accumulatedParagraphs 为空，或者是全章非分块场景时使用
                  const { ChapterContentService } =
                    await import('src/services/chapter-content-service');
                  const dbContent = await ChapterContentService.loadChapterContent(chapterId);
                  const contentToCheck =
                    dbContent && context.chunkBoundaries
                      ? dbContent.filter((p) =>
                          context.chunkBoundaries!.allowedParagraphIds.has(p.id),
                        )
                      : dbContent;

                  if (contentToCheck && contentToCheck.length > 0) {
                    const nonEmptyParagraphs = contentToCheck.filter(
                      (p) => p.text && p.text.trim().length > 0,
                    );
                    const untranslated = nonEmptyParagraphs.filter(
                      (p) => !p.translations || p.translations.length === 0,
                    );
                    if (untranslated.length > 0) {
                      const scopeMsg = context.chunkBoundaries ? '当前分块' : '全文章节';
                      const MAX_IDS_SHOW = 10;
                      const ids = untranslated
                        .slice(0, MAX_IDS_SHOW)
                        .map((p) => p.id)
                        .join(', ');
                      const suffix =
                        untranslated.length > MAX_IDS_SHOW
                          ? `... (等共 ${untranslated.length} 个)`
                          : '';
                      return JSON.stringify({
                        success: false,
                        error: `无法提交复核：${scopeMsg}内仍有 ${untranslated.length} 个非空段落未翻译 (ID: ${ids}${suffix})`,
                      });
                    }
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

        // 当状态变更为 review 时，获取并提醒未完成的待办事项（仅当有待办时返回，减少 token 消耗）
        let todoReminder:
          | { incomplete_count: number; todos: Array<{ id: string; text: string }> }
          | undefined;
        if (status === 'review') {
          const todos = TodoListService.getTodosByTaskId(taskId);
          const incompleteTodos = todos.filter((t) => !t.completed);
          if (incompleteTodos.length > 0) {
            todoReminder = {
              incomplete_count: incompleteTodos.length,
              todos: incompleteTodos.map((t) => ({ id: t.id, text: t.text })),
            };
          }
        }

        const result: Record<string, unknown> = {
          success: true,
          message: `任务状态已更新: ${currentStatus || '初始'} → ${status}`,
          task_id: taskId,
          new_status: status,
        };
        if (todoReminder) {
          result.todo_reminder = todoReminder;
        }

        return JSON.stringify(result);
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
