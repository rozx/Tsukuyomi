import { describe, expect, it } from 'vitest';
import type { ActionInfo } from '../services/ai/tools/types';
import { agentText, translateText } from '../i18n/translate';
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
      // 返回给模型的说明为简中单源，与执行语言无关
      expect(result.error).toMatch(/^无效的状态值/);
    }
  });
  it('状态迁移说明为简中单源，界面操作名称使用执行语言，工作流枚举保留', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const store = useAIProcessingStore();
    const taskId = await store.addTask({
      type: 'translation',
      status: 'processing',
      workflowStatus: 'planning',
      modelName: 'Fixture',
    });
    const actions: ActionInfo[] = [];
    const context = {
      taskId,
      aiProcessingStore: createAIProcessingStoreAdapter(store),
      languages: captureExecutionLanguages('en-US'),
      onAction: (action: ActionInfo) => actions.push(action),
    };
    const invalid = JSON.parse(await handler({ status: 'end' }, context));
    expect(invalid.error_code).toBe('TASK_TRANSITION_INVALID');
    expect(invalid.error).toBe(
      agentText('aiTaskFeedback.invalidTransition', { previous: 'planning', next: 'end' }),
    );
    expect(store.activeTasks.find((task) => task.id === taskId)!.workflowStatus).toBe('planning');
    const changed = JSON.parse(await handler({ status: 'working' }, context));
    expect(changed.message).toBe(
      agentText('aiTaskFeedback.changed', { previous: 'planning', next: 'working' }),
    );
    // 操作名称展示在界面上，保持执行的英文
    expect((actions[0]!.data as { name: string }).name).toBe(
      translateText('en-US', 'aiTaskFeedback.actionName', {
        previous: 'planning',
        next: 'working',
      }),
    );
    expect(store.activeTasks.find((task) => task.id === taskId)!.workflowStatus).toBe('working');
  });
});
