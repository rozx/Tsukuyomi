/**
 * TodoWorkflow — 结构化待办事项工作流
 * 负责预定义待办模板、状态入口生成、gate 检查和上下文块构建
 */

import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
import type { TaskType, TaskStatus } from './task-types';

/** 预定义待办模板（固定文本） */
type TodoTemplate = string[];

/** working 状态的动态配置 */
export interface WorkingTodoConfig {
  paragraphIds: string[];
  chunkText: string;
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
const PLANNING_TEMPLATE: TodoTemplate = [
  '确认角色、术语、记忆信息（上下文已提供，缺失或不准确时调用工具补充/搜索）',
  '获取前后文上下文（如需要，可调用工具预览段落/章节，或用工具确认之前的剧情）',
  '确认角色口吻与敬语策略（自称/他称/语气词；搜索记忆、既往译文与角色关系，确保跨章节一致）',
  '确认翻译策略（如需调整，可调用工具修改）',
  '创建/更新术语、角色、记忆（无需操作时直接标记完成；描述/口吻/别名/全名缺失或不准确时补充，推荐更新已有记忆而非新建）',
];

/**
 * 简短规划模板：后续 chunk 已继承前一个 chunk 的规划上下文，
 * 只保留真正与本 chunk 相关的两项。
 */
const BRIEF_PLANNING_TEMPLATE: TodoTemplate = [
  '确认本部分与上一部分的衔接（如需要，预览相邻段落确认剧情与称呼延续）',
  '补充本部分新出现的术语/角色/记忆（无新增时直接标记完成）',
];

/**
 * review 模板（原 5 条中的一致性检查三项合并为一条）
 */
const REVIEW_TEMPLATE: TodoTemplate = [
  '校对译文与原文一致性（含敬语、人称代词、语气词、角色说话口吻的前后一致）',
  '修正发现的问题段落（直接使用 add_translation_batch 提交修正）',
  '更新术语、角色、记忆（如有新发现、缺失或不准确）',
];

/**
 * 获取预定义模板
 *
 * preparing 已并入 planning，故 state='preparing' 不再产出模板。
 */
function getTemplates(
  taskType: TaskType,
  state: TaskStatus,
  isBriefPlanning: boolean,
): TodoTemplate | null {
  switch (state) {
    case 'planning':
      return isBriefPlanning ? BRIEF_PLANNING_TEMPLATE : PLANNING_TEMPLATE;
    case 'review':
      // 润色/校对没有 review 阶段
      return taskType === 'translation' ? REVIEW_TEMPLATE : null;
    // working 为动态模板，preparing/end 不产出
    default:
      return null;
  }
}

/**
 * 从 chunk text 中提取段落信息
 * chunk 格式: [displayIndex] [ID: paragraphId] 原文: text\n翻译: translation
 */
function extractParagraphInfo(
  chunkText: string,
  paragraphIds: string[],
): Array<{ displayIndex: number; id: string; preview: string }> {
  const result: Array<{ displayIndex: number; id: string; preview: string }> = [];
  const lines = chunkText.split('\n');

  for (const id of paragraphIds) {
    const line = lines.find((l) => l.includes(`[ID: ${id}]`));
    if (line) {
      const displayIndexMatch = line.match(/^\[(\d+)\]/);
      const textMatch = line.match(/原文: (.+)$/);
      const displayIndex = displayIndexMatch ? parseInt(displayIndexMatch[1]!, 10) : 0;
      const originalText = textMatch ? textMatch[1]! : '';
      const preview = originalText.length > 20 ? originalText.slice(0, 20) + '...' : originalText;
      result.push({ displayIndex, id, preview });
    }
  }
  return result;
}

/**
 * 构建 verbose working 待办文本
 */
function buildWorkingTodoTexts(config: WorkingTodoConfig): string[] {
  const { paragraphIds, chunkText, chunkIndex, chapterTitle } = config;
  const todos: string[] = [];

  // 章节标题待办（仅第一个 chunk 且有标题时）
  if (chunkIndex === 0 && chapterTitle) {
    todos.push(`翻译章节标题：「${chapterTitle}」`);
  }

  // 按 MAX_TRANSLATION_BATCH_SIZE 分批
  const totalBatches = Math.ceil(paragraphIds.length / MAX_TRANSLATION_BATCH_SIZE);
  const paragraphInfos = extractParagraphInfo(chunkText, paragraphIds);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * MAX_TRANSLATION_BATCH_SIZE;
    const end = Math.min(start + MAX_TRANSLATION_BATCH_SIZE, paragraphIds.length);
    const batchIds = paragraphIds.slice(start, end);
    const batchInfos = paragraphInfos.filter((p) => batchIds.includes(p.id));

    const batchLines = batchInfos
      .map((p) => `  [${p.displayIndex}] [${p.id}] ${p.preview}`)
      .join('\n');

    const batchLabel =
      totalBatches > 1
        ? `处理段落批次 ${batchIdx + 1}/${totalBatches}（${batchIds.length} 段）：\n${batchLines}`
        : `处理全部段落（${batchIds.length} 段）：\n${batchLines}`;

    todos.push(batchLabel);
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
  private initializedStates: Set<TaskStatus> = new Set();

  constructor(
    taskType: TaskType,
    taskId: string,
    chunkIndex: number = 0,
    isBriefPlanning: boolean = false,
  ) {
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
    const templates = getTemplates(this.taskType, state, this.isBriefPlanning);
    if (templates) {
      const created = templates.map((text) =>
        TodoListService.createTodo(text, this.taskId, undefined, {
          predefined: true,
          taskState: state,
          chunkIndex: this.chunkIndex,
        }),
      );
      return this.promoteFirstPending(created);
    }

    // working 状态的动态模板
    if (state === 'working' && config) {
      const texts = buildWorkingTodoTexts(config);
      const created = texts.map((text) =>
        TodoListService.createTodo(text, this.taskId, undefined, {
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
    const first = stateTodos.find(
      (t) => TodoListService.getTodoById(t.id)?.status === 'pending',
    );
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

    let block = '\n【待办清单】\n';

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
      block += `\n⚠️ 当前任务：${firstLine} — 完成后调用 mark_todo_done 标记\n`;
    }

    if (allDone) {
      block += '\n✅ 所有待办已完成，可以进入下一阶段\n';
    } else {
      block += '⚠️ 完成所有待办后方可进入下一阶段\n';
    }

    return block;
  }
}
