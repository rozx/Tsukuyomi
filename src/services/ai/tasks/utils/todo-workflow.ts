import { agentText, translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import type { ExecutionLanguages, AppLocale } from 'src/models/locale';
import { captureExecutionLanguages } from './execution-languages';
/**
 * TodoWorkflow — 结构化待办事项工作流
 * 负责预定义待办模板、状态入口生成、gate 检查和上下文块构建
 */

import {
  TodoListService,
  type TodoItem,
  type TodoParagraphInput,
} from 'src/services/todo-list-service';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
import type { TaskType, TaskStatus } from './task-types';

/** 预定义待办模板（固定文本） */
type TodoTemplate = string[];

/** working 状态的动态配置 */
export interface WorkingTodoConfig {
  paragraphIds: string[];
  chunkText: string;
  paragraphInputs?: readonly TodoParagraphInput[];
  chunkIndex: number;
  chapterTitle?: string | undefined;
}

/** gate 检查结果 */
export interface GateResult {
  allowed: boolean;
  incompleteItems: TodoItem[];
}

/**
 * planning 完整模板（preparing 阶段的数据维护项已并入最后一条）
 *
 * 相比旧版 planning(7) + preparing(3) = 10 条：
 * - 角色/术语/记忆三条独立"确认"项合并为一条（信息本就在同一个上下文块里）
 * - "确认角色口吻" 与 "确认敬语策略" 高度重叠，合并为一条
 * - preparing 的三条创建/更新项合并为一条数据维护项
 */
const PLANNING_TEMPLATE = [1, 2, 3, 4, 5].map(
  (index) => `aiWorkflow.planning.${index}` as MessageKey,
);
const BRIEF_PLANNING_TEMPLATE = [1, 2].map((index) => `aiWorkflow.brief.${index}` as MessageKey);
const REVIEW_TEMPLATE = [1, 2, 3].map((index) => `aiWorkflow.review.${index}` as MessageKey);

function getTemplates(
  taskType: TaskType,
  state: TaskStatus,
  isBriefPlanning: boolean,
  uiLocale: AppLocale,
): TodoTemplate | null {
  const keys =
    state === 'planning'
      ? isBriefPlanning
        ? BRIEF_PLANNING_TEMPLATE
        : PLANNING_TEMPLATE
      : state === 'review' && taskType === 'translation'
        ? REVIEW_TEMPLATE
        : null;
  return keys?.map((key) => translateText(uiLocale, key)) ?? null;
}

function buildWorkingTodos(
  config: WorkingTodoConfig,
  uiLocale: AppLocale,
): Array<{ text: string; paragraphInputs?: TodoParagraphInput[] }> {
  const { paragraphIds, chunkIndex, chapterTitle } = config;
  const todos: Array<{ text: string; paragraphInputs?: TodoParagraphInput[] }> = [];
  if (chunkIndex === 0 && chapterTitle)
    todos.push({ text: translateText(uiLocale, 'aiWorkflow.title', { title: chapterTitle }) });
  const total = Math.ceil(paragraphIds.length / MAX_TRANSLATION_BATCH_SIZE);
  const inputs = new Map(config.paragraphInputs?.map((paragraph) => [paragraph.id, paragraph]));
  for (let index = 0; index < total; index++) {
    const ids = paragraphIds.slice(
      index * MAX_TRANSLATION_BATCH_SIZE,
      (index + 1) * MAX_TRANSLATION_BATCH_SIZE,
    );
    const paragraphInputs = ids.map(
      (id, offset) =>
        inputs.get(id) ?? {
          id,
          displayIndex: index * MAX_TRANSLATION_BATCH_SIZE + offset + 1,
        },
    );
    // 只列编号与 ID：原文已在分块上下文里，待办文本每轮都会进上下文，带原文预览会重复堆积
    const lines = paragraphInputs
      .map((paragraph) => `  [${paragraph.displayIndex}] [${paragraph.id}]`)
      .join('\n');
    todos.push({
      text: translateText(uiLocale, total > 1 ? 'aiWorkflow.batch' : 'aiWorkflow.all', {
        index: index + 1,
        total,
        count: ids.length,
        lines,
      }),
      paragraphInputs,
    });
  }
  return todos;
}

/**
 * TodoWorkflow 类
 */
export class TodoWorkflow {
  private taskType: TaskType;
  private taskId: string;
  private chunkIndex: number;
  private isBriefPlanning: boolean;
  private readonly languages: ExecutionLanguages;
  private initializedStates: Set<TaskStatus> = new Set();

  constructor(
    taskType: TaskType,
    taskId: string,
    chunkIndex: number = 0,
    isBriefPlanning: boolean = false,
    languages: ExecutionLanguages = captureExecutionLanguages('zh-CN'),
  ) {
    this.languages = captureExecutionLanguages(languages.uiLocale, languages.targetLanguage);
    this.taskType = taskType;
    this.taskId = taskId;
    this.chunkIndex = chunkIndex;
    this.isBriefPlanning = isBriefPlanning;

    // 切换到新 chunk 时，清掉上一个 chunk 残留的待办（包括 agent 自创的 ad-hoc，
    // 后者无 chunkIndex 标记，按 0 处理）。否则 list_todos 工具和 UI 都会把历史
    // chunk 的完成记录暴露给 agent / 用户，造成上下文混淆。
    if (chunkIndex > 0) {
      const todos = TodoListService.getTodosByTaskId(taskId);
      for (const todo of todos) {
        const todoChunk = todo.chunkIndex ?? 0;
        if (todoChunk < chunkIndex) {
          TodoListService.deleteTodo(todo.id);
        }
      }
    }
  }

  /**
   * 为新状态生成预定义待办（仅首次进入时）
   * 对于 working 状态需要传入 config
   */
  generateForState(state: TaskStatus, config?: WorkingTodoConfig): TodoItem[] {
    if (state === 'end') return [];
    if (this.initializedStates.has(state)) return [];

    const existingTodos = TodoListService.getTodosByTaskId(this.taskId);
    const hasGenerated = existingTodos.some(
      (t) => t.predefined && t.taskState === state && t.chunkIndex === this.chunkIndex,
    );

    if (hasGenerated) {
      this.initializedStates.add(state);
      // 恢复场景：待办已存在但可能没有进行中项，补一次自动推进
      this.promoteFirstPending(
        existingTodos.filter(
          (t) => t.predefined && t.taskState === state && t.chunkIndex === this.chunkIndex,
        ),
      );
      return [];
    }

    this.initializedStates.add(state);

    // 静态模板
    const templates = getTemplates(
      this.taskType,
      state,
      this.isBriefPlanning,
      this.languages.uiLocale,
    );
    if (templates) {
      const created = templates.map((text) =>
        TodoListService.createTodo(text, this.taskId, undefined, {
          uiLocale: this.languages.uiLocale,
          predefined: true,
          taskState: state,
          chunkIndex: this.chunkIndex,
        }),
      );
      return this.promoteFirstPending(created);
    }

    // working 状态的动态模板
    if (state === 'working' && config) {
      const texts = buildWorkingTodos(config, this.languages.uiLocale);
      const created = texts.map((todo) =>
        TodoListService.createTodo(todo.text, this.taskId, undefined, {
          uiLocale: this.languages.uiLocale,
          ...(todo.paragraphInputs ? { paragraphInputs: todo.paragraphInputs } : {}),
          predefined: true,
          taskState: state,
          chunkIndex: this.chunkIndex,
        }),
      );
      return this.promoteFirstPending(created);
    }

    return [];
  }

  /**
   * 自动推进：任务范围内没有进行中的待办时，把给定列表里第一个 pending 提升为 working。
   * 只在传入的（当前阶段）待办里挑选，避免早期阶段残留的 ad-hoc pending 抢占提升。
   */
  private promoteFirstPending(stateTodos: TodoItem[]): TodoItem[] {
    if (stateTodos.length === 0) return stateTodos;

    const taskTodos = TodoListService.getTodosByTaskId(this.taskId);
    if (taskTodos.some((t) => t.status === 'working')) return stateTodos;

    // 以存储中的最新状态为准（传入的可能是创建时的快照，状态或已被外部翻转）
    const first = stateTodos.find((t) => TodoListService.getTodoById(t.id)?.status === 'pending');
    if (!first) return stateTodos;

    const updated = TodoListService.markTodoAsWorking(first.id);
    return stateTodos.map((t) => (t.id === updated.id ? updated : t));
  }

  /**
   * 检查当前状态的 gate：所有预定义待办是否都已完成
   * 仅检查 predefined=true 的待办，忽略 agent 自创的 ad-hoc 待办
   */
  checkGate(currentState: TaskStatus): GateResult {
    const todos = TodoListService.getTodosByTaskId(this.taskId);
    const predefinedTodos = todos.filter(
      (t) => t.predefined && t.taskState === currentState && t.chunkIndex === this.chunkIndex,
    );

    // 如果该状态没有初始化过待办，则不阻塞
    if (!this.initializedStates.has(currentState)) {
      return { allowed: true, incompleteItems: [] };
    }

    const incompleteItems = predefinedTodos.filter((t) => t.status !== 'done');
    return {
      allowed: incompleteItems.length === 0,
      incompleteItems,
    };
  }

  /**
   * 构建 【待办清单】 上下文块
   */
  buildTodoContextBlock(currentState: TaskStatus): string {
    const todos = TodoListService.getTodosByTaskId(this.taskId);
    if (todos.length === 0) return '';

    // 仅展示当前阶段/区块的 predefined 待办（ad-hoc 待办在 helper 里展示）
    const predefinedTodos = todos.filter(
      (t) => t.predefined && t.taskState === currentState && t.chunkIndex === this.chunkIndex,
    );
    if (predefinedTodos.length === 0) return '';

    const allDone = predefinedTodos.every((t) => t.status === 'done');

    // 只展开"当前项"的完整文本，其余一律折叠为首行。
    // working 阶段的待办正文含逐段清单（每段一行），全量展开会在每轮工具调用后
    // 被复制进上下文，长章节可轻易堆出上千行冗余。
    // 打卡协议放宽后模型可能不再标记 working，故回退到第一个未完成项，
    // 保证"当前该做的那一项"始终可见。
    const currentTodo =
      predefinedTodos.find((t) => t.status === 'working') ??
      predefinedTodos.find((t) => t.status !== 'done');

    let block = agentText('aiWorkflow.header');

    for (const todo of predefinedTodos) {
      const firstLine = todo.text.split('\n')[0]!;
      if (todo.status === 'done') {
        block += `✅ [${todo.id}] ${firstLine}\n`;
      } else if (todo.id === currentTodo?.id) {
        block += `→ [${todo.id}] ${todo.text}\n`;
      } else {
        block += `☐ [${todo.id}] ${firstLine}\n`;
      }
    }

    // 提醒行
    if (currentTodo) {
      const firstLine = currentTodo.text.split('\n')[0]!;
      block += agentText('aiWorkflow.current', { text: firstLine });
    }

    if (allDone) {
      block += agentText('aiWorkflow.complete');
    } else {
      block += agentText('aiWorkflow.incomplete');
    }

    return block;
  }
}
