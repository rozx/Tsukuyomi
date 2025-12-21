import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { ChapterService } from '../services/chapter-service';
import { ChapterContentService } from '../services/chapter-content-service';
import type { Novel, Volume, Chapter, Paragraph } from '../models/novel';
import { generateShortId } from '../utils/id-generator';

// 辅助函数：创建测试用小说
function createTestNovel(volumes: Volume[] = []): Novel {
  return {
    id: 'novel-1',
    title: 'Test Novel',
    lastEdited: new Date(),
    createdAt: new Date(),
    volumes: volumes,
  };
}

// 辅助函数：创建测试用段落
function createTestParagraph(id?: string): Paragraph {
  return {
    id: id || generateShortId(),
    text: '测试段落文本',
    selectedTranslationId: generateShortId(),
    translations: [
      {
        id: generateShortId(),
        translation: '测试翻译',
        aiModelId: 'model-1',
      },
    ],
  };
}

// Mock ChapterContentService
const mockLoadChapterContent = mock((_chapterId: string) =>
  Promise.resolve(undefined as Paragraph[] | undefined),
);
const mockSaveChapterContent = mock((_chapterId: string, _content: Paragraph[]) =>
  Promise.resolve(),
);
const mockDeleteChapterContent = mock((_chapterId: string) => Promise.resolve());

