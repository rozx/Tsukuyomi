import './setup';
import { describe, expect, test } from 'bun:test';
import { getMemoryWorkflowRules } from 'src/services/ai/tasks/prompts';

describe('getMemoryWorkflowRules', () => {
  test('应提示：只在对未来任务有长期收益时才创建记忆（避免一次性信息）', () => {
    const rules = getMemoryWorkflowRules();
    // 避免因 markdown 加粗或标点微调导致脆弱匹配：只断言关键约束语义存在
    expect(rules).toContain('对未来翻译任务有长期收益');
    expect(rules).toContain('一次性信息不要写入');
  });
});


