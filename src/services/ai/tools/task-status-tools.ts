import { agentText, AGENT_LOCALE, translateText } from 'src/i18n/translate';
import {
  agentErrorMessage,
  AgentError,
  LocalizedError,
  localizedErrorMessage,
} from 'src/utils/localized-error';
import { toolDefinition } from './tool-localization';
import { describeTool } from './tool-localization';
import type { AppLocale } from 'src/models/locale';
import type { Chapter } from 'src/models/novel';
import { getLanguageTranslation, getNameTranslation } from 'src/services/localization/selection';
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
  feedbackLocale: AppLocale = 'zh-CN',
): string {
  if (newStatus === 'preparing') {
    return agentText('aiTaskFeedback.preparing');
  }

  if (taskType === 'translation' && currentStatus === 'working' && newStatus === 'end') {
    return agentText('aiTaskFeedback.translationReview');
  }

  if (newStatus === 'review') {
    if (taskType === 'polish') {
      return agentText('aiTaskFeedback.polishReview');
    }
    if (taskType === 'proofreading') {
      return agentText('aiTaskFeedback.proofreadReview');
    }
  }

  return agentText('aiTaskFeedback.invalidTransition', {
    previous: currentStatus,
    next: newStatus,
  });
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
  feedbackLocale: AppLocale = 'zh-CN',
): { valid: boolean; error?: string } {
  // 如果是首次状态更新，必须是 planning
  if (!currentStatus) {
    if (newStatus !== 'planning') {
      return {
        valid: false,
        error: agentText('aiTaskFeedback.initial'),
      };
    }
    return { valid: true };
  }

  const rules = TRANSITION_RULES[taskType];
  if (!rules) {
    return {
      valid: false,
      error: agentText('aiTaskFeedback.unknownType', { type: taskType }),
    };
  }

  const allowedTransitions = rules[currentStatus];
  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: getTransitionErrorMessage(taskType, currentStatus, newStatus, feedbackLocale),
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
    throw new AgentError('AI_STORE_REQUIRED', 'aiTaskFeedback.storeMissing');
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
function formatMissingIds(ids: string[], feedbackLocale: AppLocale): string {
  const head = ids.slice(0, MAX_IDS_SHOW).join(', ');
  return ids.length > MAX_IDS_SHOW
    ? agentText('aiTaskFeedback.idSummary', { head, count: ids.length })
    : head;
}

/**
 * 判断章节标题是否已翻译
 */
function hasTitleTranslation(chapter: Pick<Chapter, 'title'>, language: AppLocale): boolean {
  const title = chapter.title;
  if (typeof title === 'string') return !title.trim();
  if (!title) return false;
  if (typeof title.original === 'string' && !title.original.trim()) return true;
  return !!getNameTranslation(title, language);
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
  feedbackLocale: AppLocale;
  chapterId: string;
  accumulatedParagraphs: Map<string, string>;
  chunkBoundaries: { paragraphIds: string[]; allowedParagraphIds: Set<string> } | undefined;
}): Promise<ReviewCheckFailure | null> {
  const { chapterId, accumulatedParagraphs, chunkBoundaries, feedbackLocale } = params;
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
        error: agentText('aiTaskFeedback.missingChunk', {
          count: missingIds.length,
          ids: formatMissingIds(missingIds, feedbackLocale),
        }),
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
      error: agentText('aiTaskFeedback.missingUninitialized', {
        count: notSubmitted.length,
        ids: formatMissingIds(notSubmitted, feedbackLocale),
      }),
    };
  }
  return null;
}

/**
 * 通过数据库内容进行 review 校验（向后兼容路径）
 */
