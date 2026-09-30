import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { BookService } from '../services/book-service';
import { LocalizedError } from '../utils/localized-error';
import { createTranslationTools } from '../services/ai/tools/translation-tools';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { useAIProcessingStore } from '../stores/ai-processing';
import { createAIProcessingStoreAdapter } from '../services/ai/tasks/utils/task-types';
import { ChapterContentService } from '../services/chapter-content-service';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';

async function fixture(locale: 'zh-CN' | 'zh-TW' | 'en-US') {
  await chapterTranslationFixture([translationChapter('c', '11111111')]);
  const store = useAIProcessingStore();
  const taskId = await store.addTask({
    type: 'translation',
    modelName: 'Fixture',
    status: 'processing',
    workflowStatus: 'working',
    bookId: 'fixture-book',
    chapterId: 'c',
  });
  return {
    enableOriginalTextValidation: true,
    bookId: 'fixture-book',
    taskId,
    aiProcessingStore: createAIProcessingStoreAdapter(store),
    aiModelId: 'fixture-model',
    languages: captureExecutionLanguages(locale, 'en-US'),
  };
}
afterEach(() => vi.restoreAllMocks());
const tool = createTranslationTools({ enableOriginalTextValidation: true }).find(
  (entry) => entry.definition.function.name === 'add_translation_batch',
)!;
describe('批次译文反馈语言与协议身份', () => {
  it('英文部分成功与长度警告三语接线完整，工具仍只验证不直接保存', async () => {
    const context = await fixture('en-US');
    await ChapterContentService.saveChapterContent(
      'c',
      [
        {
          id: '11111111',
          text: 'source one is quite long',
          translations: [],
          selectedTranslationId: '',
        },
        { id: '22222222', text: 'source second', translations: [], selectedTranslationId: '' },
      ],
      { bookId: 'fixture-book' },
    );
    const result = JSON.parse(
      await tool.handler(
        {
          paragraphs: [
            { paragraph_id: '11111111', original_text_prefix: 'source', translated_text: 'X' },
            {
              paragraph_id: '22222222',
              original_text_prefix: 'BAD',
              translated_text: 'New English',
            },
          ],
        },
        context,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.result_code).toBe('PARTIAL_SUCCESS');
    expect(result.processed_count).toBe(1);
    expect(result.message).toContain('Partial success');
    expect(result.failed_paragraphs[0].error_code).toBe('ORIGINAL_TEXT_PREFIX_MISMATCH');
    expect(result.quality_warnings.length).toBeGreaterThan(0);
    expect(result.quality_warnings.join(' ')).not.toMatch(/\p{Script=Han}/u);
    expect(
      (await ChapterContentService.loadChapterContent('c'))!.every(
        (paragraph) => paragraph.translations.length === 0,
      ),
    ).toBe(true);
  });
  it('批次等待书籍期间更换context语言也保留开始时反馈和目标', async () => {
    const context = await fixture('en-US');
    const original = BookService.getBookById.bind(BookService);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(BookService, 'getBookById').mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    });
    const pending = tool.handler(
      {
        paragraphs: [
          {
            paragraph_id: '11111111',
            original_text_prefix: 'source',
            translated_text: 'New English',
          },
        ],
      },
      context,
    );
    await entered.promise;
    context.languages = captureExecutionLanguages('zh-CN', 'zh-TW');
    release.resolve();
    const result = JSON.parse(await pending);
    expect(result.message).toContain('Processed');
    expect(result.task_type).toBe('translation');
    expect(result.accepted_paragraphs[0].translated_text).toBe('New English');
  });

  it('批次读取的自有异常按UI渲染，外部诊断保留且稳定code', async () => {
    const context = await fixture('en-US');
    const args = {
      paragraphs: [
        {
          paragraph_id: '11111111',
          original_text_prefix: 'source',
          translated_text: 'Next English',
        },
      ],
    };
    const read = vi
      .spyOn(BookService, 'getBookById')
      .mockRejectedValue(
        new LocalizedError('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', { id: 'source-book' }),
      );
    const owned = JSON.parse(await tool.handler(args, context));
    expect(owned.error_code).toBe('BOOK_NOT_FOUND');
    expect(owned.error).toBe('Batch processing failed: Book not found: source-book');
    read.mockRejectedValue({ message: 'provider 原始诊断 {x}|raw' });
    const external = JSON.parse(await tool.handler(args, context));
    expect(external.error_code).toBe('BATCH_PROCESS_ERROR');
    expect(external.error).toContain('provider 原始诊断 {x}|raw');
  });

  it('英文UI的缺引号细节及繁中UI的ASCII配对提示均本地化', async () => {
    const context = await fixture('en-US');
    await ChapterContentService.saveChapterContent(
      'c',
      [{ id: '11111111', text: '「Hello source」', translations: [], selectedTranslationId: '' }],
      { bookId: 'fixture-book' },
    );
    const missing = JSON.parse(
      await tool.handler(
        {
          paragraphs: [
            {
              paragraph_id: '11111111',
              original_text_prefix: '「Hello',
              translated_text: 'Missing quotes',
            },
          ],
        },
        { ...context, languages: captureExecutionLanguages('en-US', 'zh-CN') },
      ),
    );
    expect(missing.failed_paragraphs[0].error_code).toBe('PARAM_VALIDATION_FAILED');
    expect(missing.failed_paragraphs[0].error).not.toMatch(/\p{Script=Han}/u);
    const odd = JSON.parse(
      await tool.handler(
        {
          paragraphs: [
            {
              paragraph_id: '11111111',
              original_text_prefix: '「Hello',
              translated_text: '"Unpaired quote',
            },
          ],
        },
        { ...context, languages: captureExecutionLanguages('zh-TW', 'en-US') },
      ),
    );
    expect(odd.failed_paragraphs[0].error).toContain('成對');
  });

  it('书籍与模型前置错误不依赖显示字符串', async () => {
    const context = await fixture('en-US');
    const paragraphs = [
      { paragraph_id: '11111111', original_text_prefix: 'source', translated_text: 'Next English' },
    ];
    const { bookId: _book, ...withoutBook } = context;
    expect(JSON.parse(await tool.handler({ paragraphs }, withoutBook)).error_code).toBe(
      'BOOK_ID_MISSING',
    );
    const { aiModelId: _model, ...withoutModel } = context;
    expect(JSON.parse(await tool.handler({ paragraphs }, withoutModel)).error_code).toBe(
      'AI_MODEL_ID_MISSING',
    );
    const missing = JSON.parse(
      await tool.handler({ paragraphs }, { ...context, bookId: 'missing-book' }),
    );
    expect(missing.error_code).toBe('BOOK_NOT_FOUND');
    expect(missing.error).not.toMatch(/\p{Script=Han}/u);
  });

  for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
    it(`${locale} 旧index和缺id拒绝code与语言独立`, async () => {
      const context = await fixture(locale);
      for (const [paragraph, code] of [
        [
          { index: 0, original_text_prefix: 'source', translated_text: 'New English' },
          'LEGACY_INDEX_REJECTED',
        ],
        [
          { original_text_prefix: 'source', translated_text: 'New English' },
          'MISSING_PARAGRAPH_ID',
        ],
      ] as const) {
        const result = JSON.parse(await tool.handler({ paragraphs: [paragraph] }, context));
        expect(result.error_code).toBe(code);
        expect(result.invalid_items[0].reason).toBe(code);
        if (locale === 'en-US') expect(result.error).not.toMatch(/\p{Script=Han}/u);
      }
    });
  }
  it('成功反馈和动作概要用英文，实际译文与协议字段保持原样', async () => {
    const context = await fixture('en-US');
    const actions: unknown[] = [];
    const result = JSON.parse(
      await tool.handler(
        {
          paragraphs: [
            {
              paragraph_id: '11111111',
              original_text_prefix: 'source',
              translated_text: 'User 原文 {x}|text',
            },
          ],
        },
        { ...context, onAction: (action) => actions.push(action) },
      ),
    );
    expect(result.success).toBe(true);
    expect(result.processed_count).toBe(1);
    expect(result.message).toContain('Processed');
    expect(JSON.stringify(actions)).not.toContain('批量处理');
    expect(result.accepted_paragraphs[0].paragraph_id).toBe('11111111');
  });
  it('英文原文前缀和任务前置拒绝反馈有固定身份', async () => {
    const context = await fixture('en-US');
    const result = JSON.parse(
      await tool.handler(
        {
          paragraphs: [
            {
              paragraph_id: '11111111',
              original_text_prefix: 'BAD',
              translated_text: 'New English',
            },
          ],
        },
        context,
      ),
    );
    expect(result.failed_paragraphs[0].error_code).toBe('ORIGINAL_TEXT_PREFIX_MISMATCH');
    expect(result.failed_paragraphs[0].error).not.toMatch(/\p{Script=Han}/u);
    const missing = JSON.parse(
      await tool.handler({ paragraphs: [] }, { languages: captureExecutionLanguages('en-US') }),
    );
    expect(missing.error_code).toBe('AI_STORE_NOT_INITIALIZED');
    expect(missing.error).not.toMatch(/\p{Script=Han}/u);
  });
});
