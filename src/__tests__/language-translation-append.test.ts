import { describe, expect, it } from 'vitest';
import './setup';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import type { Novel } from '../models/novel';

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
          content: [
            {
              id: 'p',
              text: 'Alice',
              selectedTranslationId: 'cn',
              translations: [{ id: 'cn', translation: 'Alice', language: 'zh-CN', aiModelId: '' }],
            },
          ],
        },
      ],
    },
  ],
};

describe('执行语言追加译文', () => {
  it('晚到英文写入最新正文，不复用简中同文 ID，也不撤回繁中书籍目标', async () => {
    await BookService.saveBook(book);
    await BookService.editParagraphTranslations('b', 'c', 'en-US', [
      {
        type: 'append',
        paragraphId: 'p',
        originalText: 'Alice',
        translation: { id: 'en', translation: 'Alice', aiModelId: 'm' },
      },
    ]);
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations).toHaveLength(2);
    expect(saved.selectedTranslations?.['en-US']?.value).toBe('en');
    expect(saved.selectedTranslationId).toBe('cn');
    expect((await BookService.getBookById('b'))?.targetLanguage).toBe('zh-TW');
  });
  it('历史上限按语言计算，不选新译文时保留原选用，逐出后改选新版本', async () => {
    await BookService.saveBook(book);
    for (let index = 1; index <= 6; index++) {
      await BookService.editParagraphTranslations('b', 'c', 'en-US', [
        {
          type: 'append',
          paragraphId: 'p',
          originalText: 'Alice',
          selectNew: false,
          translation: { id: `en${index}`, translation: `Version ${index}`, aiModelId: '' },
        },
      ]);
      const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
      expect(saved.selectedTranslations?.['en-US']?.value).toBe(index <= 5 ? 'en1' : 'en6');
      expect(saved.selectedTranslationId).toBe('cn');
    }
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations.filter((value) => value.language === 'en-US')).toHaveLength(5);
    expect(saved.translations.some((value) => value.id === 'cn')).toBe(true);
  });
  it('删除只作用于目标语言，最后一个目标版本删除后不会选用简中', async () => {
    await BookService.saveBook(book);
    await BookService.editParagraphTranslations('b', 'c', 'en-US', [
      {
        type: 'append',
        paragraphId: 'p',
        originalText: 'Alice',
        translation: { id: 'en', translation: 'English', aiModelId: '' },
      },
    ]);
    await expect(
      BookService.editParagraphTranslations('b', 'c', 'en-US', [
        { type: 'remove', paragraphId: 'p', originalText: 'Alice', translationId: 'cn' },
      ]),
    ).rejects.toThrow('TRANSLATION_LANGUAGE_MISMATCH');
    await BookService.editParagraphTranslations('b', 'c', 'en-US', [
      { type: 'remove', paragraphId: 'p', originalText: 'Alice', translationId: 'en' },
    ]);
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.translations.map((value) => value.id)).toEqual(['cn']);
    expect(saved.selectedTranslations?.['en-US']?.value).toBeNull();
    expect(saved.selectedTranslationId).toBe('cn');
  });
  it('导入超过上限的历史后追加同文版本，复用的选用 ID 仍保留在历史中', async () => {
    const imported = structuredClone(book);
    const paragraph = imported.volumes![0]!.chapters![0]!.content![0]!;
    paragraph.translations.push(
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `en${index}`,
        translation: `Version ${index}`,
        language: 'en-US' as const,
        aiModelId: '',
      })),
    );
    await BookService.saveBook(imported);
    await BookService.editParagraphTranslations('b', 'c', 'en-US', [
      {
        type: 'append',
        paragraphId: 'p',
        originalText: 'Alice',
        translation: { id: 'new-id', translation: 'Version 0', aiModelId: '' },
      },
    ]);
    const saved = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(saved.selectedTranslations?.['en-US']?.value).toBe('en0');
    expect(saved.translations.some((value) => value.id === 'en0')).toBe(true);
    expect(saved.translations.filter((value) => value.language === 'en-US')).toHaveLength(5);
  });
});
