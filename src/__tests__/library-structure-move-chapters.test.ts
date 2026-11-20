import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Chapter, Novel, Volume } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { moveChapters, planChapterMove } from 'src/services/library-structure/move-chapters';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';

const BOOK_ID = 'book-move-1';

function chapter(id: string): Chapter {
  const now = new Date(0);
  return {
    id,
    title: { original: id, translation: { id: `t-${id}`, translation: '', aiModelId: '' } },
    content: [{ id: `p-${id}`, text: `${id} 的正文`, selectedTranslationId: '', translations: [] }],
    contentLoaded: true,
    createdAt: now,
    lastEdited: now,
  };
}
function volume(id: string, chapterIds: string[]): Volume {
  return {
    id,
    title: { original: id, translation: { id: `t-${id}`, translation: '', aiModelId: '' } },
    chapters: chapterIds.map(chapter),
  };
}
function createBook(): Novel {
  const now = new Date(0);
  return {
    id: BOOK_ID,
    title: '排序测试书',
    targetLanguage: 'zh-CN',
    volumes: [volume('v1', ['a', 'b', 'c']), volume('v2', ['d', 'e'])],
    createdAt: now,
    lastEdited: now,
  };
}
const layout = (volumes: readonly Volume[] | undefined) =>
  (volumes ?? []).map((vol) => [vol.id, (vol.chapters ?? []).map((ch) => ch.id)]);

