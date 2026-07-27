import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { AIProcessingTask, AIProcessingTaskStatus } from 'src/stores/ai-processing';
import { useStreamVisibility } from 'src/composables/translation-progress/useStreamVisibility';

function makeTask(patch: Partial<AIProcessingTask> = {}): AIProcessingTask {
  return {
    id: 't1',
    type: 'translation',
    modelName: 'gpt-test',
    status: 'thinking' as AIProcessingTaskStatus,
    startTime: 0,
    ...patch,
  };
}

describe('useStreamVisibility', () => {
  it('运行中任务即使还没有思考内容也要展示思考区', () => {
    const { isActive, hasThinking, showThinking, showPanel } = useStreamVisibility(
      makeTask({ status: 'processing' }),
    );
    expect(isActive.value).toBe(true);
    expect(hasThinking.value).toBe(false);
    expect(showThinking.value).toBe(true);
    expect(showPanel.value).toBe(true);
  });

  it('终态任务且无内容时整个面板隐藏', () => {
    const { isActive, showThinking, hasOutput, showPanel } = useStreamVisibility(
      makeTask({ status: 'end' }),
    );
    expect(isActive.value).toBe(false);
    expect(showThinking.value).toBe(false);
    expect(hasOutput.value).toBe(false);
    expect(showPanel.value).toBe(false);
  });

  it('终态任务留有思考或输出内容时仍然展示面板', () => {
    const thinkingOnly = useStreamVisibility(
      makeTask({ status: 'end', thinkingMessage: '推理内容' }),
    );
    expect(thinkingOnly.showThinking.value).toBe(true);
    expect(thinkingOnly.showPanel.value).toBe(true);

    const outputOnly = useStreamVisibility(makeTask({ status: 'end', outputContent: '译文' }));
    expect(outputOnly.showThinking.value).toBe(false);
    expect(outputOnly.hasOutput.value).toBe(true);
    expect(outputOnly.showPanel.value).toBe(true);
  });

  it('纯空白内容不算有内容', () => {
    const { hasThinking, hasOutput, showPanel } = useStreamVisibility(
      makeTask({ status: 'end', thinkingMessage: '  \n ', outputContent: '\t' }),
    );
    expect(hasThinking.value).toBe(false);
    expect(hasOutput.value).toBe(false);
    expect(showPanel.value).toBe(false);
  });

  it('活动指示器只在运行中且已有内容时点亮', () => {
    const idle = useStreamVisibility(makeTask({ status: 'end', outputContent: '译文' }));
    expect(idle.isThinkingActive.value).toBe(false);
    expect(idle.isOutputActive.value).toBe(false);

    const running = useStreamVisibility(
      makeTask({ status: 'thinking', thinkingMessage: '推理', outputContent: '译文' }),
    );
    expect(running.isThinkingActive.value).toBe(true);
    expect(running.isOutputActive.value).toBe(true);
  });

  it('接受 ref / getter 并随任务变化重新求值', () => {
    const task = ref(makeTask({ status: 'end' }));
    const { showPanel, hasOutput } = useStreamVisibility(() => task.value);
    expect(showPanel.value).toBe(false);

    task.value = makeTask({ status: 'end', outputContent: '译文' });
    expect(hasOutput.value).toBe(true);
    expect(showPanel.value).toBe(true);
  });
});
