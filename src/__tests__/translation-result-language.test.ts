import { describe, expect, it } from 'vitest';
import './setup';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { saveLanguageParagraphResults } from '../services/ai/tasks/utils/save-language-results';
import type { Novel, Paragraph } from '../models/novel';

const source: Paragraph = {
  id: 'p',
  text: '原文',
  selectedTranslationId: 'cn',
  translations: [{ id: 'cn', translation: '简中', aiModelId: '' }],
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
          content: [source],
        },
      ],
    },
  ],
};

describe('执行结果语言保存', () => {
  it('宿主冻结的英文结果保留简中和当前繁中目标，重复结果不新增版本', async () => {
    await BookService.saveBook(book);
    const results = [{ id: 'p', translation: 'English', referencedMemories: ['memory'] }];
    await saveLanguageParagraphResults('b', 'c', 'en-US', 'model', [source], results);
    await saveLanguageParagraphResults('b', 'c', 'en-US', 'model', [source], results);
    const paragraph = (await ChapterContentService.loadChapterContent('c'))![0]!;
    expect(paragraph.translations).toHaveLength(2);
    const english = paragraph.translations.find((value) => value.language === 'en-US')!;
    expect(english.referencedMemories).toEqual(['memory']);
    expect(paragraph.selectedTranslations?.['en-US']?.value).toBe(english.id);
    expect(paragraph.selectedTranslationId).toBe('cn');
    expect((await BookService.getBookById('b'))?.targetLanguage).toBe('zh-TW');
  });
});
