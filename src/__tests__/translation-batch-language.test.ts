import { describe, expect, it } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { useBooksStore } from '../stores/books';
import { useAIProcessingStore } from '../stores/ai-processing';
import { createTranslationTools } from '../services/ai/tools/translation-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { createAIProcessingStoreAdapter } from '../services/ai/tasks/utils/task-types';

describe('批次验证语言隔离', () => {
  it('只有简中同文版本时，英文提交不被判为当前选用重复', async () => {
    setActivePinia(createPinia());
    const books = useBooksStore();
    await books.addBook({
      id: 'b',
      title: '书',
      targetLanguage: 'zh-TW',
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [
        {
          id: 'v',
          title: '卷',
          chapters: [
            {
              id: 'c',
              title: '章',
              createdAt: new Date(0),
              lastEdited: new Date(0),
              content: [
                {
                  id: '11111111',
                  text: 'Alice',
                  selectedTranslationId: 'cn',
                  translations: [{ id: 'cn', translation: 'Alice', aiModelId: '' }],
                },
              ],
            },
          ],
        },
      ],
    });
    const processing = useAIProcessingStore();
    const taskId = await processing.addTask({
      type: 'polish',
      modelName: 'Fake',
      status: 'processing',
      workflowStatus: 'working',
      message: '',
      thinkingMessage: '',
      bookId: 'b',
      chapterId: 'c',
    });
    const tool = createTranslationTools().find(
      (value) => value.definition.function.name === 'add_translation_batch',
    )!;
    const result = JSON.parse(
      await tool.handler(
        {
          paragraphs: [
            { paragraph_id: '11111111', original_text_prefix: 'Alice', translated_text: 'Alice' },
          ],
        },
        {
          bookId: 'b',
          taskId,
          aiModelId: 'm',
          aiProcessingStore: createAIProcessingStoreAdapter(processing),
          languages: captureExecutionLanguages('en-US'),
        },
      ),
    );
    expect(result.success).toBe(true);
    expect(result.accepted_paragraphs).toEqual([
      { paragraph_id: '11111111', translated_text: 'Alice' },
    ]);
  });
});
