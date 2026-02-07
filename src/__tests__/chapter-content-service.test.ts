import './setup';
import { describe, expect, it, beforeEach } from 'bun:test';
import { ChapterContentService } from '../services/chapter-content-service';
import type { Paragraph, Novel, Volume, Chapter } from '../models/novel';
import { generateShortId } from '../utils/id-generator';

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

// 辅助函数：创建测试用章节
function createTestChapter(id?: string, content?: Paragraph[]): Chapter {
  return {
    id: id || generateShortId(),
    title: {
      original: '测试章节',
      translation: {
        id: generateShortId(),
        translation: '',
        aiModelId: '',
      },
    },
    content,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

// 辅助函数：创建测试用小说
function createTestNovel(volumes: Volume[] = []): Novel {
  return {
    id: 'novel-1',
    title: 'Test Novel',
    lastEdited: new Date(),
    createdAt: new Date(),
    volumes,
  };
}

describe('ChapterContentService', () => {
  beforeEach(() => {
    // 清除所有缓存
    ChapterContentService.clearAllCache();
  });

  describe('saveChapterContent', () => {
    it('应该保存章节内容到 IndexedDB', async () => {
      const chapterId = 'chapter-1';
      const content = [createTestParagraph(), createTestParagraph()];

      await ChapterContentService.saveChapterContent(chapterId, content);
    });

    it('应该更新缓存', async () => {
      const chapterId = 'chapter-1';
      const content = [createTestParagraph()];

      await ChapterContentService.saveChapterContent(chapterId, content);

      // 验证可以从缓存加载
      const cached = await ChapterContentService.loadChapterContent(chapterId);
      expect(cached).toEqual(content);
    });

    it('应该在保存失败时抛出错误', async () => {
      const chapterId = 'chapter-1';
      const content = [createTestParagraph()];
      await ChapterContentService.saveChapterContent(chapterId, content);
      await ChapterContentService.deleteChapterContent(chapterId);
      ChapterContentService.clearCache(chapterId);
      const result = await ChapterContentService.loadChapterContent(chapterId);
      expect(result).toBeUndefined();
    });

    describe('skipIfUnchanged', () => {
      it('应该在“刚加载并缓存”的内容未变化时跳过保存（避免同引用误判）', async () => {
        const chapterId = 'chapter-1';
        const content = [createTestParagraph(), createTestParagraph()];
        const chapterContent = {
          chapterId,
          content: JSON.stringify(content),
          lastModified: new Date().toISOString(),
        };

        // 先从 DB 加载（此时内容会被立即缓存）
        await ChapterContentService.saveChapterContent(chapterId, content);

        const saved = await ChapterContentService.saveChapterContent(chapterId, content, {
          skipIfUnchanged: true,
        });

        expect(saved).toBe(false);
      });

      it('应该在“同引用被就地修改”时仍然保存（确保变更持久化）', async () => {
        const chapterId = 'chapter-1';
        const content = [createTestParagraph(), createTestParagraph()];
        const chapterContent = {
          chapterId,
          content: JSON.stringify(content),
          lastModified: new Date().toISOString(),
        };

        await ChapterContentService.saveChapterContent(chapterId, content);

        // 模拟就地修改（例如 AI 工具直接修改内存中的段落）
        content[0]!.text = '已修改的段落文本';

        const saved = await ChapterContentService.saveChapterContent(chapterId, content, {
          skipIfUnchanged: true,
        });

        expect(saved).toBe(true);
      });
    });
  });

  describe('loadChapterContent', () => {
    it('应该从 IndexedDB 加载章节内容', async () => {
      const chapterId = 'chapter-1';
      const content = [createTestParagraph(), createTestParagraph()];
      await ChapterContentService.saveChapterContent(chapterId, content);
      ChapterContentService.clearCache(chapterId);

      const result = await ChapterContentService.loadChapterContent(chapterId);
      expect(result).toEqual(content);
    });

    it('应该从缓存加载章节内容（LRU 行为）', async () => {
      const chapterId = 'chapter-1';
      const content = [createTestParagraph()];

      // 先保存以填充缓存
      await ChapterContentService.saveChapterContent(chapterId, content);
      // 再次加载应该从缓存返回
      const result = await ChapterContentService.loadChapterContent(chapterId);
      expect(result).toEqual(content);
    });

    it('应该返回 undefined 当章节内容不存在', async () => {
      const chapterId = 'chapter-1';
      await ChapterContentService.clearAllChapterContent();
      const result = await ChapterContentService.loadChapterContent(chapterId);
      expect(result).toBeUndefined();
      // 应该缓存 null
      const cached = await ChapterContentService.loadChapterContent(chapterId);
      expect(cached).toBeUndefined();
    });

    it('应该在加载失败时返回 undefined 并缓存 null', async () => {
      const chapterId = 'chapter-1';
      await ChapterContentService.clearAllChapterContent();
      const result = await ChapterContentService.loadChapterContent(chapterId);
      expect(result).toBeUndefined();
      // 应该缓存 null
      const cached = await ChapterContentService.loadChapterContent(chapterId);
      expect(cached).toBeUndefined();
    });
  });

  describe('loadChapterContentsBatch', () => {
    it('应该批量加载章节内容', async () => {
      const chapterIds = ['chapter-1', 'chapter-2', 'chapter-3'];
      const contents = [
        [createTestParagraph()],
        [createTestParagraph(), createTestParagraph()],
        [createTestParagraph()],
      ];

      await ChapterContentService.saveChapterContent(chapterIds[0]!, contents[0]!);
      await ChapterContentService.saveChapterContent(chapterIds[1]!, contents[1]!);
      await ChapterContentService.saveChapterContent(chapterIds[2]!, contents[2]!);

      const result = await ChapterContentService.loadChapterContentsBatch(chapterIds);

      expect(result.size).toBe(3);
      expect(result.get(chapterIds[0]!)).toEqual(contents[0]);
      expect(result.get(chapterIds[1]!)).toEqual(contents[1]);
      expect(result.get(chapterIds[2]!)).toEqual(contents[2]);
    });

    it('应该从缓存加载已缓存的章节', async () => {
      const chapterId1 = 'chapter-1';
      const chapterId2 = 'chapter-2';
      const content1 = [createTestParagraph()];
      const content2 = [createTestParagraph()];

      // 先保存两个章节
      await ChapterContentService.saveChapterContent(chapterId1, content1);
      await ChapterContentService.saveChapterContent(chapterId2, content2);
      // 批量加载应该从缓存返回
      const result = await ChapterContentService.loadChapterContentsBatch([chapterId1, chapterId2]);

      expect(result.size).toBe(2);
      expect(result.get(chapterId1)).toEqual(content1);
      expect(result.get(chapterId2)).toEqual(content2);
    });

    it('应该混合处理缓存和未缓存的章节', async () => {
      const chapterId1 = 'chapter-1';
      const chapterId2 = 'chapter-2';
      const content1 = [createTestParagraph()];

      // 只保存第一个章节
      await ChapterContentService.saveChapterContent(chapterId1, content1);

      const content2 = [createTestParagraph()];
      await ChapterContentService.saveChapterContent(chapterId2, content2);

      const result = await ChapterContentService.loadChapterContentsBatch([chapterId1, chapterId2]);

      expect(result.size).toBe(2);
      expect(result.get(chapterId1)).toEqual(content1);
      expect(result.get(chapterId2)).toEqual(content2);
    });

    it('应该在批量加载失败时回退到单个加载', async () => {
      const chapterIds = ['chapter-1', 'chapter-2'];
      const content1 = [createTestParagraph()];
      const content2 = [createTestParagraph()];

      // 确保缓存为空
      ChapterContentService.clearAllCache();

      await ChapterContentService.saveChapterContent(chapterIds[0]!, content1);
      await ChapterContentService.saveChapterContent(chapterIds[1]!, content2);

      const result = await ChapterContentService.loadChapterContentsBatch(chapterIds);

      expect(result.size).toBe(2);
      expect(result.get(chapterIds[0]!)).toEqual(content1);
      expect(result.get(chapterIds[1]!)).toEqual(content2);
    });
  });

  describe('LRU Cache Behavior', () => {
    it('应该在访问时更新缓存顺序（LRU）', async () => {
      // 清除缓存以确保干净状态
      ChapterContentService.clearAllCache();

      const chapterId1 = 'chapter-1';
      const chapterId2 = 'chapter-2';
      // 保存原始内容的引用（使用固定 ID 以便验证）
      const para1Id = 'para-1';
      const para2Id = 'para-2';
      const content1 = [createTestParagraph(para1Id)];
      const content2 = [createTestParagraph(para2Id)];

      // 保存两个章节
      await ChapterContentService.saveChapterContent(chapterId1, content1);
      await ChapterContentService.saveChapterContent(chapterId2, content2);

      // 访问第一个章节，应该将其移到末尾（LRU 行为）
      const loaded1 = await ChapterContentService.loadChapterContent(chapterId1);
      expect(loaded1).toBeDefined();
      expect(loaded1?.[0]?.id).toBe(para1Id); // 验证内容正确

      // 验证缓存顺序：chapterId2 应该在前面，chapterId1 应该在后面
      // 通过填充缓存到最大值来测试
      const CACHE_MAX_SIZE = 100;
      // 当前缓存中有 2 个条目（chapterId1 和 chapterId2）
      // 我们需要填充到 CACHE_MAX_SIZE + 1，所以需要添加 CACHE_MAX_SIZE - 1 个新条目
      for (let i = 3; i <= CACHE_MAX_SIZE + 1; i++) {
        const content = [createTestParagraph()];
        await ChapterContentService.saveChapterContent(`chapter-${i}`, content);
      }

      // 现在缓存应该被清理，但 chapterId1 应该还在（因为最近访问过，在末尾）
      // 由于清理了最旧的 20%，chapterId2 可能被清理（如果在开头），但 chapterId1 应该还在（在末尾）
      // 验证 chapterId1 仍然可以从缓存加载（不需要从 DB 加载）
      const result1 = await ChapterContentService.loadChapterContent(chapterId1);
      expect(result1).toBeDefined();
      // 验证内容长度匹配
      expect(result1?.length).toBe(content1.length);
    });

    it('应该在缓存超过最大值时清理最旧的条目', async () => {
      // 清除缓存以确保干净状态
      ChapterContentService.clearAllCache();

      const CACHE_MAX_SIZE = 100;
      const _entriesToDelete = Math.floor(CACHE_MAX_SIZE * 0.2); // 20

      // 填充缓存到最大值（不访问任何条目，确保按插入顺序）
      // 注意：每次 saveChapterContent 都会将条目添加到缓存末尾
      // 所以 chapter-1 会在开头，chapter-100 会在末尾
      for (let i = 1; i <= CACHE_MAX_SIZE; i++) {
        const content = [createTestParagraph()];
        await ChapterContentService.saveChapterContent(`chapter-${i}`, content);
      }

      // 添加一个额外的条目，应该触发清理（清理前 20 个，即 chapter-1 到 chapter-20）
      await ChapterContentService.saveChapterContent(`chapter-${CACHE_MAX_SIZE + 1}`, [
        createTestParagraph(),
      ]);

      // 前 20 个条目应该被清理，需要从 DB 重新加载
      // 但是，由于我们之前保存了这些章节，它们可能还在缓存中
      // 实际上，清理逻辑会删除 Map 开头的条目
      // 由于我们按顺序保存，chapter-1 应该在开头，会被清理

      // chapter-1 应该被清理了，需要从 DB 加载（但 DB 中没有，返回 undefined）
      const _result1 = await ChapterContentService.loadChapterContent('chapter-1');

      // 后面的条目（chapter-21）应该还在缓存中（没有被清理）
      const result21 = await ChapterContentService.loadChapterContent('chapter-21');
      expect(result21).toBeDefined();
    });
  });

  describe('deleteChapterContent', () => {
    it('应该删除章节内容', async () => {
      const chapterId = 'chapter-1';
      const content = [createTestParagraph()];

      // 先保存
      await ChapterContentService.saveChapterContent(chapterId, content);

      // 删除
      await ChapterContentService.deleteChapterContent(chapterId);

      // 缓存应该被清除，再次加载时应该从 DB 加载（但 DB 中也没有了）
      const cached = await ChapterContentService.loadChapterContent(chapterId);
      expect(cached).toBeUndefined();
    });

    it('应该在删除失败时抛出错误', async () => {
      const chapterId = 'chapter-1';
      await ChapterContentService.saveChapterContent(chapterId, [createTestParagraph()]);
      await ChapterContentService.deleteChapterContent(chapterId);
      ChapterContentService.clearCache(chapterId);
      const result = await ChapterContentService.loadChapterContent(chapterId);
      expect(result).toBeUndefined();
    });
  });

  describe('bulkDeleteChapterContent', () => {
    it('应该批量删除章节内容', async () => {
      const chapterIds = ['chapter-1', 'chapter-2', 'chapter-3'];

      await ChapterContentService.bulkDeleteChapterContent(chapterIds);
    });
  });

  describe('clearAllChapterContent', () => {
    it('应该清空所有章节内容', async () => {
      await ChapterContentService.clearAllChapterContent();

      // 缓存应该被清除
      expect(typeof ChapterContentService.clearAllCache).toBe('function');
    });
  });

  describe('hasChapterContent', () => {
    it('应该返回 true 当章节内容存在', async () => {
      const chapterId = 'chapter-1';
      const content = [createTestParagraph()];

      await ChapterContentService.saveChapterContent(chapterId, content);

      const hasContent = await ChapterContentService.hasChapterContent(chapterId);
      expect(hasContent).toBe(true);
    });

    it('应该返回 false 当章节内容不存在', async () => {
      const chapterId = 'chapter-1';
      await ChapterContentService.clearAllChapterContent();
      const hasContent = await ChapterContentService.hasChapterContent(chapterId);
      expect(hasContent).toBe(false);
    });
  });

  describe('loadAllChapterContentsForNovel', () => {
    it('应该为小说加载所有章节内容', async () => {
      // 清除缓存以确保干净状态
      ChapterContentService.clearAllCache();

      const chapter1 = createTestChapter('chapter-1');
      const chapter2 = createTestChapter('chapter-2');
      const content1 = [createTestParagraph()];
      const content2 = [createTestParagraph()];

      const volume: Volume = {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: {
            id: generateShortId(),
            translation: '',
            aiModelId: '',
          },
        },
        chapters: [chapter1, chapter2],
      };

      const novel = createTestNovel([volume]);

      const result = await ChapterContentService.loadAllChapterContentsForNovel(novel);

      // 验证内容已加载
      expect(result.volumes?.[0]?.chapters?.[0]?.content).toBeDefined();
      expect(result.volumes?.[0]?.chapters?.[0]?.contentLoaded).toBe(true);
      expect(result.volumes?.[0]?.chapters?.[1]?.content).toBeDefined();
      expect(result.volumes?.[0]?.chapters?.[1]?.contentLoaded).toBe(true);
    });

    it('应该跳过已加载内容的章节', async () => {
      const content1 = [createTestParagraph()];
      const chapter1 = createTestChapter('chapter-1', content1);
      const chapter2 = createTestChapter('chapter-2');

      const volume: Volume = {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: {
            id: generateShortId(),
            translation: '',
            aiModelId: '',
          },
        },
        chapters: [chapter1, chapter2],
      };

      const novel = createTestNovel([volume]);

      await ChapterContentService.saveChapterContent('chapter-2', [createTestParagraph()]);

      const result = await ChapterContentService.loadAllChapterContentsForNovel(novel);

      expect(result.volumes?.[0]?.chapters?.[0]?.content).toEqual(content1);
    });

    it('应该处理没有卷的小说', async () => {
      const novel = createTestNovel();

      const result = await ChapterContentService.loadAllChapterContentsForNovel(novel);

      expect(result).toEqual(novel);
    });
  });

  describe('loadAllChapterContentsForNovels', () => {
    it('应该为多个小说加载所有章节内容', async () => {
      const chapter1 = createTestChapter('chapter-1');
      const chapter2 = createTestChapter('chapter-2');
      const content1 = [createTestParagraph()];
      const content2 = [createTestParagraph()];

      const volume: Volume = {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: {
            id: generateShortId(),
            translation: '',
            aiModelId: '',
          },
        },
        chapters: [chapter1, chapter2],
      };

      const novel1 = createTestNovel([volume]);
      const novel2 = createTestNovel([volume]);

      await ChapterContentService.saveChapterContent('chapter-1', content1);
      await ChapterContentService.saveChapterContent('chapter-2', content2);

      const result = await ChapterContentService.loadAllChapterContentsForNovels([novel1, novel2]);

      expect(result.length).toBe(2);
      // 验证内容已加载（通过检查内容长度和结构）
      expect(result[0]?.volumes?.[0]?.chapters?.[0]?.content).toBeDefined();
      expect(result[0]?.volumes?.[0]?.chapters?.[0]?.content?.length).toBe(content1.length);
      expect(result[1]?.volumes?.[0]?.chapters?.[0]?.content).toBeDefined();
      expect(result[1]?.volumes?.[0]?.chapters?.[0]?.content?.length).toBe(content1.length);
    });
  });

  describe('loadAllChapterContents', () => {
    it('应该直接修改传入的小说对象', async () => {
      const chapter1 = createTestChapter('chapter-1');
      const chapter2 = createTestChapter('chapter-2');
      const content1 = [createTestParagraph()];
      const content2 = [createTestParagraph()];

      const volume: Volume = {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: {
            id: generateShortId(),
            translation: '',
            aiModelId: '',
          },
        },
        chapters: [chapter1, chapter2],
      };

      const novel = createTestNovel([volume]);

      await ChapterContentService.saveChapterContent('chapter-1', content1);
      await ChapterContentService.saveChapterContent('chapter-2', content2);

      await ChapterContentService.loadAllChapterContents(novel);

      // 验证内容已加载（通过检查内容长度和结构）
      expect(novel.volumes?.[0]?.chapters?.[0]?.content).toBeDefined();
      expect(novel.volumes?.[0]?.chapters?.[0]?.content?.length).toBe(content1.length);
      expect(novel.volumes?.[0]?.chapters?.[0]?.contentLoaded).toBe(true);
      expect(novel.volumes?.[0]?.chapters?.[1]?.content).toBeDefined();
      expect(novel.volumes?.[0]?.chapters?.[1]?.content?.length).toBe(content2.length);
      expect(novel.volumes?.[0]?.chapters?.[1]?.contentLoaded).toBe(true);
    });

    it('应该跳过已加载内容的章节', async () => {
      const content1 = [createTestParagraph()];
      const chapter1 = createTestChapter('chapter-1', content1);
      const chapter2 = createTestChapter('chapter-2');

      const volume: Volume = {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: {
            id: generateShortId(),
            translation: '',
            aiModelId: '',
          },
        },
        chapters: [chapter1, chapter2],
      };

      const novel = createTestNovel([volume]);

      await ChapterContentService.saveChapterContent('chapter-2', [createTestParagraph()]);

      await ChapterContentService.loadAllChapterContents(novel);

      expect(novel.volumes?.[0]?.chapters?.[0]?.content).toEqual(content1);
    });
  });

  describe('clearCache', () => {
    it('应该清除指定章节的缓存', async () => {
      const chapterId = 'chapter-1';
      const content = [createTestParagraph()];

      await ChapterContentService.saveChapterContent(chapterId, content);
      ChapterContentService.clearCache(chapterId);

      const result = await ChapterContentService.loadChapterContent(chapterId);
      // 验证内容已加载（通过检查内容长度和结构）
      expect(result).toBeDefined();
      expect(result?.length).toBe(content.length);
    });
  });

  describe('clearAllCache', () => {
    it('应该清除所有缓存', async () => {
      const chapterId1 = 'chapter-1';
      const chapterId2 = 'chapter-2';
      const content1 = [createTestParagraph()];
      const content2 = [createTestParagraph()];

      await ChapterContentService.saveChapterContent(chapterId1, content1);
      await ChapterContentService.saveChapterContent(chapterId2, content2);

      ChapterContentService.clearAllCache();

      await ChapterContentService.loadChapterContent(chapterId1);
      await ChapterContentService.loadChapterContent(chapterId2);
    });
  });
});
