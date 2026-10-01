import { beforeEach, describe, expect, it } from 'vitest';
import { agentText } from '../i18n/translate';
import './setup';
import { TodoWorkflow } from '../services/ai/tasks/utils/todo-workflow';
import { TodoListService } from '../services/todo-list-service';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
beforeEach(() => TodoListService.clearAllTodos());
describe('todo 执行语言和结构化预览', () => {
  it('英文预定义 todo 使用结构化段落编号，不解析翻译后的标签，恢复不重建且 gate 仅依赖状态', () => {
    const languages = captureExecutionLanguages('en-US', 'zh-CN');
    const workflow = new TodoWorkflow('translation', 'locale-task', 0, false, languages);
    const input = [{ id: '11111111', displayIndex: 4 }];
    const todos = workflow.generateForState('working', {
      paragraphIds: ['11111111'],
      paragraphInputs: input,
      chunkText: 'unrelated translated labels',
      chunkIndex: 0,
    });
    expect(todos[0]!.text).toContain('Process all paragraphs');
    expect(todos[0]!.text).toContain('[4] [11111111]');
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
  it('待办文字按执行界面语言，注入模型的待办清单提示为简中单源', () => {
    const workflow = new TodoWorkflow(
      'translation',
      'reminder-task',
      0,
      false,
      captureExecutionLanguages('en-US', 'zh-CN'),
    );
    workflow.generateForState('working', {
      paragraphIds: ['11111111'],
      paragraphInputs: [{ id: '11111111', displayIndex: 1 }],
      chunkText: '',
      chunkIndex: 0,
    });
    const block = workflow.buildTodoContextBlock('working');
    // 待办条目本身是用户可见文字，保持英文
    expect(block).toContain('Process all paragraphs');
    // 清单标题与提醒只给模型阅读
    expect(block).toContain(agentText('aiWorkflow.header'));
    expect(block).toContain('⚠️ 当前任务：');
    expect(block).toContain(agentText('aiWorkflow.incomplete'));
  });
});