describe('移动章节（站内工具与外部工具共用）', () => {
  it('在同一卷内调整顺序：移到某章之前、之后，或卷首、卷尾', () => {
    const book = createBook();
    const before = planChapterMove(book, { chapterIds: ['c'], beforeChapterId: 'a' });
    expect(before.ok && layout(before.volumes)).toEqual([
      ['v1', ['c', 'a', 'b']],
      ['v2', ['d', 'e']],
    ]);
    const after = planChapterMove(book, { chapterIds: ['a'], afterChapterId: 'b' });
    expect(after.ok && layout(after.volumes)[0]).toEqual(['v1', ['b', 'a', 'c']]);
    const start = planChapterMove(book, { chapterIds: ['c'], position: 'start' });
    expect(start.ok && layout(start.volumes)[0]).toEqual(['v1', ['c', 'a', 'b']]);
    // 不指定位置时放到卷尾
    const end = planChapterMove(book, { chapterIds: ['a'] });
    expect(end.ok && layout(end.volumes)[0]).toEqual(['v1', ['b', 'c', 'a']]);
  });

  it('移到另一卷：可指定目标卷或以目标卷里的章节定位，多章按给出的顺序整体移动', () => {
    const book = createBook();
    const toVolume = planChapterMove(book, { chapterIds: ['b'], targetVolumeId: 'v2' });
    expect(toVolume.ok && layout(toVolume.volumes)).toEqual([
      ['v1', ['a', 'c']],
      ['v2', ['d', 'e', 'b']],
    ]);
    const block = planChapterMove(book, { chapterIds: ['c', 'a'], beforeChapterId: 'e' });
    expect(block.ok && layout(block.volumes)).toEqual([
      ['v1', ['b']],
      ['v2', ['d', 'c', 'a', 'e']],
    ]);
    expect(block.ok && block.moved).toEqual([
      { chapterId: 'c', fromVolumeId: 'v1', toVolumeId: 'v2', index: 1 },
      { chapterId: 'a', fromVolumeId: 'v1', toVolumeId: 'v2', index: 2 },
    ]);
    // 来自不同卷的章节合并到一卷
    const merged = planChapterMove(book, {
      chapterIds: ['e', 'a'],
      targetVolumeId: 'v1',
      position: 'start',
    });
    expect(merged.ok && layout(merged.volumes)).toEqual([
      ['v1', ['e', 'a', 'b', 'c']],
      ['v2', ['d']],
    ]);
  });

  it('给出整卷的新顺序即可重排整卷', () => {
    const result = planChapterMove(createBook(), {
      chapterIds: ['c', 'b', 'a'],
      targetVolumeId: 'v1',
      position: 'start',
    });
    expect(result.ok && layout(result.volumes)[0]).toEqual(['v1', ['c', 'b', 'a']]);
  });

  it('可以新建一卷并把章节移过去', () => {
    const result = planChapterMove(createBook(), {
      chapterIds: ['b', 'd'],
      newVolumeTitle: '外传',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdVolume).toBe(true);
    expect(result.volumes).toHaveLength(3);
    const created = result.volumes[2]!;
    expect(typeof created.title === 'object' && created.title.original).toBe('外传');
    expect((created.chapters ?? []).map((ch) => ch.id)).toEqual(['b', 'd']);
    expect(result.targetVolumeId).toBe(created.id);
  });

  it('位置没有变化时如实说明', () => {
    const result = planChapterMove(createBook(), { chapterIds: ['c'], afterChapterId: 'b' });
    expect(result.ok && result.unchanged).toBe(true);
    const moved = planChapterMove(createBook(), { chapterIds: ['c'], beforeChapterId: 'b' });
    expect(moved.ok && moved.unchanged).toBe(false);
  });

  it('参数有问题时给出明确的原因，不改动任何内容', () => {
    const book = createBook();
    const code = (request: Parameters<typeof planChapterMove>[1]) => {
      const result = planChapterMove(book, request);
      return result.ok ? 'ok' : result.code;
    };
    expect(code({ chapterIds: [] })).toBe('CHAPTER_IDS_REQUIRED');
    expect(code({ chapterIds: ['zzz'] })).toBe('CHAPTER_NOT_FOUND');
    expect(code({ chapterIds: ['a', 'a'] })).toBe('DUPLICATE_CHAPTER');
    expect(code({ chapterIds: ['a'], targetVolumeId: 'nope' })).toBe('VOLUME_NOT_FOUND');
    expect(code({ chapterIds: ['a'], beforeChapterId: 'zzz' })).toBe('ANCHOR_NOT_FOUND');
    // 不能以正在移动的章节自己作为定位
    expect(code({ chapterIds: ['a'], beforeChapterId: 'a' })).toBe('ANCHOR_IS_MOVED');
    // 定位方式互相冲突
    expect(code({ chapterIds: ['a'], beforeChapterId: 'b', afterChapterId: 'c' })).toBe(
      'TARGET_CONFLICT',
    );
    expect(code({ chapterIds: ['a'], beforeChapterId: 'd', targetVolumeId: 'v1' })).toBe(
      'TARGET_CONFLICT',
    );
    expect(code({ chapterIds: ['a'], beforeChapterId: 'b', newVolumeTitle: '新卷' })).toBe(
      'TARGET_CONFLICT',
    );
    // 来自不同卷的章节必须说明放到哪一卷
    expect(code({ chapterIds: ['a', 'd'] })).toBe('TARGET_REQUIRED');
    expect(layout(book.volumes)).toEqual([
      ['v1', ['a', 'b', 'c']],
      ['v2', ['d', 'e']],
    ]);
  });

  describe('写入书库', () => {
    beforeEach(async () => {
      await useSettingsStore().loadSettings();
      await useBooksStore().loadBooks();
      await useBooksStore().addBook(createBook());
      // 与真实使用一致：章节正文按需读取，不在内存里
      await useBooksStore().refreshBookFromStorage(BOOK_ID);
    });

    it('移动后书库里的顺序更新，章节正文不受影响', async () => {
      const result = await moveChapters(BOOK_ID, { chapterIds: ['b'], beforeChapterId: 'd' });
      expect(result.ok).toBe(true);
      expect(layout(useBooksStore().getBookById(BOOK_ID)?.volumes)).toEqual([
        ['v1', ['a', 'c']],
        ['v2', ['b', 'd', 'e']],
      ]);
      // 重新从存储读取，确认已经落盘，并且每一章的正文都还在
      const fresh = await useBooksStore().refreshBookFromStorage(BOOK_ID);
      expect(layout(fresh?.volumes)).toEqual([
        ['v1', ['a', 'c']],
        ['v2', ['b', 'd', 'e']],
      ]);
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        const content = await ChapterContentService.loadChapterContent(id);
        expect(content?.map((p) => p.text)).toEqual([`${id} 的正文`]);
      }
    });

    it('书不存在或参数有问题时不写入', async () => {
      const missing = await moveChapters('no-such-book', { chapterIds: ['a'] });
      expect(missing.ok ? 'ok' : missing.code).toBe('BOOK_NOT_FOUND');
      const invalid = await moveChapters(BOOK_ID, { chapterIds: ['zzz'] });
      expect(invalid.ok ? 'ok' : invalid.code).toBe('CHAPTER_NOT_FOUND');
      expect(layout(useBooksStore().getBookById(BOOK_ID)?.volumes)).toEqual([
        ['v1', ['a', 'b', 'c']],
        ['v2', ['d', 'e']],
      ]);
    });
  });
});
