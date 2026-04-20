import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import type { Novel } from 'src/models/novel';
import { BookService } from 'src/services/book-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { FullTextIndexService } from 'src/services/full-text-index-service';
import { useBooksStore } from 'src/stores/books';

function createBook(): Novel {
  const now = new Date('2024-01-01T00:00:00.000Z');
  return {
    id: 'book-1',
    title: 'Test Book',
    lastEdited: now,
    createdAt: now,
    volumes: [
      {
        id: 'v1',
        title: 'Volume 1',
        chapters: [
          {
            id: 'c1',
            title: 'Chapter 1',
            lastEdited: now,
            createdAt: now,
            content: [],
          },
          {
            id: 'c2',
            title: 'Chapter 2',
            lastEdited: now,
            createdAt: now,
            content: [],
          },
        ],
      },
      {
        id: 'v2',
        title: 'Volume 2',
        chapters: [
          {
            id: 'c3',
            title: 'Chapter 3',
            lastEdited: now,
            createdAt: now,
            content: [],
          },
        ],
      },
    ],
  };
}

describe('books store removed chapter cleanup', () => {
  let bulkDeleteChapterContentSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    spyOn(BookService, 'saveBook').mockResolvedValue(undefined);
    spyOn(BookService, 'bulkSaveBooks').mockResolvedValue(undefined);
    bulkDeleteChapterContentSpy = spyOn(
      ChapterContentService,
      'bulkDeleteChapterContent',
    ).mockResolvedValue(undefined);
    spyOn(FullTextIndexService, 'invalidateIndex').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  it('删除章节后应清理对应的独立章节内容', async () => {
    const store = useBooksStore();
    store.books = [createBook()];

    await store.updateBook('book-1', {
      volumes: [
        {
          id: 'v1',
          title: 'Volume 1',
          chapters: [
            {
              id: 'c1',
              title: 'Chapter 1',
              lastEdited: new Date('2024-01-02T00:00:00.000Z'),
              createdAt: new Date('2024-01-01T00:00:00.000Z'),
              content: [],
            },
          ],
        },
        {
          id: 'v2',
          title: 'Volume 2',
          chapters: [
            {
              id: 'c3',
              title: 'Chapter 3',
              lastEdited: new Date('2024-01-02T00:00:00.000Z'),
              createdAt: new Date('2024-01-01T00:00:00.000Z'),
              content: [],
            },
          ],
        },
      ],
    });

    expect(bulkDeleteChapterContentSpy).toHaveBeenCalledWith(['c2']);
  });

  it('删除卷后应批量清理该卷下所有章节内容', async () => {
    const store = useBooksStore();
    store.books = [createBook()];

    await store.updateBook('book-1', {
      volumes: [
        {
          id: 'v2',
          title: 'Volume 2',
          chapters: [
            {
              id: 'c3',
              title: 'Chapter 3',
              lastEdited: new Date('2024-01-02T00:00:00.000Z'),
              createdAt: new Date('2024-01-01T00:00:00.000Z'),
              content: [],
            },
          ],
        },
      ],
    });

    expect(bulkDeleteChapterContentSpy).toHaveBeenCalledWith(['c1', 'c2']);
  });

  it('bulkAddBooks 覆盖同步后的删章结果时，应清理被移除的章节内容', async () => {
    const store = useBooksStore();
    store.books = [createBook()];

    await store.bulkAddBooks([
      {
        ...createBook(),
        volumes: [
          {
            id: 'v1',
            title: 'Volume 1',
            chapters: [
              {
                id: 'c1',
                title: 'Chapter 1',
                lastEdited: new Date('2024-01-02T00:00:00.000Z'),
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                content: [],
              },
            ],
          },
          {
            id: 'v2',
            title: 'Volume 2',
            chapters: [
              {
                id: 'c3',
                title: 'Chapter 3',
                lastEdited: new Date('2024-01-02T00:00:00.000Z'),
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                content: [],
              },
            ],
          },
        ],
      },
    ]);

    expect(bulkDeleteChapterContentSpy).toHaveBeenCalledWith(['c2']);
  });

  it('bulkAddBooks 覆盖同步后的删卷结果时，应清理整卷下所有章节内容', async () => {
    const store = useBooksStore();
    store.books = [createBook()];

    await store.bulkAddBooks([
      {
        ...createBook(),
        volumes: [
          {
            id: 'v2',
            title: 'Volume 2',
            chapters: [
              {
                id: 'c3',
                title: 'Chapter 3',
                lastEdited: new Date('2024-01-02T00:00:00.000Z'),
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                content: [],
              },
            ],
          },
        ],
      },
    ]);

    expect(bulkDeleteChapterContentSpy).toHaveBeenCalledWith(['c1', 'c2']);
  });
});
