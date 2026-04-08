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
 * 获取预定义模板
 */
function getTemplates(
  taskType: TaskType,
  state: TaskStatus,
): TodoTemplate | null {
  if (state === 'end') return null;

  switch (taskType) {
    case 'translation':
      switch (state) {
        case 'planning':
          return [
            '确认角色信息（上下文已提供，缺失时调用工具补充）',
            '确认术语信息（上下文已提供，缺失时调用工具补充）',
            '确认记忆信息（上下文已提供，缺失时搜索补充）',
            '确认段落内容（验证段落ID与原文，制定翻译策略）',
            '获取前后文上下文（如需要，可调用工具预览段落/章节）',
          ];
        case 'preparing':
          return [
            '创建/更新术语（确认完成或无需操作）',
            '创建/更新角色（确认完成或无需操作）',
            '创建/更新记忆（确认完成或无需操作）',
            '确认敬语翻译策略（搜索记忆/段落/角色关系，确定各角色间的敬语处理方式）',
          ];
        case 'working':
          return null; // dynamic
        case 'review':
          return [
            '检查翻译与原文一致性',
            '检查人称代词和语气词',
            '修正问题段落（可直接使用 add_translation_batch）',
            '更新术语/角色/记忆（如有新发现）',
          ];
        default:
          return null;
      }

    case 'polish':
    case 'proofreading':
      switch (state) {
        case 'planning':
          return [
            '确认角色信息（上下文已提供，缺失时调用工具补充）',
            '确认术语信息（上下文已提供，缺失时调用工具补充）',
            '确认记忆信息（上下文已提供，缺失时搜索补充）',
            '确认段落内容（验证段落ID与原文，制定翻译策略）',
            '获取前后文上下文（如需要，可调用工具预览段落/章节）',
          ];
        case 'preparing':
          return [
            '创建/更新术语（确认完成或无需操作）',
            '创建/更新角色（确认完成或无需操作）',
            '创建/更新记忆（确认完成或无需操作）',
          ];
        case 'working':
          return null; // dynamic
        default:
          return null;
      }

    case 'chapter_summary':
      switch (state) {
        case 'planning':
          return [
            '确认章节内容与前文摘要',
            '制定摘要策略',
          ];
        case 'working':
          return ['生成章节摘要'];
        default:
          return null;
      }

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
        ? `翻译段落批次 ${batchIdx + 1}/${totalBatches}（${batchIds.length} 段）：\n${batchLines}`
        : `翻译全部段落（${batchIds.length} 段）：\n${batchLines}`;

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
  private initializedStates: Set<TaskStatus> = new Set();

  constructor(taskType: TaskType, taskId: string, chunkIndex: number = 0) {
    this.taskType = taskType;
    this.taskId = taskId;
    this.chunkIndex = chunkIndex;
  }

  /**
   * 为新状态生成预定义待办（仅首次进入时）
   * 对于 working 状态需要传入 config
   */
  generateForState(state: TaskStatus, config?: WorkingTodoConfig): TodoItem[] {
    if (state === 'end') return [];
    if (this.initializedStates.has(state)) return [];

    const existingTodos = TodoListService.getTodosByTaskId(this.taskId);
    const hasGenerated = existingTodos.some((t) => 
      t.predefined && 
      t.taskState === state && 
      t.chunkIndex === this.chunkIndex
    );

    if (hasGenerated) {
      this.initializedStates.add(state);
      return [];
    }

    this.initializedStates.add(state);

    const isChunkZero = this.chunkIndex === 0;

    // 静态模板
    const templates = getTemplates(this.taskType, state);
    if (templates) {
      // 如果不是第一个 chunk，跳过 planning 和 preparing 的预定义规则（此时按系统设定通常是长驱直入）
      if (!isChunkZero && (state === 'planning' || state === 'preparing')) {
        return [];
      }

      return templates.map((text) =>
        TodoListService.createTodo(text, this.taskId, undefined, { 
          predefined: true, 
          taskState: state,
          chunkIndex: this.chunkIndex
        }),
      );
    }

    // working 状态的动态模板
    if (state === 'working' && config) {
      const texts = buildWorkingTodoTexts(config);
      return texts.map((text) =>
        TodoListService.createTodo(text, this.taskId, undefined, { 
          predefined: true, 
          taskState: state,
          chunkIndex: this.chunkIndex
        }),
      );
    }

    return [];
  }

  /**
   * 检查当前状态的 gate：所有预定义待办是否都已完成
   * 仅检查 predefined=true 的待办，忽略 agent 自创的 ad-hoc 待办
   */
  checkGate(currentState: TaskStatus): GateResult {
    const todos = TodoListService.getTodosByTaskId(this.taskId);
    const predefinedTodos = todos.filter((t) => t.predefined && t.taskState === currentState && t.chunkIndex === this.chunkIndex);

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
    const predefinedTodos = todos.filter((t) => t.predefined && t.taskState === currentState && t.chunkIndex === this.chunkIndex);
    if (predefinedTodos.length === 0) return '';

    const allDone = predefinedTodos.every((t) => t.status === 'done');

    let block = '\n【待办清单】\n';

    for (const todo of predefinedTodos) {
      if (todo.status === 'done') {
        // 已完成：折叠（仅显示第一行）
        const firstLine = todo.text.split('\n')[0]!;
        block += `✅ ${firstLine}\n`;
      } else if (todo.status === 'working') {
        // 进行中：展开完整内容
        block += `→ ${todo.text}\n`;
      } else {
        // 待处理：展开完整内容
        block += `☐ ${todo.text}\n`;
      }
    }

    // 提醒行
    const workingTodo = predefinedTodos.find((t) => t.status === 'working');
    if (workingTodo) {
      const firstLine = workingTodo.text.split('\n')[0]!;
      block += `\n⚠️ 当前任务：${firstLine} — 完成后请调用 mark_todo_done 标记\n`;
    }

    if (allDone) {
      block += '\n✅ 所有待办已完成，可以进入下一阶段\n';
    } else {
      block += '⚠️ 完成所有待办后方可进入下一阶段\n';
    }

    return block;
  }

  /** 检查某个状态是否已初始化 */
  isStateInitialized(state: TaskStatus): boolean {
    return this.initializedStates.has(state);
  }
}
