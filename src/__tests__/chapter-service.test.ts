// 必须在所有其他导入之前导入 setup，以确保 polyfill 在 idb 库导入之前设置
import './setup';

import { describe, expect, it, mock, beforeEach } from 'bun:test';
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

// Mock ChapterContentService BEFORE importing ChapterService
const mockLoadChapterContent = mock((_chapterId: string) => Promise.resolve(undefined as Paragraph[] | undefined));
const mockSaveChapterContent = mock((_chapterId: string, _content: Paragraph[]) => Promise.resolve());
const mockDeleteChapterContent = mock((_chapterId: string) => Promise.resolve());

await mock.module('src/services/chapter-content-service', () => ({
  ChapterContentService: {
    loadChapterContent: mockLoadChapterContent,
    saveChapterContent: mockSaveChapterContent,
    deleteChapterContent: mockDeleteChapterContent,
  },
}));

// Import ChapterService AFTER mocking
import { ChapterService } from '../services/chapter-service';

describe('ChapterService', () => {
  beforeEach(() => {
    mockLoadChapterContent.mockClear();
    mockSaveChapterContent.mockClear();
    mockDeleteChapterContent.mockClear();
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

      expect(updatedVolumes[0]?.chapters?.map(c => c.id)).toEqual(['c2', 'c3', 'c1']);
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
});

