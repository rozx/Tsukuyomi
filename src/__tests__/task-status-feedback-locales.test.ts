import { describe, expect, it } from 'vitest';
import './setup';
import { taskStatusTools } from '../services/ai/tools/task-status-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { createAIProcessingStoreAdapter } from '../services/ai/tasks/utils/task-types';
import { useAIProcessingStore } from '../stores/ai-processing';
const handler = taskStatusTools[0]!.handler;
describe('任务状态反馈语言', () => {
  it('非法状态错误码不依赖显示语言', async () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      const result = JSON.parse(
        await handler({ status: 'invalid' }, { languages: captureExecutionLanguages(locale) }),
      );
      expect(result.error_code).toBe('TASK_STATUS_INVALID');
      if (locale === 'en-US') expect(result.error).toContain('Invalid task status');
    }
  });
  it('状态迁移拒绝与成功说明使用执行语言，工作流枚举保留', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const store = useAIProcessingStore();
    const taskId = await store.addTask({
      type: 'translation',
      status: 'processing',
      workflowStatus: 'planning',
      modelName: 'Fixture',
    });
    const context = {
      taskId,
      aiProcessingStore: createAIProcessingStoreAdapter(store),
      languages: captureExecutionLanguages('en-US'),
    };
    const invalid = JSON.parse(await handler({ status: 'end' }, context));
    expect(invalid.error_code).toBe('TASK_TRANSITION_INVALID');
    expect(invalid.error).toContain('Invalid transition');
    expect(store.activeTasks.find((task) => task.id === taskId)!.workflowStatus).toBe('planning');
    const changed = JSON.parse(await handler({ status: 'working' }, context));
    expect(changed.message).toBe('Task status updated: planning → working');
    expect(store.activeTasks.find((task) => task.id === taskId)!.workflowStatus).toBe('working');
  });
});
