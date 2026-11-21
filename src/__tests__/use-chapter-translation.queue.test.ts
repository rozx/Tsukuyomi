import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { TranslationService } from '../services/ai';
import { useTaskQueueStore } from '../stores/task-queue';
import { useSettingsStore } from '../stores/settings';
import { deferred } from './web-locks-fixture';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});

async function setup() {
  const chapter = translationChapter('chapter-a', '11111111');
  const fixture = await chapterTranslationFixture([chapter]);
  dispose = fixture.dispose;
  await useSettingsStore().updateSettings({ uiLocale: 'zh-CN' });
  return { ...fixture, ...fixture.mount(chapter) };
}

const tick = async (times = 10) => {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('useChapterTranslation · 经任务队列执行', () => {
  it('排队等待时按钮显示排队位置，移出排队项后按钮恢复', async () => {
    const { service } = await setup();
    const queue = useTaskQueueStore();
    await queue.ensureStarted();
    await queue.pause();
    const translate = vi.spyOn(TranslationService, 'translate');
    const label = service.translationButtonLabel.value;

    const id = await service.translateAllParagraphs();
    expect(id).toBeDefined();
    expect(service.chapterQueuePosition.value).toBe(1);
    expect(service.translationButtonLabel.value).toContain('排队中');

    await service.cancelTranslation();
    expect(queue.items.some((item) => item.id === id)).toBe(false);
    expect(service.chapterQueuePosition.value).toBeNull();
    expect(service.translationButtonLabel.value).toBe(label);
    expect(translate).not.toHaveBeenCalled();
  });

  it('运行中取消：停止该队列项，按钮恢复可用', async () => {
    const { service } = await setup();
    const started = deferred<AbortSignal>();
    vi.spyOn(TranslationService, 'translate').mockImplementation(
      (_paragraphs, _model, options) =>
        new Promise((_, reject) => {
          const signal = options!.signal!;
          started.resolve(signal);
          signal.addEventListener('abort', () => reject(new Error('请求已取消')));
        }),
    );
    const id = await service.translateAllParagraphs();
    const signal = await started.promise;
    expect(service.isTranslatingChapter.value).toBe(true);

    await service.cancelTranslation();
    expect(signal.aborted).toBe(true);
    expect((await useTaskQueueStore().waitForItem(id!))?.status).toBe('cancelled');
    expect(service.isTranslatingChapter.value).toBe(false);
  });

  it('同一章节同类任务已在队列中时不重复入队', async () => {
    const { service } = await setup();
    const queue = useTaskQueueStore();
    await queue.ensureStarted();
    await queue.pause();
    const first = await service.translateAllParagraphs();
    const second = await service.continueTranslation();
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
    await tick();
    expect(queue.items.filter((item) => item.chapterId === 'chapter-a')).toHaveLength(1);
  });

  it('每批落盘后发出 chapterWrite，打开着的章节随之显示新译文与段落进度', async () => {
    const { service, loaded } = await setup();
    let progressSeen = 0;
    vi.spyOn(TranslationService, 'translate').mockImplementation(
      async (_paragraphs, _model, options) => {
        options?.onProgress?.({ total: 1, current: 1, currentParagraphs: ['11111111'] });
        progressSeen = service.translationProgress.value.total;
        await options?.onParagraphTranslation?.([{ id: '11111111', translation: 'Fresh' }]);
        return { text: '', actions: [] };
      },
    );
    const id = await service.translateAllParagraphs();
    await useTaskQueueStore().waitForItem(id!);
    expect(progressSeen).toBe(1);
    expect(useTaskQueueStore().lastChapterWrite).toMatchObject({
      bookId: 'fixture-book',
      chapterId: 'chapter-a',
    });
    expect(loaded.value?.content?.[0]?.translations[0]?.translation).toBe('Fresh');
  });
});
