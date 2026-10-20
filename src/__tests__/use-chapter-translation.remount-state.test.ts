import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { TranslationService } from '../services/ai';
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
  chapter.content!.push(...translationChapter('unused', '22222222').content!);
  const fixture = await chapterTranslationFixture([chapter]);
  dispose = fixture.dispose;
  return { ...fixture, chapter };
}

/** 让翻译停在 TranslationService 内部，返回可控的结束信号与收到的 signal */
function holdTranslation() {
  const finish = deferred();
  const started = deferred<AbortSignal>();
  vi.spyOn(TranslationService, 'translate').mockImplementation(
    async (_paragraphs, _model, options) => {
      started.resolve(options!.signal!);
      await finish.promise;
      return { text: '', actions: [] };
    },
  );
  return { finish, started };
}

describe('useChapterTranslation - 离开页面后重新挂载', () => {
  it('后台仍在翻译的章节，重新挂载后仍显示翻译中与进度', async () => {
    const { mount, chapter } = await setup();
    const { finish, started } = holdTranslation();
    const first = mount(chapter);
    const running = first.service.translateAllParagraphs();
    await started.promise;
    expect(first.service.isTranslatingChapter.value).toBe(true);

    first.unmount();
    const second = mount(chapter);
    try {
      expect(second.service.isTranslatingChapter.value).toBe(true);
      expect(second.service.translationProgress.value.total).toBe(2);
    } finally {
      finish.resolve();
      await running;
    }
    expect(second.service.isTranslatingChapter.value).toBe(false);
  });

  it('卸载页面不会中止后台翻译', async () => {
    const { mount, chapter } = await setup();
    const { finish, started } = holdTranslation();
    const first = mount(chapter);
    const running = first.service.translateAllParagraphs();
    const signal = await started.promise;

    first.unmount();
    try {
      expect(signal.aborted).toBe(false);
    } finally {
      finish.resolve();
      await running;
    }
  });

  it('重新挂载后仍能取消卸载前启动的翻译', async () => {
    const { mount, chapter } = await setup();
    const { finish, started } = holdTranslation();
    const first = mount(chapter);
    const running = first.service.translateAllParagraphs();
    const signal = await started.promise;

    first.unmount();
    const second = mount(chapter);
    try {
      second.service.cancelTranslation();
      expect(signal.aborted).toBe(true);
      expect(second.service.isTranslatingChapter.value).toBe(false);
    } finally {
      finish.resolve();
      await running;
    }
  });
});
