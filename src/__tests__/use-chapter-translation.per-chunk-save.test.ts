import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { TranslationService } from '../services/ai';
import { BookService } from '../services/book-service';
import { ChapterContentService } from '../services/chapter-content-service';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { deferred, webLocksFixture } from './web-locks-fixture';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup() {
  const chapter = translationChapter('chapter-a', '11111111');
  chapter.content!.push(...translationChapter('unused', '22222222').content!);
  const fixture = await chapterTranslationFixture([chapter]);
  dispose = fixture.dispose;
  return { ...fixture, ...fixture.mount(chapter) };
}
const load = () => ChapterContentService.loadChapterContent('chapter-a');
const result = { text: '', actions: [] };

describe('useChapterTranslation - 整章翻译按批落盘', () => {
  it('独占提交时，所有正文 AI 入口在读取执行快照前拒绝启动', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const { service } = await setup();
    const started = deferred();
    const finish = deferred();
    const commit = BookExecutionGuard.commit('fixture-book', async () => {
      started.resolve();
      await finish.promise;
    });
    await started.promise;
    const model = vi.spyOn(TranslationService, 'translate').mockResolvedValue(result);
    try {
      await service.translateAllParagraphs();
      await service.continueTranslation();
      await service.retranslateParagraph('11111111');
      await service.polishParagraph('11111111');
      await service.proofreadParagraph('11111111');
      await service.polishAllParagraphs();
      await service.proofreadAllParagraphs();
      expect(model).not.toHaveBeenCalled();
      expect(await load()).toHaveLength(2);
    } finally {
      finish.resolve();
      await commit;
    }
  });

  it('取消不会在结果保存入口返回之前释放书籍占用', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const { service } = await setup();
    const saving = deferred();
    const finishSave = deferred();
    const edit = BookService.editParagraphTranslations.bind(BookService);
    vi.spyOn(BookService, 'editParagraphTranslations').mockImplementation(async (...args) => {
      const saved = await edit(...args);
      saving.resolve();
      await finishSave.promise;
      return saved;
    });
    vi.spyOn(TranslationService, 'translate').mockImplementation(
      async (_paragraphs, _model, options) => {
        await options?.onParagraphTranslation?.([{ id: '11111111', translation: 'First result' }]);
        return result;
      },
    );
    const running = service.translateAllParagraphs();
    await saving.promise;
    try {
      service.cancelTranslation();
      await expect(BookExecutionGuard.commit('fixture-book', async () => {})).rejects.toThrow(
        'TARGET_BUSY',
      );
      expect((await load())?.[0]?.translations[0]?.translation).toBe('First result');
    } finally {
      finishSave.resolve();
      await running;
    }
    await expect(
      BookExecutionGuard.commit('fixture-book', async () => {}),
    ).resolves.toBeUndefined();
  });

  it('每批段落回调完成时结果已落盘，第二批保留第一批', async () => {
    const { service } = await setup();
    let firstPersisted = false;
    vi.spyOn(TranslationService, 'translate').mockImplementation(
      async (_paragraphs, _model, options) => {
        await options?.onParagraphTranslation?.([{ id: '11111111', translation: 'First result' }]);
        firstPersisted =
          (await load())?.[0]?.translations.some((value) => value.translation === 'First result') ??
          false;
        await options?.onParagraphTranslation?.([{ id: '22222222', translation: 'Second result' }]);
        return result;
      },
    );
    await service.translateAllParagraphs();
    expect(firstPersisted).toBe(true);
    const content = await load();
    expect(content?.[0]?.translations[0]?.translation).toBe('First result');
    expect(content?.[1]?.translations[0]?.translation).toBe('Second result');
  });

  it('翻译中途抛出时，已完成批次在异常发生前落盘', async () => {
    const { service } = await setup();
    let persistedBeforeAbort = false;
    vi.spyOn(TranslationService, 'translate').mockImplementation(
      async (_paragraphs, _model, options) => {
        await options?.onParagraphTranslation?.([{ id: '11111111', translation: 'First result' }]);
        persistedBeforeAbort =
          (await load())?.[0]?.translations.some((value) => value.translation === 'First result') ??
          false;
        throw new Error('请求已取消');
      },
    );
    await service.translateAllParagraphs();
    expect(persistedBeforeAbort).toBe(true);
    expect((await load())?.[0]?.translations[0]?.translation).toBe('First result');
  });
});
