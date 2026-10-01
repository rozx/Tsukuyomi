import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { TranslationService } from '../services/ai';
import { ChapterContentService } from '../services/chapter-content-service';
import { BookService } from '../services/book-service';
import { deferred } from './web-locks-fixture';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});
async function setup() {
  const chapterA = translationChapter('chapter-a', '11111111');
  const chapterB = translationChapter('chapter-b', '22222222');
  const fixture = await chapterTranslationFixture([chapterA, chapterB]);
  dispose = fixture.dispose;
  return { ...fixture, chapterA, chapterB };
}
const result = { text: '', actions: [] };

describe('useChapterTranslation - 章节切换和并发写回', () => {
  it('切换并卸载原章节后，仍写回执行章节且不覆盖当前界面', async () => {
    const { mount, books, chapterA, chapterB } = await setup();
    const { service, selected, loaded } = mount(chapterA);
    vi.spyOn(TranslationService, 'translate').mockImplementation(
      async (_paragraphs, _model, options) => {
        selected.value = chapterB;
        loaded.value = chapterB;
        const old = books.getBookById('fixture-book')!.volumes![0]!.chapters![0]!;
        old.content = undefined;
        old.contentLoaded = false;
        await options?.onParagraphTranslation?.([{ id: '11111111', translation: 'Result A' }]);
        return result;
      },
    );
    await service.translateAllParagraphs();
    expect(loaded.value?.id).toBe(chapterB.id);
    const savedA = await ChapterContentService.loadChapterContent(chapterA.id);
    const savedB = await ChapterContentService.loadChapterContent(chapterB.id);
    expect(savedA?.[0]?.translations[0]).toMatchObject({
      translation: 'Result A',
      language: 'en-US',
    });
    expect(savedB?.[0]?.translations).toEqual([]);
  });

  it('多个章节并发保存，不回存旧卷章元数据快照', async () => {
    const { mount, books, chapterA, chapterB } = await setup();
    const a = mount(chapterA);
    const b = mount(chapterB);
    const aSaved = deferred();
    const bSaved = deferred();
    vi.spyOn(TranslationService, 'translate').mockImplementation(
      async (_paragraphs, _model, options) => {
        if (options?.chapterId === chapterA.id) {
          await options.onParagraphTranslation?.([{ id: '11111111', translation: 'Result A' }]);
          aSaved.resolve();
          await bSaved.promise;
        } else {
          await aSaved.promise;
          await books.updateBook('fixture-book', { description: 'Changed during execution' });
          await options?.onParagraphTranslation?.([{ id: '22222222', translation: 'Result B' }]);
          bSaved.resolve();
        }
        return result;
      },
    );
    await Promise.all([a.service.translateAllParagraphs(), b.service.translateAllParagraphs()]);
    expect(
      (await ChapterContentService.loadChapterContent(chapterA.id))?.[0]?.translations[0]
        ?.translation,
    ).toBe('Result A');
    expect(
      (await ChapterContentService.loadChapterContent(chapterB.id))?.[0]?.translations[0]
        ?.translation,
    ).toBe('Result B');
    expect((await BookService.getBookById('fixture-book'))?.description).toBe(
      'Changed during execution',
    );
  });
});