describe('ChapterService', () => {
  beforeEach(() => {
    mockLoadChapterContent.mockClear();
    mockSaveChapterContent.mockClear();
    mockDeleteChapterContent.mockClear();

    spyOn(ChapterContentService, 'loadChapterContent').mockImplementation(mockLoadChapterContent);
    spyOn(ChapterContentService, 'saveChapterContent').mockImplementation(mockSaveChapterContent);
    spyOn(ChapterContentService, 'deleteChapterContent').mockImplementation(
      mockDeleteChapterContent,
    );
    spyOn(ChapterContentService, 'clearAllCache').mockImplementation(() => {});
    spyOn(ChapterContentService, 'clearCache').mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restore();
  });
  describe('addVolume', () => {
    it('应该添加新卷', () => {
      const novel = createTestNovel();
      const updatedVolumes = ChapterService.addVolume(novel, 'New Volume');

      expect(updatedVolumes.length).toBe(1);
      expect(updatedVolumes[0]!.title.original).toBe('New Volume');
      expect(updatedVolumes[0]!.id).toBeDefined();
      expect(updatedVolumes[0]!.chapters).toEqual([]);
    });

    it('应该添加到现有卷列表', () => {
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const novel = createTestNovel([volume1]);
      const updatedVolumes = ChapterService.addVolume(novel, 'V2');

      expect(updatedVolumes.length).toBe(2);
      expect(updatedVolumes[0]).toEqual(volume1);
      expect(updatedVolumes[1]!.title.original).toBe('V2');
    });
  });

  describe('updateVolume', () => {
    it('应该更新现有卷', () => {
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const novel = createTestNovel([volume1]);

      const updatedVolumes = ChapterService.updateVolume(novel, 'v1', { title: 'Updated V1' });

      expect(updatedVolumes.length).toBe(1);
      expect(updatedVolumes[0]!.id).toBe('v1');
      expect(updatedVolumes[0]!.title.original).toBe('Updated V1');
    });

    it('如果不更改则应保留其他属性', () => {
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        description: 'Desc',
        chapters: [],
      };
      const novel = createTestNovel([volume1]);

      const updatedVolumes = ChapterService.updateVolume(novel, 'v1', { title: 'Updated V1' });

      expect(updatedVolumes[0]!.description).toBe('Desc');
    });

    it('如果卷不存在则不做任何更改', () => {
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const novel = createTestNovel([volume1]);

      const updatedVolumes = ChapterService.updateVolume(novel, 'v2', { title: 'V2' });

      expect(updatedVolumes).toEqual([volume1]);
    });
  });

  describe('deleteVolume', () => {
    it('应该删除卷', () => {
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const volume2: Volume = {
        id: 'v2',
        title: {
          original: 'V2',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const novel = createTestNovel([volume1, volume2]);

      const updatedVolumes = ChapterService.deleteVolume(novel, 'v1');

      expect(updatedVolumes.length).toBe(1);
      expect(updatedVolumes[0]!.id).toBe('v2');
    });

    it('如果卷不存在则不做任何更改', () => {
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const novel = createTestNovel([volume1]);

      const updatedVolumes = ChapterService.deleteVolume(novel, 'v2');

      expect(updatedVolumes).toEqual([volume1]);
    });
  });

  describe('addChapter', () => {
    it('应该向卷中添加章节', () => {
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const novel = createTestNovel([volume1]);

      const updatedVolumes = ChapterService.addChapter(novel, 'v1', 'New Chapter');

      expect(updatedVolumes[0]?.chapters?.length).toBe(1);
      expect(updatedVolumes[0]?.chapters?.[0]?.title.original).toBe('New Chapter');
      expect(updatedVolumes[0]?.chapters?.[0]?.id).toBeDefined();
    });

    it('如果卷不存在则不做任何更改', () => {
      const novel = createTestNovel();
      const updatedVolumes = ChapterService.addChapter(novel, 'v1', 'Chapter');
      expect(updatedVolumes).toEqual([]);
    });
  });

  describe('updateChapter', () => {
    it('应该更新章节标题', () => {
      const chapter1: Chapter = {
        id: 'c1',
        title: {
          original: 'C1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      };
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [chapter1],
      };
      const novel = createTestNovel([volume1]);

      const updatedVolumes = ChapterService.updateChapter(novel, 'c1', { title: 'Updated C1' });

      expect(updatedVolumes[0]?.chapters?.[0]?.title.original).toBe('Updated C1');
      expect(updatedVolumes[0]?.chapters?.[0]?.id).toBe('c1');
    });

    it('应该移动章节到另一个卷', () => {
      const chapter1: Chapter = {
        id: 'c1',
        title: {
          original: 'C1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      };
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [chapter1],
      };
      const volume2: Volume = {
        id: 'v2',
        title: {
          original: 'V2',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const novel = createTestNovel([volume1, volume2]);

      const updatedVolumes = ChapterService.updateChapter(novel, 'c1', {}, 'v2');

      expect(updatedVolumes[0]?.chapters?.length).toBe(0);
      expect(updatedVolumes[1]?.chapters?.length).toBe(1);
      expect(updatedVolumes[1]?.chapters?.[0]?.id).toBe('c1');
    });
  });

  describe('deleteChapter', () => {
    it('应该删除章节', () => {
      const chapter1: Chapter = {
        id: 'c1',
        title: {
          original: 'C1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      };
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [chapter1],
      };
      const novel = createTestNovel([volume1]);

      const updatedVolumes = ChapterService.deleteChapter(novel, 'c1');

      expect(updatedVolumes[0]?.chapters?.length).toBe(0);
    });
  });

  describe('moveChapter', () => {
    it('应该在同一卷中重新排序', () => {
      const createTestChapter = (id: string, title: string): Chapter => ({
        id,
        title: {
          original: title,
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      });
      const c1 = createTestChapter('c1', 'C1');
      const c2 = createTestChapter('c2', 'C2');
      const c3 = createTestChapter('c3', 'C3');
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [c1, c2, c3],
      };
      const novel = createTestNovel([volume1]);

      // Move c1 to end (index 2)
      // Note: logic is splice out then splice in.
      // remove c1 -> [c2, c3]. insert at 2 -> [c2, c3, c1]
      const updatedVolumes = ChapterService.moveChapter(novel, 'c1', 'v1', 2);

      expect(updatedVolumes[0]?.chapters?.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
    });

    it('应该移动到另一个卷', () => {
      const c1: Chapter = {
        id: 'c1',
        title: {
          original: 'C1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      };
      const volume1: Volume = {
        id: 'v1',
        title: {
          original: 'V1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [c1],
      };
      const volume2: Volume = {
        id: 'v2',
        title: {
          original: 'V2',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [],
      };
      const novel = createTestNovel([volume1, volume2]);

      const updatedVolumes = ChapterService.moveChapter(novel, 'c1', 'v2');

      expect(updatedVolumes[0]?.chapters?.length).toBe(0);
      expect(updatedVolumes[1]?.chapters?.length).toBe(1);
      expect(updatedVolumes[1]?.chapters?.[0]?.id).toBe('c1');
    });
  });

  // --- 懒加载相关方法测试 ---

  describe('loadChapterContent', () => {
    it('应该从独立存储加载章节内容', async () => {
      const chapter: Chapter = {
        id: 'chapter-1',
        title: {
          original: 'Chapter 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      const content = [createTestParagraph()];
      mockLoadChapterContent.mockResolvedValueOnce(content);

      const result = await ChapterService.loadChapterContent(chapter);

      expect(result.content).toEqual(content);
      expect(result.contentLoaded).toBe(true);
      expect(mockLoadChapterContent).toHaveBeenCalledWith('chapter-1');
    });

    it('应该跳过已加载内容的章节', async () => {
      const content = [createTestParagraph()];
      const chapter: Chapter = {
        id: 'chapter-1',
        title: {
          original: 'Chapter 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        content,
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      const result = await ChapterService.loadChapterContent(chapter);

      expect(result).toBe(chapter); // 应该返回同一个对象
      expect(mockLoadChapterContent).not.toHaveBeenCalled();
    });

    it('应该处理内容不存在的情况', async () => {
      const chapter: Chapter = {
        id: 'chapter-1',
        title: {
          original: 'Chapter 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      mockLoadChapterContent.mockResolvedValueOnce(undefined);

      const result = await ChapterService.loadChapterContent(chapter);

      expect(result.content).toEqual([]);
      expect(result.contentLoaded).toBe(true);
    });
  });

  describe('saveChapterContent', () => {
    it('应该保存章节内容到独立存储', async () => {
      const content = [createTestParagraph()];
      const chapter: Chapter = {
        id: 'chapter-1',
        title: {
          original: 'Chapter 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        content,
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await ChapterService.saveChapterContent(chapter);

      expect(mockSaveChapterContent).toHaveBeenCalledWith('chapter-1', content);
    });

    it('应该跳过没有内容的章节', async () => {
      const chapter: Chapter = {
        id: 'chapter-1',
        title: {
          original: 'Chapter 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await ChapterService.saveChapterContent(chapter);

      expect(mockSaveChapterContent).not.toHaveBeenCalled();
    });

    it('应该跳过空内容数组的章节', async () => {
      const chapter: Chapter = {
        id: 'chapter-1',
        title: {
          original: 'Chapter 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        content: [],
        lastEdited: new Date(),
        createdAt: new Date(),
      };

      await ChapterService.saveChapterContent(chapter);

      expect(mockSaveChapterContent).not.toHaveBeenCalled();
    });
  });

  describe('deleteChapterContent', () => {
    it('应该删除章节内容', async () => {
      const chapterId = 'chapter-1';

      await ChapterService.deleteChapterContent(chapterId);

      expect(mockDeleteChapterContent).toHaveBeenCalledWith(chapterId);
    });
  });

  describe('exportChapter', () => {
    // Mock clipboard API
    const mockClipboardWriteText = mock((_text: string) => Promise.resolve());

    // Mock DOM APIs
    const mockCreateElement = mock(() => ({
      href: '',
      download: '',
      click: mock(() => {}),
    }));
    const mockAppendChild = mock(() => {});
    const mockRemoveChild = mock(() => {});
    const mockCreateObjectURL = mock(() => 'blob:mock-url');
    const mockRevokeObjectURL = mock(() => {});

    // Mock ChapterService.loadChapterContent (not ChapterContentService)
    const mockLoadChapterContentForExport = mock((chapter: Chapter) =>
      Promise.resolve(chapter),
    );

    beforeEach(() => {
      mockClipboardWriteText.mockClear();
      mockCreateElement.mockClear();
      mockLoadChapterContentForExport.mockClear();

      // Mock ChapterService.loadChapterContent
      spyOn(ChapterService, 'loadChapterContent').mockImplementation(
        mockLoadChapterContentForExport,
      );

      // Mock global objects
      if (typeof global.navigator === 'undefined') {
        (global as any).navigator = { clipboard: { writeText: mockClipboardWriteText } };
      } else {
        (global.navigator as any).clipboard = { writeText: mockClipboardWriteText };
      }

      if (typeof global.document === 'undefined') {
        (global as any).document = {
          createElement: mockCreateElement,
          body: {
            appendChild: mockAppendChild,
            removeChild: mockRemoveChild,
          },
        };
      } else {
        (global.document as any).createElement = mockCreateElement;
        (global.document.body as any).appendChild = mockAppendChild;
        (global.document.body as any).removeChild = mockRemoveChild;
      }

      if (typeof global.URL === 'undefined') {
        (global as any).URL = {
          createObjectURL: mockCreateObjectURL,
          revokeObjectURL: mockRevokeObjectURL,
        };
      } else {
        (global.URL as any).createObjectURL = mockCreateObjectURL;
        (global.URL as any).revokeObjectURL = mockRevokeObjectURL;
      }
    });

    // 辅助函数：创建一个测试章节
    function createTestChapterWithContent(
      title: string,
      paragraphs: Array<{ text: string; translation?: string }>,
    ): Chapter {
      const content: Paragraph[] = paragraphs.map((p, index) => ({
        id: `para-${index}`,
        text: p.text,
        selectedTranslationId: p.translation ? `trans-${index}` : '',
        translations: p.translation
          ? [
              {
                id: `trans-${index}`,
                translation: p.translation,
                aiModelId: 'model-1',
              },
            ]
          : [],
      }));

      return {
        id: 'chapter-1',
        title: {
          original: title,
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        content,
        lastEdited: new Date(),
        createdAt: new Date(),
      };
    }

    // 辅助函数：获取导出内容（通过拦截 clipboard.writeText）
    async function getExportedContent(
      chapter: Chapter,
      type: 'original' | 'translation' | 'bilingual',
      format: 'txt' | 'json' | 'clipboard',
    ): Promise<string> {
      let exportedContent = '';
      mockClipboardWriteText.mockImplementation((text: string) => {
        exportedContent = text;
        return Promise.resolve();
      });
      // Mock loadChapterContent 返回传入的 chapter
      mockLoadChapterContentForExport.mockResolvedValueOnce(chapter);

      await ChapterService.exportChapter(chapter, type, format);
      return exportedContent;
    }

    describe('换行处理 - 译文导出', () => {
      it('应该正确处理空段落（1个空段落 → 1个空行）', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '原文1', translation: '译文1' },
          { text: '', translation: '' },
          { text: '原文2', translation: '译文2' },
        ]);

        const content = await getExportedContent(chapter, 'translation', 'clipboard');

        // 译文导出：用单个换行连接段落；1 个空段落会产生 2 个连续的 '\n'（1 个空行）
        expect(content).toContain('Chapter 1\n\n译文1\n\n译文2');
        // 验证 "译文1" 和 "译文2" 之间正好是两个换行
        const between = content.split('译文1')[1]!.split('译文2')[0]!;
        expect(between).toBe('\n\n');
      });

      it('应该正确处理连续空段落（2个空段落 → 3个空行）', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '原文1', translation: '译文1' },
          { text: '', translation: '' },
          { text: '原文2', translation: '译文2' },
          { text: '', translation: '' },
          { text: '', translation: '' },
          { text: '原文3', translation: '译文3' },
        ]);

        const content = await getExportedContent(chapter, 'translation', 'clipboard');

        // 验证 "译文2" 和 "译文3" 之间有多个空行
        // 2 个连续空段落 => 段落边界产生 3 个连续的 '\n'（2 个空段落 + 连接符）
        const betweenText2AndText3 = content.split('译文2')[1]!.split('译文3')[0]!;
        expect(betweenText2AndText3).toBe('\n'.repeat(3));
        
        // 验证整体格式正确
        expect(content).toMatch(/译文2\n{3}译文3/);
      });

      it('应该确保每个非空段落至少有一个换行符', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '原文1', translation: '译文1' }, // 没有换行符
          { text: '原文2\n', translation: '译文2\n' }, // 已有换行符
          { text: '原文3', translation: '译文3' }, // 没有换行符
        ]);

        const content = await getExportedContent(chapter, 'translation', 'clipboard');

        // 段落之间至少会有 1 个换行分隔；如果段落自身已包含换行，不应额外叠加
        expect(content).toContain('译文1\n译文2');
        // 译文2 自带末尾换行，所以与下一段之间仍然只需要 1 个换行分隔
        expect(content).toContain('译文2\n译文3');
      });
    });

    describe('换行处理 - 原文导出', () => {
      it('应该按段落使用单个换行符连接（与 getChapterContentText 一致），不额外注入换行', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '第一段内容' }, // 没有换行符
          { text: '' }, // 空段落
          { text: '第二段内容' }, // 没有换行符
        ]);

        const content = await getExportedContent(chapter, 'original', 'clipboard');

        // 导出内容：标题 + 空行 + 段落以单个 \n 连接（空段落产生连续的 \n）
        expect(content).toContain('Chapter 1\n\n第一段内容\n\n第二段内容');
      });

      it('应该保留段落原文中已有的换行符（不会额外处理）', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '段落1\n' },
          { text: '段落2\n\n' },
          { text: '段落3' },
        ]);

        const content = await getExportedContent(chapter, 'original', 'clipboard');

        // 不应因为“段落分隔”再额外叠加换行（段落2已带 \n\n）
        expect(content).toContain('Chapter 1\n\n段落1\n段落2\n\n段落3');
      });

      it('当段落已包含末尾换行符时，不应因为 join 再额外叠加换行', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: 'A\n\n\n' }, // 已经有 3 个换行
          { text: 'B' },
        ]);

        const content = await getExportedContent(chapter, 'original', 'clipboard');

        // 段落 A 已经以 \n 结尾，段落间不应再补分隔符
        expect(content).toContain('Chapter 1\n\nA\n\n\nB');
      });
    });

    describe('换行处理 - 双语导出', () => {
      it('应该正确处理双语格式的空段落', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '原文1', translation: 'Translation 1' },
          { text: '', translation: '' },
          { text: '原文2', translation: 'Translation 2' },
        ]);

        const content = await getExportedContent(chapter, 'bilingual', 'clipboard');

        // 双语格式应该包含原文和翻译
        expect(content).toContain('原文1\nTranslation 1\n');
        expect(content).toContain('原文2\nTranslation 2\n');
        // 空段落应该形成空行
        expect(content).toMatch(/Translation 1\n\n+原文2/);
      });
    });

    describe('导出格式', () => {
      it('应该正确处理 JSON 格式（不影响换行处理）', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '原文1', translation: '译文1' },
          { text: '', translation: '' },
        ]);
        mockLoadChapterContentForExport.mockResolvedValueOnce(chapter);

        await ChapterService.exportChapter(chapter, 'translation', 'json');

        // JSON 格式不应该使用换行处理逻辑
        expect(mockClipboardWriteText).not.toHaveBeenCalled();
        expect(mockCreateElement).toHaveBeenCalled();
      });

      it('TXT 导出在 Windows 下应该使用 CRLF（避免记事本换行显示异常）', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '原文1', translation: '译文1' },
          { text: '原文2', translation: '译文2' },
        ]);
        mockLoadChapterContentForExport.mockResolvedValueOnce(chapter);

        // 设置为 Windows 环境
        (global.navigator as any).userAgent = 'Windows';

        let blobText = '';
        const OriginalBlob = (global as any).Blob;
        (global as any).Blob = function (parts: any[], _options?: any) {
          blobText = parts.map((p) => String(p)).join('');
          return {} as any;
        };

        try {
          await ChapterService.exportChapter(chapter, 'translation', 'txt');
        } finally {
          (global as any).Blob = OriginalBlob;
        }

        // 应该出现 CRLF，并且不应该有裸的 LF
        expect(blobText).toContain('\r\n');
        expect(/(^|[^\r])\n/.test(blobText)).toBe(false);
      });

      it('应该正确处理 TXT 格式', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '原文1', translation: '译文1' },
        ]);
        mockLoadChapterContentForExport.mockResolvedValueOnce(chapter);

        await ChapterService.exportChapter(chapter, 'translation', 'txt');

        // TXT 格式应该触发文件下载
        expect(mockClipboardWriteText).not.toHaveBeenCalled();
        expect(mockCreateElement).toHaveBeenCalled();
      });

      it('应该正确处理剪贴板格式', async () => {
        const chapter = createTestChapterWithContent('Chapter 1', [
          { text: '原文1', translation: '译文1' },
        ]);
        mockLoadChapterContentForExport.mockResolvedValueOnce(chapter);

        await ChapterService.exportChapter(chapter, 'translation', 'clipboard');

        // 剪贴板格式应该调用 writeText
        expect(mockClipboardWriteText).toHaveBeenCalledTimes(1);
        const exportedText = (mockClipboardWriteText.mock.calls[0] as any)[0] as string;
        expect(exportedText).toContain('Chapter 1');
        expect(exportedText).toContain('译文1');
      });
    });
  });
});
