import { describe, test, expect } from 'bun:test';
import { createStreamCallback } from '../services/ai/tasks/utils/stream-handler';
import { type TaskStatus } from '../services/ai/tasks/utils/task-types';

describe('stream-handler', () => {
  describe('createStreamCallback', () => {
    const createConfig = (overrides = {}) => ({
      taskId: 'test-task-id',
      aiProcessingStore: {
        appendThinkingMessage: () => Promise.resolve(),
        appendOutputContent: () => Promise.resolve(),
        activeTasks: [],
        addTask: () => Promise.resolve('task-id'),
        updateTask: () => Promise.resolve(),
        removeTask: () => Promise.resolve(),
      } as any,
      originalText: 'some original text',
      logLabel: 'TestService',
      currentStatus: 'planning' as TaskStatus,
      taskType: 'translation' as const,
      abortController: new AbortController(),
      ...overrides,
    });

    test('should process valid standard JSON output', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      const chunks = ['{"s": "working"}', '{"p": [{"i": 0, "t": "translation"}]}'];

      for (const chunk of chunks) {
        await callback({ text: chunk, done: false });
      }

      // Should not throw
    });

    test('should handle case-insensitive status', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      // "S": "Working" should be treated as "s": "working"
      const chunks = ['{"S": "Working"}', '{"p": [{"i": 0, "t": "translation"}]}'];

      for (const chunk of chunks) {
        await callback({ text: chunk, done: false });
      }
      // Should not throw
    });

    test('should handle single quotes in JSON', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      // {'s': 'working'} should be valid
      const chunks = ["{'s': 'working'}", '{"p": [{"i": 0, "t": "translation"}]}'];

      for (const chunk of chunks) {
        await callback({ text: chunk, done: false });
      }
      // Should not throw
    });

    test('should throw on invalid status transition', () => {
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // planning -> review is invalid for translation
      const input = '{"s": "review"}';

      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);
      const paddedInput = input + padding;

      expect(() => callback({ text: paddedInput, done: false })).toThrow(/禁止的/);
    });

    test('should throw on invalid content state mismatch (content in planning)', () => {
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // Content in planning phase is not allowed
      const input = '{"p": [{"i": 0, "t": "translation"}]}';

      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);
      const paddedInput = input + padding;

      expect(() => callback({ text: paddedInput, done: false })).toThrow(/状态与内容不匹配/);
    });

    test('should handle mixed quotes and case', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      const chunks = [
        '{\'S\': "Working"}', // Mixed quotes and case
        '{"P": [{"i": 0, "t": "translation"}]}',
      ];

      for (const chunk of chunks) {
        await callback({ text: chunk, done: false });
      }

      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);
      await callback({ text: padding, done: false });
    });

    test('should correctly update state from stream to validate subsequent content', async () => {
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // Simulate a stream that switches to working then outputs content
      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);

      // Chunk 1: Switch to working
      const chunk1 = '{"s": "working"}' + padding;
      await callback({ text: chunk1, done: false });

      // Chunk 2: Output content (should be valid because state is now working)
      const chunk2 = '{"p": "content"}' + padding;
      await callback({ text: chunk2, done: false });

      // Should not throw
    });

    test('should handle split JSON chunks', async () => {
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // planning -> working
      // Split "working" across chunks
      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);

      const chunk1 = '{"s": "work';
      const chunk2 = 'ing"}' + padding;

      await callback({ text: chunk1, done: false });
      await callback({ text: chunk2, done: false });

      // Then content
      const chunk3 = '{"p": "ok"}' + padding;
      await callback({ text: chunk3, done: false });
    });
  });
});
