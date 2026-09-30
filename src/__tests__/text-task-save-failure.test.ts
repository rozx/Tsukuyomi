import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { TranslationService, PolishService, ProofreadingService } from '../services/ai';
import { useAIModelsStore } from '../stores/ai-models';
import { useAIProcessingStore } from '../stores/ai-processing';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { TodoListService } from '../services/todo-list-service';
import { createAIProcessingStoreAdapter } from '../services/ai/tasks/utils/task-types';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
const call = (name: string, args: unknown, turn: number) =>
  Promise.resolve({
    text: '',
    toolCalls: [
      {
        id: `call-${turn}`,
        type: 'function' as const,
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
afterEach(() => {
  vi.restoreAllMocks();
  TodoListService.clearAllTodos();
});

describe('正文结果保存失败', () => {
  for (const kind of ['translation', 'polish', 'proofreading', 'title'] as const) {
    it(`${kind} 保存拒绝必须向上抛出，不能继续请求模型或报告完成`, async () => {
      const chapter = translationChapter('c', '11111111');
      if (kind === 'title') chapter.title = 'Original';
      chapter.content![0]!.translations = [
        { id: 'en', translation: 'Existing English', language: 'en-US', aiModelId: '' },
      ];
      chapter.content![0]!.selectedTranslations = {
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      };
      await chapterTranslationFixture([chapter]);
      const store = useAIProcessingStore();
      let requests = 0;
      vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
        generateText: () => {
          const task = store.activeTasks.at(-1)!;
          for (const todo of TodoListService.getTodosByTaskId(task.id))
            if (todo.status !== 'done') TodoListService.markTodoAsDone(todo.id);
          requests++;
          if (requests === 1) return call('update_task_status', { status: 'working' }, requests);
          if (requests === 2 && kind === 'title')
            return call(
              'update_chapter_title',
              { chapter_id: 'c', title_translation: 'English title' },
              requests,
            );
          if (requests === 2 || (requests === 3 && kind === 'title'))
            return call(
              'add_translation_batch',
              {
                paragraphs: [
                  {
                    paragraph_id: '11111111',
                    original_text_prefix: 'source',
                    translated_text: 'New English',
                  },
                ],
              },
              requests,
            );
          if ((kind === 'translation' && requests === 3) || (kind === 'title' && requests === 4))
            return call('update_task_status', { status: 'review' }, requests);
          if (requests > 7) throw new Error('UNEXPECTED_LOOP');
          return call('update_task_status', { status: 'end' }, requests);
        },
      } as never);
      const failure = new Error('RESULT_STORAGE_REJECTED');
      const rejectSave = vi.fn(() => Promise.reject(failure));
      const options = {
        bookId: 'fixture-book',
        chapterId: 'c',
        ...(kind === 'title' ? { chapterTitle: 'Original' } : {}),
        languages: captureExecutionLanguages('en-US'),
        aiProcessingStore: createAIProcessingStoreAdapter(store),
        ...(kind === 'title'
          ? { onTitleTranslation: rejectSave }
          : { onParagraphTranslation: rejectSave }),
        onParagraphPolish: rejectSave,
        onParagraphProofreading: rejectSave,
      };
      const model = useAIModelsStore().models[0]!;
      const running =
        kind === 'polish'
          ? PolishService.polish(chapter.content!, model, options)
          : kind === 'proofreading'
            ? ProofreadingService.proofread(chapter.content!, model, options)
            : TranslationService.translate(chapter.content!, model, options);
      await expect(running).rejects.toBe(failure);
      expect(rejectSave).toHaveBeenCalledTimes(1);
      expect(requests).toBe(2);
      expect(store.activeTasks.some((task) => task.status === 'end')).toBe(false);
    });
  }
});
