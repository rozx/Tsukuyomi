import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { TranslationService } from 'src/services/ai/tasks/translation-service';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { Paragraph } from 'src/models/novel';
import { AIServiceFactory } from 'src/services/ai';
import { ToolRegistry } from 'src/services/ai/tools';
import { ChapterSummaryService } from 'src/services/ai/tasks/chapter-summary-service';
import * as TasksUtils from 'src/services/ai/tasks/utils';
import * as Prompts from 'src/services/ai/tasks/prompts';
import * as TodoHelper from 'src/services/ai/tasks/utils/todo-helper';
import * as BooksStore from 'src/stores/books';

describe('TranslationService - workflowStatus 重置', () => {
  const mockGenerateText = mock(() => Promise.resolve({ text: '' }));
  const mockGetTranslationTools = mock(() => [] as any);
  const mockBuildTranslationSystemPrompt = mock(() => 'system');
  const mockBuildBookContextSection = mock(() => Promise.resolve(''));
  const mockBuildChapterContextSection = mock(() => '');
  const mockBuildPreviousChapterSection = mock(() => '');
  const mockBuildIndependentChunkPrompt = mock(() => Promise.resolve('chunk'));
  const mockBuildMaintenanceReminder = mock(() => '');
  const mockGetSpecialInstructions = mock(() => Promise.resolve(undefined));
  const mockGetChapterFirstNonEmptyParagraphId = mock(() => Promise.resolve(undefined));
  const mockGetHasPreviousParagraphs = mock(() => false);
  const mockExecuteToolCallLoop = mock(() =>
    Promise.resolve({
      responseText: '',
      status: 'end' as const,
      paragraphs: new Map(),
    }),
  );
  const mockCompleteTask = mock(async () => {});
  const mockHandleTaskError = mock(async () => {});
  const mockCreateUnifiedAbortController = mock(() => ({
    controller: new AbortController(),
    cleanup: () => {},
  }));

  const aiProcessingStore = {
    activeTasks: [],
    addTask: mock(() => Promise.resolve('task-1')),
    updateTask: mock(async () => {}),
    appendThinkingMessage: mock(async () => {}),
    appendOutputContent: mock(async () => {}),
    removeTask: mock(async () => {}),
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
    maxTokens: 1000,
    isDefault: {
      translation: { enabled: true, temperature: 0.7 },
      proofreading: { enabled: true, temperature: 0.7 },
      termsTranslation: { enabled: true, temperature: 0.7 },
      assistant: { enabled: true, temperature: 0.7 },
    },
    lastEdited: new Date(),
  };

  const paragraphs: Paragraph[] = [
    { id: 'p1', text: '第一段', translations: [], selectedTranslationId: '' },
    { id: 'p2', text: '第二段', translations: [], selectedTranslationId: '' },
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

    spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: mockGenerateText,
    } as any);

    spyOn(ToolRegistry, 'getTranslationTools').mockImplementation(mockGetTranslationTools);
    spyOn(ChapterSummaryService, 'generateSummary').mockReturnValue(Promise.resolve(''));
    spyOn(TodoHelper, 'getTodosSystemPrompt').mockReturnValue('');
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      getBookById: () => undefined,
    } as any);

    spyOn(Prompts, 'buildTranslationSystemPrompt').mockImplementation(
      mockBuildTranslationSystemPrompt,
    );
    spyOn(TasksUtils, 'buildBookContextSection').mockImplementation(mockBuildBookContextSection);
    spyOn(TasksUtils, 'buildChapterContextSection').mockImplementation(
      mockBuildChapterContextSection,
    );
    spyOn(TasksUtils, 'buildPreviousChapterSection').mockImplementation(
      mockBuildPreviousChapterSection,
    );
    spyOn(TasksUtils, 'buildIndependentChunkPrompt').mockImplementation(
      mockBuildIndependentChunkPrompt,
    );
    spyOn(TasksUtils, 'buildMaintenanceReminder').mockImplementation(mockBuildMaintenanceReminder);
    spyOn(TasksUtils, 'getSpecialInstructions').mockImplementation(mockGetSpecialInstructions);
    spyOn(TasksUtils, 'getChapterFirstNonEmptyParagraphId').mockImplementation(
      mockGetChapterFirstNonEmptyParagraphId,
    );
    spyOn(TasksUtils, 'getHasPreviousParagraphs').mockImplementation(mockGetHasPreviousParagraphs);
    spyOn(TasksUtils, 'executeToolCallLoop').mockImplementation(mockExecuteToolCallLoop as any);
    spyOn(TasksUtils, 'completeTask').mockImplementation(mockCompleteTask);
    spyOn(TasksUtils, 'handleTaskError').mockImplementation(mockHandleTaskError);
    spyOn(TasksUtils, 'createUnifiedAbortController').mockImplementation(
      mockCreateUnifiedAbortController,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  test('后续 chunk 开始时 workflowStatus 重置为 planning', async () => {
    await TranslationService.translate(paragraphs, model, {
      aiProcessingStore: aiProcessingStore as any,
      bookId: 'book-1',
      chapterId: 'chapter-1',
      chapterTitle: '标题',
      chunkSize: 8,
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
