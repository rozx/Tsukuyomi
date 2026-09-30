import { beforeEach, describe, expect, it } from 'vitest';
import './setup';
import { TodoWorkflow } from '../services/ai/tasks/utils/todo-workflow';
import { TodoListService } from '../services/todo-list-service';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
beforeEach(() => TodoListService.clearAllTodos());
describe('todo 执行语言和结构化预览', () => {
  it('英文预定义 todo 使用结构化原文，不解析翻译后的标签，恢复不重建且 gate 仅依赖状态', () => {
    const languages = captureExecutionLanguages('en-US', 'zh-CN');
    const workflow = new TodoWorkflow('translation', 'locale-task', 0, false, languages);
    const input = [{ id: '11111111', displayIndex: 4, originalText: '你好 Привет สวัสดี' }];
    const todos = workflow.generateForState('working', {
      paragraphIds: ['11111111'],
      paragraphInputs: input,
      chunkText: 'unrelated translated labels',
      chunkIndex: 0,
    });
    expect(todos[0]!.text).toContain('Process all paragraphs');
    expect(todos[0]!.text).toContain('[4] [11111111] 你好 Привет สวัสดี');
    expect(todos[0]!.uiLocale).toBe('en-US');
    expect(todos[0]!.paragraphInputs).toEqual(input);
    expect(workflow.checkGate('working').allowed).toBe(false);
    TodoListService.markTodoAsDone(todos[0]!.id);
    expect(workflow.checkGate('working').allowed).toBe(true);
    const restored = new TodoWorkflow(
      'translation',
      'locale-task',
      0,
      false,
      captureExecutionLanguages('zh-TW'),
    );
    expect(
      restored.generateForState('working', {
        paragraphIds: ['11111111'],
        paragraphInputs: input,
        chunkText: '',
        chunkIndex: 0,
      }),
    ).toEqual([]);
    expect(TodoListService.getTodosByTaskId('locale-task')[0]!.text).toContain(
      'Process all paragraphs',
    );
    expect(TodoListService.getTodosByTaskId('locale-task')).toHaveLength(1);
  });
});
