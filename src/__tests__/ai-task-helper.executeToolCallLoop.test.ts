import './setup';
import { describe, test, expect } from 'bun:test';
import type { ChatMessage, TextGenerationRequest, AIServiceConfig, AIToolCall } from 'src/services/ai/types/ai-service';
import { executeToolCallLoop } from 'src/services/ai/tasks/utils/ai-task-helper';

describe('executeToolCallLoop', () => {
  test('同一任务内重复输出同一段落/标题时，应允许更新（last-write-wins）', async () => {
    const calls: Array<{ paragraphs: Array<{ id: string; translation: string }> }> = [];
    const titleCalls: string[] = [];

    const responses = [
      { text: `{"status":"planning"}` },
      { text: `{"status":"working","paragraphs":[{"id":"p1","translation":"A"}],"titleTranslation":"T1"}` },
      { text: `{"status":"completed","paragraphs":[{"id":"p1","translation":"B"}],"titleTranslation":"T2"}` },
      { text: `{"status":"end"}` },
    ];

    let idx = 0;
    const generateText = (
      _config: AIServiceConfig,
      _request: TextGenerationRequest,
      _callback: unknown,
    ): Promise<{ text: string; toolCalls?: AIToolCall[]; reasoningContent?: string }> => {
      const r = responses[idx] ?? responses[responses.length - 1]!;
      idx++;
      return Promise.resolve({ text: r.text, reasoningContent: null as unknown as string });
    };

    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'start' },
    ];

    const result = await executeToolCallLoop({
      history,
      tools: [],
      generateText,
      aiServiceConfig: { apiKey: '', baseUrl: '', model: 'test' },
      taskType: 'translation',
      chunkText: 'original chunk text',
      paragraphIds: ['p1'],
      bookId: 'book1',
      handleAction: () => {},
      onToast: undefined,
      taskId: undefined,
      aiProcessingStore: undefined,
      logLabel: 'Test',
      maxTurns: 10,
      onParagraphsExtracted: (paragraphs) => {
        calls.push({ paragraphs });
      },
      onTitleExtracted: (title) => {
        titleCalls.push(title);
      },
    });

    expect(result.status).toBe('end');
    expect(result.paragraphs.get('p1')).toBe('B');
    expect(result.titleTranslation).toBe('T2');

    // 段落回调：第一次 A，第二次 B（同一ID的更新不应被忽略）
    expect(calls).toHaveLength(2);
    expect(calls[0]?.paragraphs).toEqual([{ id: 'p1', translation: 'A' }]);
    expect(calls[1]?.paragraphs).toEqual([{ id: 'p1', translation: 'B' }]);

    // 标题回调：同理应允许更新
    expect(titleCalls).toEqual(['T1', 'T2']);
  });
});

