import { describe, test, expect } from 'bun:test';
import { createStreamCallback } from '../services/ai/tasks/utils/stream-handler';

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
      taskType: 'translation' as const,
      abortController: new AbortController(),
      ...overrides,
    });

    test('should process text chunks without throwing', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      const chunks = ['Hello, ', 'world!', ' This is a test.'];

      for (const chunk of chunks) {
        await callback({ text: chunk, done: false });
      }

      // Should not throw
    });

    test('should handle reasoning content', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      await callback({ text: 'output', reasoningContent: 'thinking...', done: false });

      // Should not throw
    });

    test('should handle empty chunks', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      await callback({ text: '', done: false });
      await callback({ text: '', done: true });

      // Should not throw
    });

    test('should not throw when processing normal text (no JSON parsing)', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      // In the new tool-based approach, status/content are handled via tool calls
      // not JSON parsing, so these should be treated as normal text
      const chunks = [
        '{"s": "working"}',
        '{"p": [{"i": 0, "t": "translation"}]}',
        'Some normal text output',
      ];

      for (const chunk of chunks) {
        await callback({ text: chunk, done: false });
      }

      // Should not throw - no JSON parsing in stream handler anymore
    });

    test('should handle large text without memory issues', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      // Simulate large output with varied text to avoid triggering degradation detection
      const sentences = Array.from(
        { length: 100 },
        (_, i) => `This is sentence number ${i} with some varied content. `,
      );
      const largeChunk = sentences.join('');

      for (let i = 0; i < 10; i++) {
        await callback({ text: largeChunk, done: false });
      }

      // Should not throw or cause memory issues
    });

    test('should handle done signal', async () => {
      const config = createConfig();
      const callback = createStreamCallback(config);

      await callback({ text: 'final chunk', done: false });
      await callback({ text: '', done: true });

      // Should complete without error
    });
  });
});
