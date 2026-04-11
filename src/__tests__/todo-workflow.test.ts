import './setup';
import { TodoWorkflow } from 'src/services/ai/tasks/utils/todo-workflow';
import { TodoListService } from 'src/services/todo-list-service';
import { describe, test, expect, beforeEach } from 'bun:test';

describe('TodoWorkflow', () => {
  const taskId = 'test-task-workflow';

  beforeEach(() => {
    TodoListService.clearAllTodos();
  });

  describe('generateForState — template generation', () => {
    test('translation planning 应生成 5 个预定义待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('planning');

      expect(todos).toHaveLength(5);
      expect(todos[0]!.text).toContain('确认角色信息');
      expect(todos[1]!.text).toContain('确认术语信息');
      expect(todos[2]!.text).toContain('确认记忆信息');
      expect(todos[3]!.text).toContain('确认段落内容');
      expect(todos[4]!.text).toContain('获取前后文上下文');
      todos.forEach((t) => {
        expect(t.predefined).toBe(true);
        expect(t.status).toBe('pending');
      });
    });

    test('translation preparing 应生成 4 个预定义待办（含敬语）', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('preparing');

      expect(todos).toHaveLength(4);
      expect(todos[3]!.text).toContain('敬语');
    });

    test('polish preparing 应生成 4 个预定义待办（含敬语一致性检查）', () => {
      const workflow = new TodoWorkflow('polish', taskId);
      const todos = workflow.generateForState('preparing');

      expect(todos).toHaveLength(4);
      expect(todos[3]!.text).toContain('敬语');
    });

    test('translation review 应生成 4 个预定义待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('review');

      expect(todos).toHaveLength(4);
      expect(todos[0]!.text).toContain('翻译与原文一致性');
      expect(todos[2]!.text).toContain('add_translation_batch');
    });

    test('chapter_summary planning 应生成 2 个预定义待办', () => {
      const workflow = new TodoWorkflow('chapter_summary', taskId);
      const todos = workflow.generateForState('planning');

      expect(todos).toHaveLength(2);
    });

    test('chapter_summary working 应生成 1 个预定义待办', () => {
      const workflow = new TodoWorkflow('chapter_summary', taskId);
      const todos = workflow.generateForState('working');

      expect(todos).toHaveLength(1);
      expect(todos[0]!.text).toContain('生成章节摘要');
    });

    test('end 状态不应生成任何待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('end');

      expect(todos).toHaveLength(0);
    });
  });

  describe('generateForState — first-entry-only', () => {
    test('重复进入同一状态不应重新生成待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const first = workflow.generateForState('planning');
      const second = workflow.generateForState('planning');

      expect(first).toHaveLength(5);
      expect(second).toHaveLength(0);

      const allTodos = TodoListService.getTodosByTaskId(taskId);
      expect(allTodos).toHaveLength(5);
    });

    test('不同状态各自独立生成待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      workflow.generateForState('planning');
      workflow.generateForState('preparing');

      const allTodos = TodoListService.getTodosByTaskId(taskId);
      expect(allTodos).toHaveLength(9); // 5 + 4
    });
  });

  describe('generateForState — verbose working todos', () => {
    const chunkText = `[1] [ID: abc12345] 原文: これは最初の段落です。テスト
翻译:

[2] [ID: def67890] 原文: 次の段落は少し長くなります。
翻译:

[3] [ID: ghi11111] 原文: 三番目の段落です。
翻译:

`;

    test('应生成包含段落信息的 working 待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('working', {
        paragraphIds: ['abc12345', 'def67890', 'ghi11111'],
        chunkText,
        chunkIndex: 1,
        chapterTitle: undefined,
      });

      expect(todos).toHaveLength(1); // 3 paragraphs < 10, single batch
      expect(todos[0]!.text).toContain('abc12345');
      expect(todos[0]!.text).toContain('def67890');
      expect(todos[0]!.text).toContain('ghi11111');
      expect(todos[0]!.text).toContain('これは最初の段落です。テスト');
    });

    test('第一个 chunk 有标题时应生成标题翻译待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('working', {
        paragraphIds: ['abc12345'],
        chunkText: '[1] [ID: abc12345] 原文: テスト\n翻译: \n\n',
        chunkIndex: 0,
        chapterTitle: '第一章 はじまり',
      });

      expect(todos).toHaveLength(2); // title todo + batch todo
      expect(todos[0]!.text).toContain('翻译章节标题');
      expect(todos[0]!.text).toContain('第一章 はじまり');
    });

    test('非第一个 chunk 不应生成标题翻译待办', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('working', {
        paragraphIds: ['abc12345'],
        chunkText: '[1] [ID: abc12345] 原文: テスト\n翻译: \n\n',
        chunkIndex: 1,
        chapterTitle: '第一章 はじまり',
      });

      expect(todos).toHaveLength(1); // only batch todo, no title
      expect(todos[0]!.text).not.toContain('翻译章节标题');
    });
  });

  describe('checkGate', () => {
    test('所有预定义待办完成时应允许转换', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('planning');

      todos.forEach((t) => TodoListService.markTodoAsDone(t.id));
      const gate = workflow.checkGate('planning');

      expect(gate.allowed).toBe(true);
      expect(gate.incompleteItems).toHaveLength(0);
    });

    test('有未完成的预定义待办时应阻塞转换', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('planning');

      TodoListService.markTodoAsDone(todos[0]!.id);
      TodoListService.markTodoAsDone(todos[1]!.id);
      const gate = workflow.checkGate('planning');

      expect(gate.allowed).toBe(false);
      expect(gate.incompleteItems).toHaveLength(3);
    });

    test('agent 自创的 ad-hoc 待办不应阻塞转换', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('planning');

      todos.forEach((t) => TodoListService.markTodoAsDone(t.id));

      // 创建一个 ad-hoc 待办（没有 predefined 标记）
      TodoListService.createTodo('自定义待办', taskId);

      const gate = workflow.checkGate('planning');
      expect(gate.allowed).toBe(true);
    });

    test('未初始化的状态不应阻塞转换', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const gate = workflow.checkGate('planning');

      expect(gate.allowed).toBe(true);
    });
  });

  describe('buildTodoContextBlock', () => {
    test('应构建包含三种状态的上下文块', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const todos = workflow.generateForState('planning');

      TodoListService.markTodoAsDone(todos[0]!.id);
      TodoListService.markTodoAsWorking(todos[1]!.id);

      const block = workflow.buildTodoContextBlock('planning');

      expect(block).toContain('【待办清单】');
      expect(block).toContain('✅');
      expect(block).toContain('→');
      expect(block).toContain('☐');
      expect(block).toContain('当前任务');
      expect(block).toContain('完成所有待办后方可进入下一阶段');
    });

    test('所有待办完成时应显示完成消息', () => {
      const workflow = new TodoWorkflow('chapter_summary', taskId);
      const todos = workflow.generateForState('planning');

      todos.forEach((t) => TodoListService.markTodoAsDone(t.id));

      const block = workflow.buildTodoContextBlock('planning');

      expect(block).toContain('所有待办已完成，可以进入下一阶段');
    });

    test('无待办时应返回空字符串', () => {
      const workflow = new TodoWorkflow('translation', taskId);
      const block = workflow.buildTodoContextBlock('planning');

      expect(block).toBe('');
    });
  });

  describe('chunk 隔离（多 chunk 回归）', () => {
    // 回归测试：text-task-processor 漏传 chunkIndex 导致 TodoWorkflow 对所有 chunk 都用 0，
    // 结果 chunk 2 继承 chunk 1 的 done 待办，整个状态机被旁路，141/285 段落未被翻译。
    // 这组测试直接验证 TodoWorkflow 在 chunkIndex 正确传入后的隔离行为。

    const chunkText0 = '[1] [ID: p1] 原文: 第一段\n翻译: \n\n[2] [ID: p2] 原文: 第二段\n翻译: \n\n';
    const chunkText1 = '[3] [ID: p3] 原文: 第三段\n翻译: \n\n[4] [ID: p4] 原文: 第四段\n翻译: \n\n';

    test('chunk-1 应为 working/review 生成自己的待办，而非继承 chunk-0', () => {
      // chunk-0 完成所有状态的待办
      const workflow0 = new TodoWorkflow('translation', taskId, 0);
      const p0 = workflow0.generateForState('planning');
      const pr0 = workflow0.generateForState('preparing');
      const w0 = workflow0.generateForState('working', {
        paragraphIds: ['p1', 'p2'],
        chunkText: chunkText0,
        chunkIndex: 0,
      });
      const r0 = workflow0.generateForState('review');
      [...p0, ...pr0, ...w0, ...r0].forEach((t) => TodoListService.markTodoAsDone(t.id));

      // chunk-1 启动
      const workflow1 = new TodoWorkflow('translation', taskId, 1);
      const p1 = workflow1.generateForState('planning');
      const pr1 = workflow1.generateForState('preparing');
      const w1 = workflow1.generateForState('working', {
        paragraphIds: ['p3', 'p4'],
        chunkText: chunkText1,
        chunkIndex: 1,
      });
      const r1 = workflow1.generateForState('review');

      // 非零 chunk 的 planning/preparing 按设计跳过预定义生成
      expect(p1).toHaveLength(0);
      expect(pr1).toHaveLength(0);
      // working/review 必须正确创建（不被 chunk-0 的 hasGenerated 检查误判）
      expect(w1).toHaveLength(1);
      expect(w1[0]!.text).toContain('p3');
      expect(w1[0]!.text).toContain('p4');
      expect(w1[0]!.chunkIndex).toBe(1);
      expect(r1).toHaveLength(4);
      r1.forEach((t) => expect(t.chunkIndex).toBe(1));
    });

    test('chunk-1 的 checkGate 不应被 chunk-0 已完成的 working 待办误判为通过', () => {
      // chunk-0 working 全部完成
      const workflow0 = new TodoWorkflow('translation', taskId, 0);
      const w0 = workflow0.generateForState('working', {
        paragraphIds: ['p1'],
        chunkText: '[1] [ID: p1] 原文: 测试\n翻译: \n\n',
        chunkIndex: 0,
      });
      w0.forEach((t) => TodoListService.markTodoAsDone(t.id));

      // chunk-1 创建自己的 working 待办，尚未完成
      const workflow1 = new TodoWorkflow('translation', taskId, 1);
      workflow1.generateForState('working', {
        paragraphIds: ['p2'],
        chunkText: '[2] [ID: p2] 原文: 第二段\n翻译: \n\n',
        chunkIndex: 1,
      });

      const gate = workflow1.checkGate('working');
      expect(gate.allowed).toBe(false);
      expect(gate.incompleteItems).toHaveLength(1);
      expect(gate.incompleteItems[0]!.chunkIndex).toBe(1);
    });

    test('chunk-1 的 buildTodoContextBlock 不应包含 chunk-0 的待办', () => {
      // chunk-0 创建并完成 working 待办
      const workflow0 = new TodoWorkflow('translation', taskId, 0);
      const w0 = workflow0.generateForState('working', {
        paragraphIds: ['p1'],
        chunkText: '[1] [ID: p1] 原文: 测试\n翻译: \n\n',
        chunkIndex: 0,
      });
      w0.forEach((t) => TodoListService.markTodoAsDone(t.id));
      const chunk0TodoId = w0[0]!.id;

      // chunk-1 创建自己的 working 待办
      const workflow1 = new TodoWorkflow('translation', taskId, 1);
      const w1 = workflow1.generateForState('working', {
        paragraphIds: ['p2'],
        chunkText: '[2] [ID: p2] 原文: 第二段\n翻译: \n\n',
        chunkIndex: 1,
      });

      const block = workflow1.buildTodoContextBlock('working');
      expect(block).toContain(w1[0]!.id);
      expect(block).not.toContain(chunk0TodoId);
      expect(block).toContain('p2');
      expect(block).not.toContain('p1');
      // 不能出现"全部完成"误导 AI 提前结束
      expect(block).not.toContain('所有待办已完成');
    });

    test('chunk-1 的 planning 在非零 chunk 下 checkGate 默认放行', () => {
      // chunk-0 完成 planning 待办
      const workflow0 = new TodoWorkflow('translation', taskId, 0);
      const p0 = workflow0.generateForState('planning');
      p0.forEach((t) => TodoListService.markTodoAsDone(t.id));

      // chunk-1 调用 planning（应跳过生成，但标记 initialized）
      const workflow1 = new TodoWorkflow('translation', taskId, 1);
      const p1 = workflow1.generateForState('planning');
      expect(p1).toHaveLength(0);

      // chunk-1 的 planning 没有自己的 predefined 待办，gate 应放行
      const gate = workflow1.checkGate('planning');
      expect(gate.allowed).toBe(true);
      expect(gate.incompleteItems).toHaveLength(0);

      // buildTodoContextBlock 不应泄露 chunk-0 的 planning 待办
      const block = workflow1.buildTodoContextBlock('planning');
      expect(block).toBe('');
    });
  });
});