async function checkReviewWithDatabase(params: {
  feedbackLocale: AppLocale;
  language: AppLocale;
  chapterId: string;
  chunkBoundaries: { allowedParagraphIds: Set<string> } | undefined;
}): Promise<ReviewCheckFailure | null> {
  const { chapterId, chunkBoundaries, language, feedbackLocale } = params;
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
  const untranslated = nonEmptyParagraphs.filter((p) => !getLanguageTranslation(p, language));
  if (untranslated.length === 0) {
    return null;
  }

  const scopeMsg = agentText(chunkBoundaries ? 'aiTaskFeedback.chunk' : 'aiTaskFeedback.chapter');
  const ids = untranslated.map((p) => p.id);
  return {
    error: agentText('aiTaskFeedback.missingDatabase', {
      scope: scopeMsg,
      count: untranslated.length,
      ids: formatMissingIds(ids, feedbackLocale),
    }),
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
  const feedbackLocale = AGENT_LOCALE;
  const language = context.languages?.targetLanguage ?? 'zh-CN';
  const chapterId = task.chapterId;
  const bookId = task.bookId || context.bookId;
  // 非首块不需要检查标题翻译（标题仅在首块处理）
  const isFirstChunk = context.chunkIndex === undefined || context.chunkIndex === 0;

  if (!chapterId || !bookId) {
    return {
      error: agentText('aiTaskFeedback.missingScope', {
        scope: agentText(
          !chapterId ? 'aiTaskFeedback.chapterAssociation' : 'aiTaskFeedback.bookAssociation',
        ),
      }),
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
    if (isFirstChunk && !hasTitleTranslation(chapter, language)) {
      return { error: agentText('aiTaskFeedback.missingTitle') };
    }

    // 分块优先使用本次已完成保存的提交记录；全章/旧调用按执行语言读正文。
    const accumulatedParagraphs = context.accumulatedParagraphs;

    if (accumulatedParagraphs && accumulatedParagraphs.size > 0) {
      const failure = await checkReviewWithAccumulated({
        feedbackLocale,
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
        feedbackLocale,
        language,
        chapterId,
        chunkBoundaries: context.chunkBoundaries,
      });
      if (failure) return failure;
    }

    return null;
  } catch (checkError) {
    console.error('Review check failed:', checkError);
    return {
      error: agentText('aiTaskFeedback.reviewFailed', {
        detail: agentErrorMessage(checkError, 'aiTaskFeedback.unknownError'),
      }),
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

function jsonError(error: string, code: string): string {
  return JSON.stringify({ success: false, error_code: code, error });
}

export const taskStatusTools: ToolDefinition[] = [
  {
    definition: toolDefinition('update_task_status', {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['planning', 'working', 'review', 'end'],
          description: describeTool('update_task_status.parameters.properties.status'),
        },
        reason: {
          type: 'string',
          description: describeTool('update_task_status.parameters.properties.reason'),
        },
      },
      required: ['status'],
    }),
    handler: async (args, context: ToolContext) => {
      const feedbackLocale = AGENT_LOCALE;
      const actionLocale = context.languages?.uiLocale ?? 'zh-CN';
      const { taskId, onAction } = context;
      const { status, reason: _reason } = args as { status: string; reason?: string };

      // 验证状态值
      if (!isValidStatus(status)) {
        return jsonError(
          agentText('aiTaskFeedback.invalidStatus', {
            status,
            valid: VALID_STATUSES.join('、'),
          }),
          'TASK_STATUS_INVALID',
        );
      }

      // 获取 AI 处理 Store（由服务层注入）
      // 限制：当前工具只能在提供 aiProcessingStore 的调用链中使用（已在文档记录）
      const aiProcessingStore = context.aiProcessingStore;

      if (!taskId) {
        return jsonError(agentText('aiTaskFeedback.taskMissingId'), 'TASK_ID_REQUIRED');
      }
      if (!aiProcessingStore) {
        return jsonError(agentText('aiTaskFeedback.storeMissing'), 'AI_STORE_REQUIRED');
      }

      // 获取当前任务信息以确定任务类型
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      if (!task) {
        return jsonError(agentText('aiTaskFeedback.taskMissing', { id: taskId }), 'TASK_NOT_FOUND');
      }

      const taskType = task.type as TaskType;

      // 验证状态转换
      const currentStatus = getTaskCurrentStatus(aiProcessingStore, taskId);
      const validation = isValidTransition(taskType, currentStatus, status, feedbackLocale);
      if (!validation.valid) {
        return jsonError(
          validation.error ?? agentText('aiTaskFeedback.validationFailed'),
          'TASK_TRANSITION_INVALID',
        );
      }

      // 特殊检查：当翻译任务状态变更为 review 时，进行完整性检查
      if (taskType === 'translation' && status === 'review') {
        const reviewFailure = await validateTranslationReview(task, context);
        if (reviewFailure) {
          return jsonError(reviewFailure.error, 'TRANSLATION_INCOMPLETE');
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
              // 操作名称展示在界面上，使用执行的界面语言
              name: translateText(actionLocale, 'aiTaskFeedback.actionName', {
                previous:
                  currentStatus || translateText(actionLocale, 'aiTaskFeedback.initialLabel'),
                next: status,
              }),
            },
          });
        }

        // 当状态变更为 review 时，获取并提醒未完成的待办事项（仅当有待办时返回，减少 token 消耗）
        const todoReminder = status === 'review' ? collectTodoReminder(taskId) : undefined;

        const result: Record<string, unknown> = {
          success: true,
          message: agentText('aiTaskFeedback.changed', {
            previous: currentStatus || agentText('aiTaskFeedback.initialLabel'),
            next: status,
          }),
          task_id: taskId,
          new_status: status,
        };
        if (todoReminder) {
          result.todo_reminder = todoReminder;
        }

        return JSON.stringify(result);
      } catch (error) {
        const errorMsg = agentErrorMessage(error, 'aiTaskFeedback.unknownError');
        return jsonError(
          agentText('aiTaskFeedback.updateFailed', { detail: errorMsg }),
          'TASK_STATUS_UPDATE_FAILED',
        );
      }
    },
  },
];
