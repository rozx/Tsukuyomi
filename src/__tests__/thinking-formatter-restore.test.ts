/**
 * useThinkingFormatter 回归测试：从 IndexedDB (`thinking-processes`) 恢复的历史任务
 * 在挂载时 thinkingMessage 已经存在、之后不会再变化。若 watch 不是 immediate，
 * 这类任务永远不会被解析，翻译进度面板选中历史任务时「思考过程」区块为空白。
 */
import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useThinkingFormatter } from 'src/composables/useThinkingFormatter';
import type { AIProcessingTask } from 'src/stores/ai-processing';

function makeTask(overrides: Partial<AIProcessingTask> = {}): AIProcessingTask {
  return {
    id: 'task-restored',
    type: 'translation',
    modelName: 'gpt-test',
    status: 'end',
    startTime: 1_700_000_000_000,
    ...overrides,
  };
}

const RESTORED_MESSAGE =
  '开始翻译第一章\n\n[调用工具: search_memories]\n\n[工具结果: {"success":true,"count":2}]\n\n翻译完成';

describe('useThinkingFormatter 历史任务恢复', () => {
  it('挂载时已存在 thinkingMessage 的任务无需任何后续变更即可得到格式化结果', async () => {
    const tasks = ref<AIProcessingTask[]>([makeTask({ thinkingMessage: RESTORED_MESSAGE })]);

    const scope = effectScope();
    let api!: ReturnType<typeof useThinkingFormatter>;
    scope.run(() => {
      api = useThinkingFormatter(tasks);
    });

    // 不做任何 thinkingMessage / status 变更，仅等待 watch 的 post flush
    await nextTick();

    const parts = api.getFormatted('task-restored');
    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0]).toEqual({ type: 'content', text: '开始翻译第一章' });
    expect(parts.some((p) => p.type === 'tool-call' && p.toolName === 'search_memories')).toBe(
      true,
    );
    expect(parts.some((p) => p.type === 'tool-result' && p.toolResultTone === 'success')).toBe(
      true,
    );

    scope.stop();
  });

  it('恢复任务的 tool-call tone 应按任务终态回填（已结束任务不应停留在 running）', async () => {
    const tasks = ref<AIProcessingTask[]>([
      makeTask({
        id: 'task-cancelled',
        status: 'cancelled',
        // 未闭合的工具调用：没有工具结果，tone 由 taskStatus 回退决定
        thinkingMessage: '准备中\n\n[调用工具: translate_paragraphs]',
      }),
    ]);

    const scope = effectScope();
    let api!: ReturnType<typeof useThinkingFormatter>;
    scope.run(() => {
      api = useThinkingFormatter(tasks);
    });

    await nextTick();

    const toolCall = api.getFormatted('task-cancelled').find((p) => p.type === 'tool-call');
    expect(toolCall?.toolCallTone).toBe('cancelled');

    scope.stop();
  });

  it('挂载后新加入列表的历史任务也应立即被格式化', async () => {
    const tasks = ref<AIProcessingTask[]>([]);

    const scope = effectScope();
    let api!: ReturnType<typeof useThinkingFormatter>;
    scope.run(() => {
      api = useThinkingFormatter(tasks);
    });
    await nextTick();

    tasks.value = [makeTask({ id: 'task-late', thinkingMessage: '稍后加载的历史思考' })];
    await nextTick();

    expect(api.getFormatted('task-late')).toEqual([
      { type: 'content', text: '稍后加载的历史思考' },
    ]);

    scope.stop();
  });
});
