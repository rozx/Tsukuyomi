import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { TranslationService, PolishService, ProofreadingService } from '../services/ai';
import { useSettingsStore } from '../stores/settings';
import { deferred, webLocksFixture } from './web-locks-fixture';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const entryPoints = [
  'translateAllParagraphs',
  'continueTranslation',
  'retranslateParagraph',
  'polishParagraph',
  'proofreadParagraph',
  'polishAllParagraphs',
  'proofreadAllParagraphs',
] as const;
describe('正文任务启动语言', () => {
  for (const entry of entryPoints) {
    it(`${entry} 在首次异步读取前冻结语言，读取期间切换设置不改变执行`, async () => {
      const chapter = translationChapter('c', '11111111');
      chapter.content![0]!.translations = [
        { id: 'en', translation: 'English', language: 'en-US', aiModelId: '' },
      ];
      chapter.content![0]!.selectedTranslations = {
        'en-US': { value: 'en', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      };
      chapter.content!.push(...translationChapter('unused', '22222222').content!);
      vi.stubGlobal('navigator', { locks: webLocksFixture() });
      const fixture = await chapterTranslationFixture([chapter]);
      dispose = fixture.dispose;
      const { service } = fixture.mount(chapter);
      const settings = useSettingsStore();
      await settings.setUiLocale('en-US');
      const started = deferred();
      const resume = deferred();
      let firstRead = true;
      const refresh = fixture.books.refreshBookFromStorage.bind(fixture.books);
      vi.spyOn(fixture.books, 'refreshBookFromStorage').mockImplementation(async (...args) => {
        if (firstRead) {
          firstRead = false;
          started.resolve();
          await resume.promise;
        }
        return refresh(...args);
      });
      const taskMethods = [
        vi.spyOn(TranslationService, 'translate').mockResolvedValue({ text: '', actions: [] }),
        vi.spyOn(PolishService, 'polishSingle').mockResolvedValue({ text: '' } as never),
        vi.spyOn(ProofreadingService, 'proofreadSingle').mockResolvedValue({ text: '' } as never),
        vi.spyOn(PolishService, 'polish').mockResolvedValue({ text: '', actions: [] }),
        vi.spyOn(ProofreadingService, 'proofread').mockResolvedValue({ text: '', actions: [] }),
      ];
      const running =
        entry === 'retranslateParagraph' ||
        entry === 'polishParagraph' ||
        entry === 'proofreadParagraph'
          ? service[entry]('11111111')
          : service[entry]();
      await started.promise;
      await settings.setUiLocale('zh-TW');
      await fixture.books.updateBook('fixture-book', { targetLanguage: 'zh-TW' });
      resume.resolve();
      await running;
      const calls = taskMethods.flatMap((method) =>
        method.mock.calls.map((args) => args[2]?.languages),
      );
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ uiLocale: 'en-US', targetLanguage: 'en-US' });
      expect(Object.isFrozen(calls[0])).toBe(true);
    });
  }
});
