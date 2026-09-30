import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { nextTick } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
let dispose: (() => void) | undefined;
afterEach(() => dispose?.());
describe('章节翻译按钮语言', () => {
  it('标签即时更新但动作与英文书籍目标保持', async () => {
    const chapter = translationChapter('c', 'p');
    const fixture = await chapterTranslationFixture([chapter]);
    dispose = fixture.dispose;
    const settings = useSettingsStore();
    await settings.setUiLocale('en-US');
    const { service } = fixture.mount(chapter);
    expect(service.translationButtonLabel.value).toBe('Translate chapter');
    expect(service.translationButtonMenuItems.value[0]!.label).toBe('Retranslate');
    await settings.setUiLocale('zh-TW');
    await nextTick();
    expect(service.translationButtonLabel.value).toBe('翻譯本章');
    expect(fixture.books.getBookById('fixture-book')!.targetLanguage).toBe('en-US');
  });
});
