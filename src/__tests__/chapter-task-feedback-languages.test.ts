import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { PolishService, TranslationService } from '../services/ai';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { useSettingsStore } from '../stores/settings';
import { useToastHistoryStore } from '../stores/toast-history';
import { deferred, webLocksFixture } from './web-locks-fixture';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import type { AppLocale } from '../models/locale';

const CJK = /[぀-ヿ㐀-鿿]/;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function setup(locale: AppLocale, translated = false) {
  const chapter = translationChapter('c', '11111111');
  if (translated) {
    chapter.content![0]!.translations = [
      { id: 't', translation: 'Existing', language: 'en-US', aiModelId: '' },
    ];
    chapter.content![0]!.selectedTranslations = {
      'en-US': { value: 't', revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    };
  }
  const fixture = await chapterTranslationFixture([chapter]);
  dispose = fixture.dispose;
  await useSettingsStore().setUiLocale(locale);
  return fixture.mount(chapter).service;
}

function toasts() {
  return useToastHistoryStore().historyItems.map((item) => ({
    summary: item.summary,
    detail: item.detail,
  }));
}

describe('章节任务反馈跟随界面语言', () => {
  it('英文界面：未翻译段落不能润色', async () => {
    const service = await setup('en-US');
    await service.polishParagraph('11111111');
    expect(toasts()).toContainEqual({
      summary: 'Polish failed',
      detail: 'This paragraph has no translation yet; translate it first',
    });
  });

  it('英文界面：整章校对没有可处理段落', async () => {
    const service = await setup('en-US');
    await service.proofreadAllParagraphs();
    expect(toasts()).toContainEqual({
      summary: 'Proofreading failed',
      detail: 'No paragraphs to proofread; translate the chapter first',
    });
  });

  it('英文界面：单段润色完成', async () => {
    const service = await setup('en-US', true);
    vi.spyOn(PolishService, 'polishSingle').mockResolvedValue({ text: '' } as never);
    await service.polishParagraph('11111111');
    expect(toasts()).toContainEqual({
      summary: 'Polish complete',
      detail: 'The paragraph was polished',
    });
  });

  it('繁中界面：整章翻译完成说明为繁体', async () => {
    const service = await setup('zh-TW');
    vi.spyOn(TranslationService, 'translate').mockResolvedValue({ text: '', actions: [] });
    await service.translateAllParagraphs();
    expect(toasts()).toContainEqual({ summary: '翻譯完成', detail: '已成功翻譯 0 個段落' });
  });

  it('英文界面：书籍被占用时任务未开始，说明不含中文', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const service = await setup('en-US');
    const started = deferred();
    const release = deferred();
    const committing = BookExecutionGuard.commit('fixture-book', async () => {
      started.resolve();
      await release.promise;
    });
    await started.promise;
    await service.translateAllParagraphs();
    release.resolve();
    await committing;
    const item = toasts().find((entry) => entry.summary === 'Translate chapter did not start');
    expect(item).toBeDefined();
    expect(item!.detail).not.toMatch(CJK);
  });
});
