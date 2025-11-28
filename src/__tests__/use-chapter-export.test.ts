import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { ref } from 'vue';
import { useChapterExport } from '../composables/book-details/useChapterExport';
import type { Chapter } from '../models/novel';

// Mock dependencies
const mockToastAdd = mock(() => {});
const mockUseToastWithHistory = mock(() => ({
  add: mockToastAdd,
}));

const mockExportChapter = mock(() => Promise.resolve());

await mock.module('src/composables/useToastHistory', () => ({
  useToastWithHistory: mockUseToastWithHistory,
}));

await mock.module('src/services/chapter-service', () => ({
  ChapterService: {
    exportChapter: mockExportChapter,
  },
}));

describe('useChapterExport', () => {
  beforeEach(() => {
    mockToastAdd.mockClear();
    mockExportChapter.mockClear();
  });

  it('应该创建导出菜单引用', () => {
    const selectedChapter = ref<Chapter | null>(null);
    const selectedChapterParagraphs = ref([]);

    const { exportMenuRef } = useChapterExport(selectedChapter, selectedChapterParagraphs);

    expect(exportMenuRef).toBeDefined();
    expect(exportMenuRef.value).toBeNull();
  });

  it('应该创建导出菜单项', () => {
    const selectedChapter = ref<Chapter | null>(null);
    const selectedChapterParagraphs = ref([]);

    const { exportMenuItems } = useChapterExport(selectedChapter, selectedChapterParagraphs);

    expect(exportMenuItems.value).toBeDefined();
    expect(Array.isArray(exportMenuItems.value)).toBe(true);
    expect(exportMenuItems.value.length).toBeGreaterThan(0);
  });

  it('应该在导出成功时显示成功 toast (clipboard)', async () => {
    const chapter: Chapter = {
      id: 'chapter-1',
      title: { original: 'Chapter 1', translation: { id: 'trans-1', translation: '', aiModelId: '' } },
      content: [{ id: 'para-1', text: 'test' }],
      lastEdited: new Date(),
    };
    const selectedChapter = ref<Chapter | null>(chapter);
    const selectedChapterParagraphs = ref([{ id: 'para-1' }]);

    const { exportChapter } = useChapterExport(selectedChapter, selectedChapterParagraphs);

    await exportChapter('original', 'clipboard');

    expect(mockExportChapter).toHaveBeenCalledTimes(1);
    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const toastCall = mockToastAdd.mock.calls[0]![0];
    expect(toastCall.severity).toBe('success');
    expect(toastCall.summary).toBe('已复制到剪贴板');
  });

  it('应该在导出成功时显示成功 toast (file)', async () => {
    const chapter: Chapter = {
      id: 'chapter-1',
      title: { original: 'Chapter 1', translation: { id: 'trans-1', translation: '', aiModelId: '' } },
      content: [{ id: 'para-1', text: 'test' }],
      lastEdited: new Date(),
    };
    const selectedChapter = ref<Chapter | null>(chapter);
    const selectedChapterParagraphs = ref([{ id: 'para-1' }]);

    const { exportChapter } = useChapterExport(selectedChapter, selectedChapterParagraphs);

    await exportChapter('translation', 'txt');

    expect(mockExportChapter).toHaveBeenCalledTimes(1);
    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const toastCall = mockToastAdd.mock.calls[0]![0];
    expect(toastCall.severity).toBe('success');
    expect(toastCall.summary).toBe('导出成功');
    expect(toastCall.detail).toContain('TXT');
  });

  it('应该在导出失败时显示错误 toast', async () => {
    const originalConsoleError = console.error;
    console.error = mock(() => {});
    mockExportChapter.mockRejectedValueOnce(new Error('Export failed'));

    const chapter: Chapter = {
      id: 'chapter-1',
      title: { original: 'Chapter 1', translation: { id: 'trans-1', translation: '', aiModelId: '' } },
      content: [{ id: 'para-1', text: 'test' }],
      lastEdited: new Date(),
    };
    const selectedChapter = ref<Chapter | null>(chapter);
    const selectedChapterParagraphs = ref([{ id: 'para-1' }]);

    const { exportChapter } = useChapterExport(selectedChapter, selectedChapterParagraphs);

    await exportChapter('original', 'json');

    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const toastCall = mockToastAdd.mock.calls[0]![0];
    expect(toastCall.severity).toBe('error');
    expect(toastCall.summary).toBe('导出失败');
    console.error = originalConsoleError;
  });

  it('应该在复制所有翻译文本成功时显示成功 toast', async () => {
    const chapter: Chapter = {
      id: 'chapter-1',
      title: { original: 'Chapter 1', translation: { id: 'trans-1', translation: '', aiModelId: '' } },
      content: [{ id: 'para-1', text: 'test' }],
      lastEdited: new Date(),
    };
    const selectedChapter = ref<Chapter | null>(chapter);
    const selectedChapterParagraphs = ref([{ id: 'para-1' }]);

    const { copyAllTranslatedText } = useChapterExport(selectedChapter, selectedChapterParagraphs);

    await copyAllTranslatedText();

    expect(mockExportChapter).toHaveBeenCalledWith(chapter, 'translation', 'clipboard');
    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const toastCall = mockToastAdd.mock.calls[0]![0];
    expect(toastCall.severity).toBe('success');
    expect(toastCall.summary).toBe('已复制到剪贴板');
  });

  it('应该在章节为空时显示警告', async () => {
    const selectedChapter = ref<Chapter | null>(null);
    const selectedChapterParagraphs = ref([]);

    const { copyAllTranslatedText } = useChapterExport(selectedChapter, selectedChapterParagraphs);

    await copyAllTranslatedText();

    expect(mockExportChapter).not.toHaveBeenCalled();
    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const toastCall = mockToastAdd.mock.calls[0]![0];
    expect(toastCall.severity).toBe('warn');
    expect(toastCall.summary).toBe('无法复制');
  });
});

