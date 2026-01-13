import './setup';
import { describe, test, expect } from 'bun:test';
import { normalizeAIProcessingTaskStatus } from 'src/stores/ai-processing';

describe('AIProcessingStore status migration', () => {
  test('旧状态 completed 应映射为 end', () => {
    expect(normalizeAIProcessingTaskStatus('completed')).toBe('end');
  });

  test('旧状态 review 应映射为 end', () => {
    expect(normalizeAIProcessingTaskStatus('review')).toBe('end');
  });

  test('未知状态应降级为 error（避免 UI 崩溃）', () => {
    expect(normalizeAIProcessingTaskStatus('unknown-status')).toBe('error');
  });
});

