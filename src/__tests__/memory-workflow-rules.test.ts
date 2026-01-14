import './setup';
import { describe, expect, test } from 'bun:test';
import { getMemoryWorkflowRules } from 'src/services/ai/tasks/prompts';

describe('getMemoryWorkflowRules', () => {
  test('应提示：记忆需短且优先合并更新（避免重复创建）', () => {
    const rules = getMemoryWorkflowRules();
    // 避免因 markdown 加粗或标点微调导致脆弱匹配：只断言关键约束语义存在
    expect(rules).toContain('对未来翻译任务有长期收益');
    expect(rules).toContain('一次性信息不要写入');
    expect(rules).toContain('合并');
    expect(rules).toContain('更新');
    expect(rules).toContain('默认不要新建');
    expect(rules).toContain('记忆必须');
  });
});
