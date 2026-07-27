import './setup';
import { describe, test, expect, beforeEach } from 'bun:test';
import { TodoWorkflow } from 'src/services/ai/tasks/utils/todo-workflow';
import { TodoListService } from 'src/services/todo-list-service';
import {
  getValidTransitionsForTaskType,
  getTaskStateWorkflowText,
} from 'src/services/ai/tasks/utils/task-types';

/**
 * 翻译流程 todo 优化回归测试
 *
 * 覆盖四项改动：
 * 1. preparing 阶段并入 planning（状态机 + 模板 + 写入权限）
 * 2. 待办清单上下文只展开"当前项"，其余折叠为首行（token 泄漏修复）
 * 3. 放宽打卡协议：pending 可直接 done，且支持批量标记
 * 4. 模板去重 + isBriefPlanning 精简
 */
describe('翻译流程 todo 优化', () => {
  const taskId = 'todo-flow-opt-task';

  beforeEach(() => {
    TodoListService.clearAllTodos();
  });

  describe('1. preparing 并入 planning', () => {
    test('translation 状态机应为 planning → working → review → end', () => {
      const transitions = getValidTransitionsForTaskType('translation');

      expect(transitions.planning).toEqual(['working']);
      expect(transitions.working).toEqual(['review']);
      expect(transitions.review).toEqual(['end', 'working']);
      expect(transitions.end).toEqual([]);
    });

    test('polish/proofreading 状态机应为 planning → working → end', () => {
      for (const taskType of ['polish', 'proofreading'] as const) {
        const transitions = getValidTransitionsForTaskType(taskType);
        expect(transitions.planning).toEqual(['working']);
        expect(transitions.working).toEqual(['end']);
        expect(transitions.review).toEqual([]);
      }
    });

    test('planning 不应再能切换到 preparing', () => {
      const transitions = getValidTransitionsForTaskType('translation');
      expect(transitions.planning).not.toContain('preparing');
    });

    test('遗留的 preparing 状态仍应能前进到 working（向前兼容旧持久化任务）', () => {
      // 旧版本持久化的任务 workflowStatus 可能是 'preparing'，
      // 恢复后必须仍有出路，否则任务永久卡死。
      const transitions = getValidTransitionsForTaskType('translation');
      expect(transitions.preparing).toContain('working');
    });

    test('流程文本不应再提及 preparing', () => {
      expect(getTaskStateWorkflowText('translation')).toBe(
        'planning → working → review → end',
      );
      expect(getTaskStateWorkflowText('polish')).not.toContain('preparing');
    });

    test('generateForState("preparing") 应不再生成任何待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      expect(workflow.generateForState('preparing')).toHaveLength(0);
    });
  });

  describe('2. 模板去重与合并', () => {
    test('translation planning 应生成 5 条合并后的待办（含数据维护项）', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('planning');

      expect(todos).toHaveLength(5);
      // 原 planning 的角色/术语/记忆三条确认项合并为一条
      expect(todos[0]!.text).toContain('角色');
      expect(todos[0]!.text).toContain('术语');
      expect(todos[0]!.text).toContain('记忆');
      // 原 preparing 的三条创建/更新项合并为最后一条数据维护项
      const maintenance = todos[todos.length - 1]!.text;
      expect(maintenance).toContain('创建/更新');
      expect(maintenance).toContain('推荐更新');

      todos.forEach((t) => {
        expect(t.predefined).toBe(true);
        expect(t.taskState).toBe('planning');
        expect(t.status).toBe('pending');
      });
    });

    test('planning 模板不应包含重复的口吻/敬语确认项', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('planning');

      // 旧模板里「确认角色说话口吻的一致性」和「确认敬语翻译策略」是两条，现合并为一条。
      // 用「敬语」计数：只有合并后的那条口吻/敬语项会提到它
      //（数据维护项虽提到"口吻"，但那是待补全字段，不是重复的确认项）。
      const honorificItems = todos.filter((t) => t.text.includes('敬语'));
      expect(honorificItems).toHaveLength(1);
      expect(honorificItems[0]!.text).toContain('口吻');
    });

    test('translation review 应精简为 3 条', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('review');

      expect(todos).toHaveLength(3);
      // 原 1/2/5 三条（原文一致性、人称语气词、口吻一致性）合并为一条校对项
      expect(todos[0]!.text).toContain('一致性');
      expect(todos[1]!.text).toContain('add_translation_batch');
      expect(todos[2]!.text).toContain('术语');
    });

    test('isBriefPlanning 时 planning 应只生成 2 条精简待办', () => {
      const workflow = new TodoWorkflow('translation', taskId, 1, true);
      const todos = workflow.generateForState('planning');

      expect(todos).toHaveLength(2);
      todos.forEach((t) => expect(t.chunkIndex).toBe(1));
    });

    test('非 brief 模式的后续 chunk 仍生成完整 planning 模板', () => {
      const workflow = new TodoWorkflow('translation', taskId, 1, false);
      expect(workflow.generateForState('planning')).toHaveLength(5);
    });
  });

  describe('3. 待办上下文只展开当前项（token 泄漏修复）', () => {
    const chunkText = [
      '[1] [ID: p001] 原文: 第一段的原文内容在这里，比较长一些用于测试预览截断行为',
      '翻译:',
      '',
      '[2] [ID: p002] 原文: 第二段的原文内容',
      '翻译:',
      '',
    ].join('\n');

    function makeWorkingTodos() {
      const workflow = new TodoWorkflow('translation', taskId, 0);
      const todos = workflow.generateForState('working', {
        paragraphIds: ['p001', 'p002'],
        chunkText,
        chunkIndex: 0,
        chapterTitle: '第一章',
      });
      return { workflow, todos };
    }

    test('working 中的项应展开完整多行文本', () => {
      const { workflow, todos } = makeWorkingTodos();
      const batchTodo = todos.find((t) => t.text.includes('p001'))!;
      TodoListService.markTodoAsWorking(batchTodo.id);

      const block = workflow.buildTodoContextBlock('working');
      expect(block).toContain('p001');
      expect(block).toContain('p002');
    });

    test('非当前的 pending 项应折叠为首行，不展开段落列表', () => {
      const { workflow, todos } = makeWorkingTodos();
      // 把标题待办标记为进行中，段落批次待办保持 pending
      const titleTodo = todos.find((t) => t.text.includes('翻译章节标题'))!;
      TodoListService.markTodoAsWorking(titleTodo.id);

      const block = workflow.buildTodoContextBlock('working');
      // 当前项（标题）展开
      expect(block).toContain('翻译章节标题');
      // 非当前项（段落批次）折叠：首行可见，但段落 ID 明细不可见
      expect(block).toContain('处理全部段落');
      expect(block).not.toContain('p001');
      expect(block).not.toContain('p002');
    });

    test('没有任何项处于 working 时，应展开第一个未完成项', () => {
      // 放宽打卡协议后模型可能不再调用 mark_todo_working，
      // 此时仍必须让"当前该做的那一项"可见，否则模型看不到段落列表。
      const { workflow } = makeWorkingTodos();

      const block = workflow.buildTodoContextBlock('working');
      expect(block).toContain('翻译章节标题');
      // 第一个未完成项是标题待办，段落批次仍应折叠
      expect(block).not.toContain('p001');
    });

    test('已完成项始终折叠为首行', () => {
      const { workflow, todos } = makeWorkingTodos();
      const batchTodo = todos.find((t) => t.text.includes('p001'))!;
      TodoListService.markTodoAsDone(batchTodo.id);

      const block = workflow.buildTodoContextBlock('working');
      expect(block).toContain('✅');
      expect(block).not.toContain('p001');
    });
  });

  describe('4. 放宽打卡协议', () => {
    test('pending 待办应可直接标记 done（无需先 working）', () => {
      const todo = TodoListService.createTodo('直接完成', taskId);
      const updated = TodoListService.markTodoAsDone(todo.id);

      expect(updated.status).toBe('done');
    });

    test('已完成的待办重复标记 done 应保持幂等，不抛错', () => {
      const todo = TodoListService.createTodo('幂等测试', taskId);
      TodoListService.markTodoAsDone(todo.id);

      expect(() => TodoListService.markTodoAsDone(todo.id)).not.toThrow();
      expect(TodoListService.getTodoById(todo.id)!.status).toBe('done');
    });

    test('已完成的待办仍不允许回退为 working', () => {
      const todo = TodoListService.createTodo('回退测试', taskId);
      TodoListService.markTodoAsDone(todo.id);

      expect(() => TodoListService.markTodoAsWorking(todo.id)).toThrow();
    });

    test('gate 应接受直接从 pending 标记为 done 的待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('planning');

      todos.forEach((t) => TodoListService.markTodoAsDone(t.id));

      expect(workflow.checkGate('planning').allowed).toBe(true);
    });
  });
});
