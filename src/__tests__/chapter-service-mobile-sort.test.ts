import { describe, expect, it } from 'bun:test';
import { ChapterService } from 'src/services/chapter-service';
import type { Novel, Chapter, Volume } from 'src/models/novel';

const createChapter = (id: string, title: string): Chapter => ({
  id,
  title: {
    original: title,
    translation: {
      id: `${id}-t`,
      translation: '',
      aiModelId: '',
    },
  },
  lastEdited: new Date('2025-01-01T00:00:00.000Z'),
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
});

const createVolume = (id: string, chapters: Chapter[]): Volume => ({
  id,
  title: {
    original: `卷-${id}`,
    translation: {
      id: `${id}-vt`,
      translation: '',
      aiModelId: '',
    },
  },
  chapters,
});

const createNovel = (chapters: Chapter[]): Novel => ({
  id: 'book-1',
  title: '测试书籍',
  volumes: [createVolume('v1', chapters)],
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  lastEdited: new Date('2025-01-01T00:00:00.000Z'),
});

describe('chapter-service moveChapter (mobile reorder path)', () => {
  it('should move chapter up in same volume', () => {
    const c1 = createChapter('c1', '第1章');
    const c2 = createChapter('c2', '第2章');
    const c3 = createChapter('c3', '第3章');
    const novel = createNovel([c1, c2, c3]);

    const updated = ChapterService.moveChapter(novel, 'c2', 'v1', 0);
    const ids = updated[0]?.chapters?.map((chapter) => chapter.id) || [];

    expect(ids).toEqual(['c2', 'c1', 'c3']);
  });

  it('should move chapter down in same volume', () => {
    const c1 = createChapter('c1', '第1章');
    const c2 = createChapter('c2', '第2章');
    const c3 = createChapter('c3', '第3章');
    const novel = createNovel([c1, c2, c3]);

    const updated = ChapterService.moveChapter(novel, 'c2', 'v1', 2);
    const ids = updated[0]?.chapters?.map((chapter) => chapter.id) || [];

    expect(ids).toEqual(['c1', 'c3', 'c2']);
  });
});

