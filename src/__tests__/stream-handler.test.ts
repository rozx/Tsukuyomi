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

    test('should not throw when content key is incomplete after working status', async () => {
      // 复现 Bug: AI 返回 {"s": "working"} 后返回 {"p": 系统仍然认为状态是 planning
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // Chunk 1: 状态变为 working（不需要 padding，因为长度小于 MIN_SCAN_LENGTH 会触发扫描）
      await callback({ text: '{"s": "working"}', done: false });

      // Chunk 2: 不完整的内容键 - 此时状态应该是 working，不应该报错
      // 注意：{"p": 后面没有实际内容，只是一个不完整的 JSON
      await callback({ text: '{"p":', done: false });

      // Should not throw - 状态应该已经是 working，不是 planning
    });

    test('should correctly track status when chunks arrive without padding', async () => {
      // 模拟真实的短消息流式传输，没有 padding
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // 第一批：状态声明（很短，小于 SCAN_DELAY_CHARS）
      await callback({ text: '{"s": "working"}', done: false });

      // 第二批：内容开始（也很短）
      // 如果状态没有正确更新为 working，这里会抛出错误
      await callback({ text: '{"p": [{"i": 0, "t": "test"}]}', done: false });
    });

    test('should handle rapid status then incomplete content key', async () => {
      // 模拟 AI 快速返回状态后紧跟不完整内容键的场景
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // 第一批：状态变为 working（使用 padding 确保扫描触发）
      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);
      await callback({ text: '{"s": "working"}' + padding, done: false });
      
      // 第二批：不完整的内容键 - 此时状态应该已经是 working
      await callback({ text: '{"p":', done: false });
    });

    test('should handle short status then immediate content key', async () => {
      // 复现用户报告的 Bug: 
      // AI 返回短消息 {"s": "working"} 后紧接着返回 {"p":
      // 如果第一批太短，第二批扫描时可能还没更新状态
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // 第一批：短状态消息（长度 16，会触发扫描因为 < MIN_SCAN_LENGTH=200）
      await callback({ text: '{"s": "working"}', done: false });
      
      // 第二批：不完整的内容键
      // 注意：这时候 accumulatedText 会累积为 {"s": "working"}{"p":
      // 如果状态正确更新为 working，不应该报错
      await callback({ text: '{"p":', done: false });
    });

    test('should handle consecutive JSON objects without newline', async () => {
      // 复现实际场景：AI 返回的 JSON 对象之间没有换行符
      // 例如：{"s": "working"}{"p":
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // 第一批：状态消息
      await callback({ text: '{"s": "working"}', done: false });
      
      // 第二批：紧接着的 JSON，没有换行分隔
      await callback({ text: '{"p":', done: false });
    });

    test('should reproduce user bug: no newline between status and content', async () => {
      // 用户报告：实际输出中没有换行符
      // AI 返回：{"s": "working"}{"p":
      // 系统错误报告 status=planning
      const config = createConfig({ 
        currentStatus: 'planning',
        taskType: 'translation',
      });
      const callback = createStreamCallback(config);

      // 模拟：第一批是状态，第二批是紧接着的内容键（无换行）
      await callback({ text: '{"s": "working"}', done: false });
      await callback({ text: '{"p":', done: false });
    });

    test('should handle single chunk with both status and content', async () => {
      // 模拟 AI 在一个 chunk 中返回状态和内容
      // 例如：{"s": "working"}{"p": [{"i": 0, "t": "test"}]}
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // 单个 chunk 包含状态和内容
      const chunk = '{"s": "working"}{"p": [{"i": 0, "t": "test"}]}';
      await callback({ text: chunk, done: false });
    });

    test('should handle continuous output without pause', async () => {
      // 复现用户报告：AI 连续输出没有停顿
      // {"s":"working"}{"p":[{"i":0,"t":"text"}]
      const config = createConfig({ currentStatus: 'planning' });
      const callback = createStreamCallback(config);

      // 模拟 AI 连续输出，没有换行分隔
      const chunk1 = '{"s":"working"}{"p":[{"';
      await callback({ text: chunk1, done: false });

      // 继续输出段落内容
      const chunk2 = 'i":0,"t":"test"}]}';
      await callback({ text: chunk2, done: false });
    });

    test('should handle exact user scenario: working then incomplete p array', async () => {
      // 用户报告的确切场景：
      // AI 输出 {"s":"working"}{"p":[{" 后系统报错 status=planning
      const config = createConfig({ 
        currentStatus: 'planning',
        taskType: 'translation',
      });
      const callback = createStreamCallback(config);

      // 这个 chunk 同时包含状态和内容开始
      // 应该识别为 working 状态，而不是 planning
      const chunk = '{"s":"working"}{"p":[{"';
      await callback({ text: chunk, done: false });
    });

    test('should call onStatusChange when status updates', async () => {
      // 验证状态更新时会调用 onStatusChange 回调
      const statusHistory: TaskStatus[] = [];
      const config = createConfig({
        currentStatus: 'planning',
        taskType: 'translation',
        onStatusChange: (newStatus: TaskStatus) => {
          statusHistory.push(newStatus);
        },
      });
      const callback = createStreamCallback(config);

      // 使用 padding 确保扫描触发
      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);
      await callback({ text: '{"s": "working"}' + padding, done: false });

      // 验证 onStatusChange 被调用且状态正确
      expect(statusHistory.length).toBeGreaterThan(0);
      expect(statusHistory[statusHistory.length - 1]).toBe('working');
    });

    test('should use updated status from onStatusChange for new callback', async () => {
      // 模拟 AI 调用工具后创建新 callback 的场景
      // 验证新 callback 使用更新后的状态，而不是初始状态
      let sharedStatus: TaskStatus = 'planning';
      const onStatusChange = (newStatus: TaskStatus) => {
        sharedStatus = newStatus;
      };

      // 第一个 callback：更新状态到 working
      const config1 = createConfig({
        currentStatus: 'planning',
        taskType: 'translation',
        onStatusChange,
      });
      const callback1 = createStreamCallback(config1);

      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);
      await callback1({ text: '{"s": "working"}' + padding, done: false });

      // 验证状态已更新
      expect((sharedStatus as string) === 'working').toBe(true);

      // 第二个 callback：使用更新后的状态
      // 模拟工具调用后创建新 callback 的场景
      const config2 = createConfig({
        currentStatus: sharedStatus, // 使用更新后的状态
        taskType: 'translation',
        onStatusChange,
      });
      const callback2 = createStreamCallback(config2);

      // 这个内容不应该触发错误，因为状态是 working
      await callback2({ text: '{"p": [{"i": 0, "t": "test"}]}' + padding, done: false });

      // 如果状态没有被正确传递，这里会抛出错误
    });

    test('should maintain status across multiple callbacks simulating tool calls', async () => {
      // 完整模拟工具调用场景：
      // 1. AI 返回 working 状态
      // 2. AI 调用工具
      // 3. AI 继续返回内容（新的 callback）
      let currentStatus: TaskStatus = 'planning';
      const onStatusChange = (newStatus: TaskStatus) => {
        currentStatus = newStatus;
      };

      // Round 1: 获取 working 状态
      const callback1 = createStreamCallback({
        ...createConfig({ currentStatus: 'planning' }),
        onStatusChange,
      });

      const padding = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.repeat(2);
      await callback1({ text: '{"s": "working"}' + padding, done: false });
      expect((currentStatus as string) === 'working').toBe(true);

      // Round 2: 模拟工具调用后的新流（使用更新后的状态）
      const callback2 = createStreamCallback({
        ...createConfig({ currentStatus }), // 使用共享状态
        onStatusChange,
      });

      // 应该正常工作，不会报错
      await callback2({ text: '{"p": [{"i": 0, "t": "段落1"}]}' + padding, done: false });
      expect((currentStatus as string) === 'working').toBe(true); // 状态保持 working

      // Round 3: 再次工具调用后继续
      const callback3 = createStreamCallback({
        ...createConfig({ currentStatus }),
        onStatusChange,
      });

      await callback3({ text: '{"p": [{"i": 1, "t": "段落2"}]}' + padding, done: false });
      expect((currentStatus as string) === 'working').toBe(true);
    });
  });
});
