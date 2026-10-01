import { describe, expect, it } from 'vitest';
import './setup';
import { navigationTools } from '../services/ai/tools/navigation-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { setNameTranslation } from '../services/localization/selection';
import { BookService } from '../services/book-service';
import type { Novel } from '../models/novel';

const tool = (name: string) =>
  navigationTools.find((item) => item.definition.function.name === name)!.handler;

async function seedBook(): Promise<void> {
  let title = { original: '第1話', translation: { id: 't0', translation: '', aiModelId: '' } };
  title = setNameTranslation(
    title,
    'zh-CN',
    { id: 'tc', translation: '第一话', aiModelId: '', language: 'zh-CN' },
    { counter: 1, actorId: 'test' },
    0,
  );
  title = setNameTranslation(
    title,
    'en-US',
    { id: 'te', translation: 'Chapter One', aiModelId: '', language: 'en-US' },
    { counter: 2, actorId: 'test' },
    0,
  );
  const date = new Date(0);
  await BookService.saveBook({
    id: 'nav-book',
    title: 'Nav',
    targetLanguage: 'en-US',
    createdAt: date,
    lastEdited: date,
    volumes: [
      {
        id: 'v',
        title: { original: '本編', translation: { id: 'vt', translation: '', aiModelId: '' } },
        chapters: [
          {
            id: 'c1',
            title,
            createdAt: date,
            lastEdited: date,
            content: [{ id: 'p1', text: '原文', translations: [], selectedTranslationId: '' }],
          },
        ],
      },
    ],
  } as unknown as Novel);
}

describe('导航工具的章节标题语言', () => {
  it('navigate_to_chapter 与 navigate_to_paragraph 使用本次执行的目标语言标题', async () => {
    await seedBook();
    const context = { bookId: 'nav-book', languages: captureExecutionLanguages('en-US', 'en-US') };

    const chapter = JSON.parse(await tool('navigate_to_chapter')({ chapter_id: 'c1' }, context));
    expect(chapter.chapter_title).toBe('Chapter One');

    const paragraph = JSON.parse(
      await tool('navigate_to_paragraph')({ paragraph_id: 'p1' }, context),
    );
    expect(paragraph.chapter_title).toBe('Chapter One');
  });
});
