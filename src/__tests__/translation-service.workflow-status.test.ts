import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslationService } from 'src/services/ai/tasks/translation-service';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { Paragraph } from 'src/models/novel';
import { AIServiceFactory } from 'src/services/ai';
import { ToolRegistry } from 'src/services/ai/tools';
import * as TaskRunner from 'src/services/ai/tasks/utils/task-runner';
import * as ContextBuilder from 'src/services/ai/tasks/utils/context-builder';
import * as StreamHandler from 'src/services/ai/tasks/utils/stream-handler';
import * as Prompts from 'src/services/ai/tasks/prompts';
import * as TodoHelper from 'src/services/ai/tasks/utils/todo-helper';
import * as BooksStore from 'src/stores/books';

describe('TranslationService - workflowStatus 重置', () => {
  const mockGenerateText = vi.fn(() => Promise.resolve({ text: '' }));
  const mockGetTranslationTools = vi.fn(() => [] as any);
  const mockBuildTranslationSystemPrompt = vi.fn(() => 'system');
  const mockBuildBookContextSection = vi.fn(() => Promise.resolve(''));
  const mockBuildChapterContextSection = vi.fn(() => '');
  const mockBuildPreviousChapterSection = vi.fn(() => '');
  const mockBuildIndependentChunkPrompt = vi.fn(() => Promise.resolve('chunk'));
  const mockBuildMaintenanceReminder = vi.fn(() => '');
  const mockGetSpecialInstructions = vi.fn(() => undefined as string | undefined);
  const mockGetChapterFirstNonEmptyParagraphId = vi.fn(() => Promise.resolve(undefined));
  const mockGetHasPreviousParagraphs = vi.fn(() => false);
  const mockExecuteToolCallLoop = vi.fn(() =>
    Promise.resolve({
      responseText: '',
      status: 'end' as const,
      paragraphs: new Map(),
    }),
  );
  const mockCompleteTask = vi.fn(async () => {});
  const mockHandleTaskError = vi.fn(async () => {});
  const mockCreateUnifiedAbortController = vi.fn(() => ({
    controller: new AbortController(),
    cleanup: () => {},
  }));

  const aiProcessingStore = {
    activeTasks: [],
    addTask: vi.fn(() => Promise.resolve('task-1')),
    updateTask: vi.fn(async () => {}),
    appendThinkingMessage: vi.fn(async () => {}),
    appendOutputContent: vi.fn(async () => {}),
    removeTask: vi.fn(async () => {}),
  };

  const model: AIModel = {
    id: 'model-1',
    name: 'Test Model',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'http://test',
    temperature: 0.7,
    maxInputTokens: 128000,
    maxOutputTokens: 1000,
    isDefault: {
      translation: { enabled: true, temperature: 0.7 },
      proofreading: { enabled: true, temperature: 0.7 },
      termsTranslation: { enabled: true, temperature: 0.7 },
      assistant: { enabled: true, temperature: 0.7 },
    },
    lastEdited: new Date(),
  };

  const paragraphs: Paragraph[] = [
    { id: 'p1', text: '第1段', translations: [], selectedTranslationId: '' },
    { id: 'p2', text: '第2段', translations: [], selectedTranslationId: '' },
    { id: 'p3', text: '第3段', translations: [], selectedTranslationId: '' },
    { id: 'p4', text: '第4段', translations: [], selectedTranslationId: '' },
    { id: 'p5', text: '第5段', translations: [], selectedTranslationId: '' },
    { id: 'p6', text: '第6段', translations: [], selectedTranslationId: '' },
    { id: 'p7', text: '第7段', translations: [], selectedTranslationId: '' },
    { id: 'p8', text: '第8段', translations: [], selectedTranslationId: '' },
    { id: 'p9', text: '第9段', translations: [], selectedTranslationId: '' },
    { id: 'p10', text: '第10段', translations: [], selectedTranslationId: '' },
  ];

  beforeEach(() => {
    mockGenerateText.mockClear();
    mockGetTranslationTools.mockClear();
    mockBuildTranslationSystemPrompt.mockClear();
    mockBuildBookContextSection.mockClear();
    mockBuildChapterContextSection.mockClear();
    mockBuildPreviousChapterSection.mockClear();
    mockBuildIndependentChunkPrompt.mockClear();
    mockBuildMaintenanceReminder.mockClear();
    mockGetSpecialInstructions.mockClear();
    mockGetChapterFirstNonEmptyParagraphId.mockClear();
    mockGetHasPreviousParagraphs.mockClear();
    mockExecuteToolCallLoop.mockClear();
    mockCompleteTask.mockClear();
    mockHandleTaskError.mockClear();
    mockCreateUnifiedAbortController.mockClear();
    aiProcessingStore.addTask.mockClear();
    aiProcessingStore.updateTask.mockClear();
    aiProcessingStore.appendThinkingMessage.mockClear();
    aiProcessingStore.appendOutputContent.mockClear();
    aiProcessingStore.removeTask.mockClear();

    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: mockGenerateText,
    } as any);

    vi.spyOn(ToolRegistry, 'getTranslationTools').mockImplementation(mockGetTranslationTools);
    vi.spyOn(TodoHelper, 'getTodosSystemPrompt').mockReturnValue('');
    vi.spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      getBookById: () => undefined,
    } as any);

    vi.spyOn(Prompts, 'buildTranslationSystemPrompt').mockImplementation(
      mockBuildTranslationSystemPrompt,
    );

    vi.spyOn(TaskRunner, 'executeToolCallLoop').mockImplementation(mockExecuteToolCallLoop as any);

    vi.spyOn(ContextBuilder, 'buildBookContextSection').mockImplementation(
      mockBuildBookContextSection,
    );
    vi.spyOn(ContextBuilder, 'buildChapterContextSection').mockImplementation(
      mockBuildChapterContextSection,
    );
    vi.spyOn(ContextBuilder, 'buildPreviousChapterSection').mockImplementation(
      mockBuildPreviousChapterSection,
    );
    vi.spyOn(ContextBuilder, 'buildIndependentChunkPrompt').mockImplementation(
      mockBuildIndependentChunkPrompt,
    );
    vi.spyOn(ContextBuilder, 'buildMaintenanceReminder').mockImplementation(
      mockBuildMaintenanceReminder,
    );
    vi.spyOn(ContextBuilder, 'getSpecialInstructions').mockImplementation(
      mockGetSpecialInstructions,
    );
    vi.spyOn(ContextBuilder, 'getChapterFirstNonEmptyParagraphId').mockImplementation(
      mockGetChapterFirstNonEmptyParagraphId,
    );
    vi.spyOn(ContextBuilder, 'getHasPreviousParagraphs').mockImplementation(
      mockGetHasPreviousParagraphs,
    );

    vi.spyOn(StreamHandler, 'completeTask').mockImplementation(mockCompleteTask);
    vi.spyOn(StreamHandler, 'handleTaskError').mockImplementation(mockHandleTaskError);
    vi.spyOn(StreamHandler, 'createUnifiedAbortController').mockImplementation(
      mockCreateUnifiedAbortController,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('后续 chunk 开始时 workflowStatus 重置为 planning', async () => {
    await TranslationService.translate(paragraphs, model, {
      aiProcessingStore: aiProcessingStore as any,
      bookId: 'book-1',
      chapterId: 'chapter-1',
      chapterTitle: '标题',
      chunkSize: 100,
    });

    const planningCalls = (
      aiProcessingStore.updateTask.mock.calls as unknown as Array<
        [unknown, { workflowStatus?: string; message?: string }]
      >
    ).filter((call) => call?.[1]?.workflowStatus === 'planning');

    expect(planningCalls.length).toBe(2);
    for (const call of planningCalls) {
      const updates = call?.[1];
      expect(updates.workflowStatus).toBe('planning');
      expect(updates.message).toContain('正在翻译第');
    }
  });
});
