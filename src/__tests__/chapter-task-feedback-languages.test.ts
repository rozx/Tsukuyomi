import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { PolishService, TranslationService } from '../services/ai';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { useSettingsStore } from '../stores/settings';
import { useToastHistoryStore } from '../stores/toast-history';
import { deferred, webLocksFixture } from './web-locks-fixture';
import {
  chapterTranslationFixture,
  translationChapter,
  waitForQueueItem,
} from './chapter-translation-fixture';
import { useTaskQueueStore } from '../stores/task-queue';
import type { AppLocale } from '../models/locale';

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
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
    await waitForQueueItem(service.proofreadAllParagraphs());
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
    await waitForQueueItem(service.translateAllParagraphs());
    expect(toasts()).toContainEqual({ summary: '翻譯完成', detail: '已成功翻譯 0 個段落' });
  });

  it('英文界面：书籍被占用时整章任务排队等待而不提示失败，等待说明不含中文', async () => {
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
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const waiting = useTaskQueueStore().items[0];
    release.resolve();
    await committing;
    expect(waiting?.status).toBe('queued');
    expect(waiting?.waitingReason).toBe('book-busy');
    expect(toasts().some((entry) => /failed|did not start/i.test(entry.summary ?? ''))).toBe(false);
    const { default: en } = await import('../i18n/en-US/task-queue-ui');
    expect(en.taskQueueUi.waitingBookBusy).not.toMatch(CJK);
  });
});
