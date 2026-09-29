import { describe, expect, it } from 'vitest';
import './setup';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { useUndoRedo } from '../composables/useUndoRedo';
import { ref } from 'vue';
import type { Novel, Paragraph } from '../models/novel';

const snapshot: Paragraph = {
  id: 'p',
  text: '原文',
  selectedTranslationId: 'cn',
  translations: [
    { id: 'cn', translation: '简中', language: 'zh-CN', aiModelId: '' },
    { id: 'en', translation: 'Before English edit', language: 'en-US', aiModelId: '' },
  ],
  selectedTranslations: {
    'zh-CN': { value: 'cn', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
  },
};
const book: Novel = {
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
          content: [snapshot],
        },
      ],
    },
  ],
};

describe('语言范围撤销恢复', () => {
  it('撤销及重做恢复原语言历史，目标切换和范围外修改保持', async () => {
    await BookService.saveBook(book);
    const current = ref<Novel | undefined>(book);
    const history = useUndoRedo(current, async (saved, scope) => {
      if (!scope) throw new Error('MISSING_SCOPE');
      const result = await BookService.restoreTranslationHistory(
        saved,
        scope.chapterId,
        scope.language,
      );
      current.value = {
        ...result.book,
        volumes: result.book.volumes?.map((volume) => ({
          ...volume,
          chapters: volume.chapters?.map((chapter) =>
            chapter.id === 'c' ? { ...chapter, content: result.content } : chapter,
          ),
        })),
      };
    });
    history.saveState('英文编辑', { kind: 'translation', chapterId: 'c', language: 'en-US' });
    const changed = await BookService.editParagraphTranslations('b', 'c', 'en-US', [
      {
        type: 'update',
        paragraphId: 'p',
        originalText: '原文',
        translationId: 'en',
        text: 'After edit',
      },
    ]);
    current.value = {
      ...changed.book,
      volumes: changed.book.volumes?.map((volume) => ({
        ...volume,
        chapters: volume.chapters?.map((chapter) => ({ ...chapter, content: changed.content })),
      })),
    };
    await BookService.editParagraphTranslations('b', 'c', 'zh-CN', [
      {
        type: 'update',
        paragraphId: 'p',
        originalText: '原文',
        translationId: 'cn',
        text: '新的简中',
      },
    ]);
    await history.undo();
    let saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations.find((value) => value.id === 'en')?.translation).toBe(
      'Before English edit',
    );
    expect(saved.translations.find((value) => value.id === 'cn')?.translation).toBe('新的简中');
    await history.redo();
    saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations.find((value) => value.id === 'en')?.translation).toBe('After edit');
    expect(saved.translations.find((value) => value.id === 'cn')?.translation).toBe('新的简中');
    expect((await BookService.getBookById('b'))?.targetLanguage).toBe('zh-TW');
  });
  it('恢复英文历史不撤回其他语言或当前书籍目标，选用使用新版本', async () => {
    await BookService.saveBook(book);
    await BookService.editParagraphTranslations('b', 'c', 'en-US', [
      {
        type: 'update',
        paragraphId: 'p',
        originalText: '原文',
        translationId: 'en',
        text: 'After English edit',
      },
    ]);
    await BookService.editParagraphTranslations('b', 'c', 'zh-CN', [
      {
        type: 'update',
        paragraphId: 'p',
        originalText: '原文',
        translationId: 'cn',
        text: '并发简中修改',
      },
    ]);
    await BookService.editParagraphTranslations('b', 'c', 'en-US', [
      {
        type: 'restore-language',
        paragraphId: 'p',
        originalText: '原文',
        translations: snapshot.translations.filter((value) => value.language === 'en-US'),
        selectedTranslationId: 'en',
      },
    ]);
    const restored = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(restored.translations.find((value) => value.id === 'en')?.translation).toBe(
      'Before English edit',
    );
    expect(restored.translations.find((value) => value.id === 'cn')?.translation).toBe(
      '并发简中修改',
    );
    expect(restored.selectedTranslations?.['en-US']?.revision.counter).toBeGreaterThan(1);
    expect((await BookService.getBookById('b'))?.targetLanguage).toBe('zh-TW');
  });
});
