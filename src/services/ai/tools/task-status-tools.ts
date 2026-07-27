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

// preparing 已并入 planning。规则里保留 preparing → working，
// 仅用于兼容旧版本持久化下来的任务状态，避免恢复后无路可走。
const TRANSITION_RULES: Record<TaskType, StateTransitionRules> = {
  translation: {
    planning: ['working'],
    preparing: ['working'],
    working: ['review'],
    review: ['working', 'end'],
    end: [],
  },
  polish: {
    planning: ['working'],
    preparing: ['working'],
    working: ['end'],
    end: [],
  },
  proofreading: {
    planning: ['working'],
    preparing: ['working'],
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
  if (newStatus === 'preparing') {
    return 'preparing 阶段已并入 planning，请直接切换到 working';
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

  // 只更新 workflowStatus，不要设置 store 级 status。
  // store 级 status='end' 代表"整个任务结束"，会写入 endTime 并触发清理；
  // 而此处的 newStatus='end' 只表示某个 chunk 的工作流已到达 end 状态，
  // 后续可能还有更多 chunk 要处理。任务真正结束由 completeTask() 统一负责。
  await aiProcessingStore.updateTask(taskId, {
    workflowStatus: newStatus,
  });
}

const MAX_IDS_SHOW = 10;

/**
 * 将缺失段落 ID 列表截断为展示字符串
 */
function formatMissingIds(ids: string[]): string {
  const head = ids.slice(0, MAX_IDS_SHOW).join(', ');
  return ids.length > MAX_IDS_SHOW ? `${head}... (等共 ${ids.length} 个)` : head;
}

/**
 * 判断章节标题是否已翻译
 */
function hasTitleTranslation(chapter: { title: unknown }): boolean {
  const title = chapter.title as
    | string
    | { translation?: { translation?: string } | null }
    | undefined;
  if (typeof title === 'string') {
    // 旧格式，无法区分，假设已翻译或是原文
    return true;
  }
  return !!(title && title.translation && title.translation.translation);
}

interface ReviewCheckFailure {
  error: string;
}

/**
 * 在本块段落中找出"非空且尚未提交翻译"的段落 ID（用于 review 完整性校验）
 */
function findMissingNonEmptyParagraphIds(
  paragraphIdsToCheck: string[],
  paragraphTextMap: Map<string, string>,
  accumulatedParagraphs: Map<string, string>,
): string[] {
  const missingIds: string[] = [];
  for (const pId of paragraphIdsToCheck) {
    const text = paragraphTextMap.get(pId);
    const isNonEmpty = text && text.trim().length > 0;
    if (isNonEmpty && !accumulatedParagraphs.has(pId)) {
      missingIds.push(pId);
    }
  }
  return missingIds;
}

/**
 * 使用 accumulatedParagraphs 进行 review 校验（最准确，避免 skipSave 竞态）
 * 返回 null 表示通过或无法完整判断需要回退到数据库检查；返回 {error} 表示检查失败
 */
async function checkReviewWithAccumulated(params: {
  chapterId: string;
  accumulatedParagraphs: Map<string, string>;
  chunkBoundaries: { paragraphIds: string[]; allowedParagraphIds: Set<string> } | undefined;
}): Promise<ReviewCheckFailure | null> {
  const { chapterId, accumulatedParagraphs, chunkBoundaries } = params;
  const paragraphIdsToCheck: string[] = chunkBoundaries ? chunkBoundaries.paragraphIds : [];

  if (paragraphIdsToCheck.length === 0) {
    // 全章场景：没有 chunkBoundaries 无法完整校验，交给路径二
    return null;
  }

  // 分块场景：检查本块所有段落是否都在 accumulatedParagraphs 中
  // 空段落不需要翻译，仍需要段落文本数据来区分空/非空。
  const { ChapterContentService } = await import('src/services/chapter-content-service');
  const fullContent = await ChapterContentService.loadChapterContent(chapterId);

  if (fullContent) {
    const paragraphTextMap = new Map(fullContent.map((p) => [p.id, p.text]));
    const missingIds = findMissingNonEmptyParagraphIds(
      paragraphIdsToCheck,
      paragraphTextMap,
      accumulatedParagraphs,
    );
    if (missingIds.length > 0) {
      return {
        error: `无法提交复核：当前分块内仍有 ${missingIds.length} 个非空段落未翻译 (ID: ${formatMissingIds(missingIds)})`,
      };
    }
    // fullContent 有数据且所有非空段落均已翻译，允许 review
    return null;
  }

  // fullContent 为 null：IndexedDB 中暂无该章节的内容记录（可能是新章节首次翻译）。
  // 不能 fail-open——无段落文本时无法区分「空段落」和「非空段落」。
  // 保守策略：比较 paragraphIdsToCheck.length 与 accumulatedParagraphs.size。
  console.warn(
    `[task-status-tools] ⚠️ review 检查：章节 ${chapterId} 在 IndexedDB 中无内容记录，` +
      `无法通过段落文本判断空段落，改用段落数量保守估算`,
  );
  const notSubmitted = paragraphIdsToCheck.filter((id) => !accumulatedParagraphs.has(id));
  if (notSubmitted.length > 0) {
    return {
      error:
        `无法提交复核：章节内容未在本地存储中初始化，` +
        `且当前分块内有 ${notSubmitted.length} 个段落尚未提交翻译` +
        `（可能包含空段落，若确认均为空段落请手动继续）(ID: ${formatMissingIds(notSubmitted)})`,
    };
  }
  return null;
}

/**
 * 通过数据库内容进行 review 校验（向后兼容路径）
 */
async function checkReviewWithDatabase(params: {
  chapterId: string;
  chunkBoundaries: { allowedParagraphIds: Set<string> } | undefined;
}): Promise<ReviewCheckFailure | null> {
  const { chapterId, chunkBoundaries } = params;
  const { ChapterContentService } = await import('src/services/chapter-content-service');
  const dbContent = await ChapterContentService.loadChapterContent(chapterId);
  const contentToCheck =
    dbContent && chunkBoundaries
      ? dbContent.filter((p) => chunkBoundaries.allowedParagraphIds.has(p.id))
      : dbContent;

  if (!contentToCheck || contentToCheck.length === 0) {
    return null;
  }

  const nonEmptyParagraphs = contentToCheck.filter((p) => p.text && p.text.trim().length > 0);
  const untranslated = nonEmptyParagraphs.filter(
    (p) => !p.translations || p.translations.length === 0,
  );
  if (untranslated.length === 0) {
    return null;
  }

  const scopeMsg = chunkBoundaries ? '当前分块' : '全文章节';
  const ids = untranslated.map((p) => p.id);
  return {
    error: `无法提交复核：${scopeMsg}内仍有 ${untranslated.length} 个非空段落未翻译 (ID: ${formatMissingIds(ids)})`,
  };
}

/**
 * 对翻译任务进入 review 状态时进行完整性校验
 * 返回 null 表示通过，返回 {error} 表示校验失败需要阻止状态迁移
 */
async function validateTranslationReview(
  task: { chapterId?: string; bookId?: string },
  context: ToolContext,
): Promise<ReviewCheckFailure | null> {
  const chapterId = task.chapterId;
  const bookId = task.bookId || context.bookId;
  // 非首块不需要检查标题翻译（标题仅在首块处理）
  const isFirstChunk = context.chunkIndex === undefined || context.chunkIndex === 0;

  if (!chapterId || !bookId) {
    return {
      error: `无法提交复核：任务缺少${!chapterId ? '章节' : '书籍'}关联信息，无法验证翻译完整性`,
    };
  }

  try {
    // 延迟导入以避免循环依赖
    const { BookService } = await import('src/services/book-service');
    const { ChapterService } = await import('src/services/chapter-service');

    const book = await BookService.getBookById(bookId);
    if (!book) return null;
    const chapterInfo = ChapterService.findChapterById(book, chapterId);
    if (!chapterInfo) return null;
    const { chapter } = chapterInfo;

    // 检查: 章节标题是否已翻译（仅首块需要检查）
    if (isFirstChunk && !hasTitleTranslation(chapter)) {
      return { error: '无法提交复核：章节标题尚未翻译' };
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
      const failure = await checkReviewWithAccumulated({
        chapterId,
        accumulatedParagraphs,
        chunkBoundaries: context.chunkBoundaries,
      });
      if (failure) return failure;
    }

    if (!accumulatedParagraphs || !context.chunkBoundaries) {
      // 路径二：回退到数据库检查（向后兼容）
      // 当 accumulatedParagraphs 为空，或者是全章非分块场景时使用
      const failure = await checkReviewWithDatabase({
        chapterId,
        chunkBoundaries: context.chunkBoundaries,
      });
      if (failure) return failure;
    }

    return null;
  } catch (checkError) {
    console.error('Review check failed:', checkError);
    return {
      error: `完整性检查失败: ${checkError instanceof Error ? checkError.message : String(checkError)}`,
    };
  }
}

/**
 * 收集 review 状态下未完成的待办事项提醒
 */
function collectTodoReminder(
  taskId: string,
): { incomplete_count: number; todos: Array<{ id: string; text: string }> } | undefined {
  const todos = TodoListService.getTodosByTaskId(taskId);
  const incompleteTodos = todos.filter((t) => t.status !== 'done');
  if (incompleteTodos.length === 0) {
    return undefined;
  }
  return {
    incomplete_count: incompleteTodos.length,
    todos: incompleteTodos.map((t) => ({ id: t.id, text: t.text })),
  };
}

function jsonError(error: string): string {
  return JSON.stringify({ success: false, error });
}

export const taskStatusTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_task_status',
        description:
          '更新当前 AI 任务的状态。翻译任务：planning(规划中) → working(执行中) → review(复核中) → end(完成)；润色/校对任务：planning → working → end。注意：翻译任务支持 review → working 返回修改。',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['planning', 'working', 'review', 'end'],
              description:
                '新的任务状态。planning: 正在规划并维护术语/角色/记忆；working: 正在执行翻译/润色/校对；review: 正在复核（仅翻译任务可用）；end: 任务完成',
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
        return jsonError(
          `无效的状态值: "${status}"。有效的状态值为：${VALID_STATUSES.join('、')}`,
        );
      }

      // 获取 AI 处理 Store（由服务层注入）
      // 限制：当前工具只能在提供 aiProcessingStore 的调用链中使用（已在文档记录）
      const aiProcessingStore = context.aiProcessingStore;

      if (!taskId) {
        return jsonError('未提供任务 ID');
      }
      if (!aiProcessingStore) {
        return jsonError('AI 处理 Store 未初始化');
      }

      // 获取当前任务信息以确定任务类型
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      if (!task) {
        return jsonError(`任务不存在: ${taskId}`);
      }

      const taskType = task.type as TaskType;

      // 验证状态转换
      const currentStatus = getTaskCurrentStatus(aiProcessingStore, taskId);
      const validation = isValidTransition(taskType, currentStatus, status);
      if (!validation.valid) {
        return jsonError(validation.error ?? '状态转换验证失败');
      }

      // 特殊检查：当翻译任务状态变更为 review 时，进行完整性检查
      if (taskType === 'translation' && status === 'review') {
        const reviewFailure = await validateTranslationReview(task, context);
        if (reviewFailure) {
          return jsonError(reviewFailure.error);
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
        const todoReminder = status === 'review' ? collectTodoReminder(taskId) : undefined;

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
        return jsonError(`状态更新失败: ${errorMsg}`);
      }
    },
  },
];
