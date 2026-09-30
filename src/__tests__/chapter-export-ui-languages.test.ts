import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useChapterExport } from '../composables/book-details/useChapterExport';
import { useSettingsStore } from '../stores/settings';
import { ChapterService } from '../services/chapter-service';
const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('src/composables/useToastHistory', () => ({ useToastWithHistory: () => feedback }));
afterEach(() => {
  feedback.add.mockClear();
  vi.restoreAllMocks();
});
describe('章节导出界面说明', () => {
  it('菜单跟随UI，导出调用仍携带当前书籍目标', async () => {
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    await settings.setUiLocale('en-US');
    const chapter = {
      id: 'c',
      title: '用户章节',
      content: [],
      createdAt: new Date(),
      lastEdited: new Date(),
    };
    const book = {
      id: 'b',
      title: '用户书名',
      targetLanguage: 'zh-CN' as const,
      createdAt: new Date(),
      lastEdited: new Date(),
    };
    const exported = vi.spyOn(ChapterService, 'exportChapter').mockResolvedValue(undefined);
    const menu = useChapterExport(ref(chapter), ref([{ id: 'p' }]), ref(book));
    expect(menu.exportMenuItems.value[1]!.label).toBe('Export translation');
    await menu.exportChapter('translation', 'txt');
    expect(exported).toHaveBeenCalledWith(chapter, 'translation', 'txt', book);
    expect(feedback.add).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'Exported as a TXT file' }),
    );
    await settings.setUiLocale('zh-TW');
    expect(menu.exportMenuItems.value[1]!.label).toBe('匯出譯文');
  });
});
