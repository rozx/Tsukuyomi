import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { taskStatusTools } from '../services/ai/tools/task-status-tools';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import { executeToolCallLoop } from '../services/ai/tasks/utils/task-runner';
import { createAIProcessingStoreAdapter } from '../services/ai/tasks/utils/task-types';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { useAIProcessingStore } from '../stores/ai-processing';
import { TodoListService } from '../services/todo-list-service';
import type { AITool, AIToolCall } from '../services/ai/types/ai-service';
const statusTool = taskStatusTools.find(
  (entry) => entry.definition.function.name === 'update_task_status',
)!;
async function setup(englishBody: boolean, englishTitle: boolean) {
  const chapter = translationChapter('c', '11111111');
  chapter.title = 'Original';
  chapter.content![0]!.translations = [
    { id: 'cn', translation: 'CN_BODY', language: 'zh-CN', aiModelId: '' },
  ];
  chapter.content![0]!.selectedTranslationId = 'cn';
  if (englishBody) {
    chapter.content![0]!.translations.push({
      id: 'en',
      translation: 'English body',
      language: 'en-US',
      aiModelId: '',
    });
    chapter.content![0]!.selectedTranslations = {
      'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    };
  }
  const { books } = await chapterTranslationFixture([chapter]);
  if (englishTitle)
    await books.editTitle('fixture-book', 'en-US', {
      kind: 'chapter',
      id: 'c',
      expectedOriginal: 'Original',
      translation: 'English title',
    });
  const store = useAIProcessingStore();
  const taskId = await store.addTask({
    type: 'translation',
    modelName: 'Fixture',
    status: 'processing',
    workflowStatus: 'working',
    bookId: 'fixture-book',
    chapterId: 'c',
  });
  return { taskId, adapter: createAIProcessingStoreAdapter(store) };
}
afterEach(() => {
  vi.restoreAllMocks();
  TodoListService.clearAllTodos();
});

describe('任务门禁语言', () => {
  it('首块英文标题和正文齐全时可复核，不能只看简中标题投影', async () => {
    const { taskId, adapter } = await setup(true, true);
    const result = JSON.parse(
      await statusTool.handler(
        { status: 'review' },
        {
          bookId: 'fixture-book',
          taskId,
          aiProcessingStore: adapter,
          languages: captureExecutionLanguages('en-US'),
        },
      ),
    );
    expect(result).toMatchObject({ success: true, new_status: 'review' });
  });
  it('有简中正文但没有英文选用时，后续块的数据库校验拒绝复核', async () => {
    const { taskId, adapter } = await setup(false, false);
    const result = JSON.parse(
      await statusTool.handler(
        { status: 'review' },
        {
          bookId: 'fixture-book',
          taskId,
          aiProcessingStore: adapter,
          chunkIndex: 1,
          languages: captureExecutionLanguages('en-US'),
        },
      ),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('11111111');
  });
  it('非空原始标题字符串不算英文标题译文', async () => {
    const { taskId, adapter } = await setup(true, false);
    const result = JSON.parse(
      await statusTool.handler(
        { status: 'review' },
        {
          bookId: 'fixture-book',
          taskId,
          aiProcessingStore: adapter,
          languages: captureExecutionLanguages('en-US'),
        },
      ),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('标题');
  });
  it('复核中的数据库交叉读取不会把简中版本载入英文结果映射', async () => {
    const { taskId, adapter } = await setup(false, false);
    vi.spyOn(ToolRegistry, 'handleToolCall').mockImplementation((call) =>
      Promise.resolve({
        role: 'tool',
        name: call.function.name,
        tool_call_id: call.id,
        content: JSON.stringify({
          success: true,
          new_status: JSON.parse(call.function.arguments).status,
        }),
      }),
    );
    let turn = 0;
    const tools: AITool[] = [statusTool.definition];
    const result = await executeToolCallLoop({
      history: [{ role: 'system', content: 'Fixture' }],
      tools,
      languages: captureExecutionLanguages('en-US'),
      generateText: () => {
        for (const todo of TodoListService.getTodosByTaskId(taskId))
          if (todo.status !== 'done') TodoListService.markTodoAsDone(todo.id);
        turn++;
        if (turn === 3 || turn === 4)
          return Promise.resolve({ text: 'Review the existing results' });
        const status = turn === 1 ? 'working' : turn === 2 ? 'review' : 'end';
        const call: AIToolCall = {
          id: `call-${turn}`,
          type: 'function',
          function: { name: 'update_task_status', arguments: JSON.stringify({ status }) },
        };
        return Promise.resolve({ text: '', toolCalls: [call] });
      },
      aiServiceConfig: { apiKey: '', model: 'fixture' },
      taskType: 'translation',
      chunkText: '[ID: 11111111] source',
      paragraphIds: ['11111111'],
      bookId: 'fixture-book',
      handleAction: () => {},
      onToast: undefined,
      taskId,
      aiProcessingStore: adapter,
      logLabel: 'Fixture',
      maxTurns: 5,
      chunkIndex: 1,
    });
    expect(result.paragraphs.size).toBe(0);
  });
});
