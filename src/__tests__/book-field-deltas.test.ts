import { describe, expect, it, vi } from 'vitest';
import './setup';
import { createPinia, setActivePinia } from 'pinia';
import { useBooksStore } from '../stores/books';
import { BookService } from '../services/book-service';
import { LibraryPersistence } from '../services/library-persistence';
import { getDB } from '../utils/indexed-db';
import { canonicalStringify } from '../utils/canonical-json';
import type { Novel } from '../models/novel';
import { buildBookFieldPatch } from '../services/book-field-patch';

async function tab() {
  setActivePinia(createPinia());
  const books = useBooksStore();
  await books.loadBooks();
  return books;
}

function baseBook(id: string, extra: Partial<Novel> = {}): Novel {
  return {
    id,
    title: '书',
    targetLanguage: 'zh-CN',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'v1',
        title: '第一卷',
        chapters: [
          {
            id: `${id}-c1`,
            title: '第一章',
            lastEdited: new Date(0),
            createdAt: new Date(0),
          },
        ],
      },
    ],
    ...extra,
  };
}

async function storedSnapshot(id: string) {
  const db = await getDB();
  return {
    book: canonicalStringify(await db.get('books', id)),
    revision: canonicalStringify(await db.get('book-revisions', id)),
  };
}

describe('书籍元数据按字段增量保存', () => {
  it('两个标签页分别修改不同字段，旧快照保存后两处修改都保留', async () => {
    await BookService.saveBook(baseBook('delta-1', { author: '旧作者', preserveIndents: true }));
    const stale = await tab();
    const other = await tab();
    await other.updateBook('delta-1', {
      author: '新作者',
      preserveIndents: false,
      translationChunkSize: 4000,
      taskModelOverrides: { translation: 'model-x' },
    });

    await stale.updateBook('delta-1', { description: '新简介' });

    const saved = (await BookService.getBookById('delta-1'))!;
    expect(saved.description).toBe('新简介');
    expect(saved.author).toBe('新作者');
    expect(saved.preserveIndents).toBe(false);
    expect(saved.translationChunkSize).toBe(4000);
    expect(saved.taskModelOverrides).toEqual({ translation: 'model-x' });
    const inStale = stale.getBookById('delta-1')!;
    expect(inStale.author).toBe('新作者');
    expect(inStale.preserveIndents).toBe(false);
    expect(inStale.description).toBe('新简介');
  });

  it('表单为未设置字段生成的空占位值不会清除其他标签页新写入的值', async () => {
    await BookService.saveBook({ ...baseBook('delta-blank'), volumes: undefined });
    const stale = await tab();
    const other = await tab();
    await other.updateBook('delta-blank', {
      author: '新作者',
      tags: ['新'],
      webUrl: ['https://a'],
      translationInstructions: '指令',
    });

    await stale.updateBook('delta-blank', {
      title: '书',
      author: '',
      tags: [],
      webUrl: [],
      alternateTitles: [],
      translationInstructions: '',
      description: '新简介',
    });

    const saved = (await BookService.getBookById('delta-blank'))!;
    expect(saved.author).toBe('新作者');
    expect(saved.tags).toEqual(['新']);
    expect(saved.webUrl).toEqual(['https://a']);
    expect(saved.translationInstructions).toBe('指令');
    expect(saved.description).toBe('新简介');
  });

  it('表单整体提交时，与旧快照相同的字段不会覆盖其他标签页的修改', async () => {
    await BookService.saveBook(baseBook('delta-form', { author: '甲', tags: ['a'] }));
    const stale = await tab();
    const other = await tab();
    await other.updateBook('delta-form', { author: '乙', tags: ['b'] });

    await stale.updateBook('delta-form', {
      title: '书',
      author: '甲',
      tags: ['a'],
      description: '改',
    });

    const saved = (await BookService.getBookById('delta-form'))!;
    expect(saved.author).toBe('乙');
    expect(saved.tags).toEqual(['b']);
    expect(saved.description).toBe('改');
  });

  it('另一标签页更换了封面后，旧快照保存无关字段不会把封面改回去', async () => {
    await BookService.saveBook(
      baseBook('delta-cover', { cover: { id: 'c1', url: 'https://a/1.png' } as Novel['cover'] }),
    );
    const stale = await tab();
    const other = await tab();
    await other.updateBook('delta-cover', {
      cover: { id: 'c2', url: 'https://a/2.png' } as Novel['cover'],
    });

    await stale.updateBook('delta-cover', { starred: true });

    const saved = (await BookService.getBookById('delta-cover'))!;
    expect(saved.cover?.url).toBe('https://a/2.png');
    expect(saved.starred).toBe(true);
  });

  it('调用方原地修改内存数组后按同一引用提交，修改仍会保存', async () => {
    await BookService.saveBook(baseBook('delta-inplace', { tags: ['a'] }));
    const books = await tab();
    const tags = books.getBookById('delta-inplace')!.tags!;
    tags.push('b');

    await books.updateBook('delta-inplace', { tags });

    expect((await BookService.getBookById('delta-inplace'))!.tags).toEqual(['a', 'b']);
  });

  it('cover: null 会删除封面字段', async () => {
    await BookService.saveBook(
      baseBook('delta-null', { cover: { id: 'c1', url: 'https://a/1.png' } as Novel['cover'] }),
    );
    const books = await tab();
    await books.updateBook('delta-null', { cover: null as unknown as undefined });

    const db = await getDB();
    const raw = (await db.get('books', 'delta-null'))!;
    expect('cover' in raw).toBe(false);
    expect('cover' in books.getBookById('delta-null')!).toBe(false);
  });

  it('整本快照路径（同时改卷章节）中 cover: undefined 也删除封面字段', async () => {
    await BookService.saveBook(
      baseBook('snapshot-undef-cover', {
        cover: { id: 'c1', url: 'https://a/1.png' } as Novel['cover'],
      }),
    );
    const books = await tab();
    await books.updateBook('snapshot-undef-cover', { cover: undefined, volumes: [] });

    const db = await getDB();
    const raw = (await db.get('books', 'snapshot-undef-cover'))!;
    expect('cover' in raw).toBe(false);
    expect(raw.volumes).toEqual([]);
    expect('cover' in books.getBookById('snapshot-undef-cover')!).toBe(false);
  });

  it('撤销时值为 undefined 的字段被删除而不是存成 undefined', async () => {
    await BookService.saveBook(baseBook('delta-undef', { author: '甲' }));
    const books = await tab();
    await books.updateBook('delta-undef', { author: undefined });

    const db = await getDB();
    const raw = (await db.get('books', 'delta-undef'))!;
    expect('author' in raw).toBe(false);
  });

  it('未提供 lastEdited 时自动刷新，调用方提供时使用调用方的值', async () => {
    await BookService.saveBook(baseBook('delta-time'));
    const books = await tab();
    const before = Date.now();
    await books.updateBook('delta-time', { description: '一' });
    const auto = (await BookService.getBookById('delta-time'))!.lastEdited;
    expect(auto.getTime()).toBeGreaterThanOrEqual(before);

    const explicit = new Date('2020-01-02T03:04:05.000Z');
    await books.updateBook('delta-time', { description: '二', lastEdited: explicit });
    const saved = (await BookService.getBookById('delta-time'))!;
    expect(saved.lastEdited.toISOString()).toBe(explicit.toISOString());
    expect(books.getBookById('delta-time')!.lastEdited.toISOString()).toBe(explicit.toISOString());
  });

  it('补丁无实际变化时不写入、不递增修改序号', async () => {
    await BookService.saveBook(baseBook('delta-noop', { author: '甲' }));
    const books = await tab();
    const before = await storedSnapshot('delta-noop');

    await books.updateBook('delta-noop', {});
    await books.updateBook('delta-noop', { title: '书', author: '甲' });
    await books.updateBook('delta-noop', { author: '甲', lastEdited: new Date() });

    expect(await storedSnapshot('delta-noop')).toEqual(before);
  });

  it('内存中已加载的章节正文在元数据保存后仍保留', async () => {
    await BookService.saveBook(baseBook('delta-content'));
    const books = await tab();
    const chapter = books.getBookById('delta-content')!.volumes![0]!.chapters![0]!;
    chapter.content = [{ id: 'p1', text: '原文', selectedTranslationId: '', translations: [] }];
    chapter.contentLoaded = true;

    await books.updateBook('delta-content', { description: '简介' });

    const after = books.getBookById('delta-content')!.volumes![0]!.chapters![0]!;
    expect(after.content).toEqual([
      { id: 'p1', text: '原文', selectedTranslationId: '', translations: [] },
    ]);
    expect(after.contentLoaded).toBe(true);
  });

  it('并发保存时，较晚返回的旧提交结果不会覆盖内存中更新的记录', async () => {
    await BookService.saveBook(baseBook('delta-race'));
    const books = await tab();
    const real = BookService.updateBookFields.bind(BookService);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let firstCommitted!: () => void;
    const committed = new Promise<void>((resolve) => (firstCommitted = resolve));
    let calls = 0;
    const spy = vi
      .spyOn(BookService, 'updateBookFields')
      .mockImplementation(async (...args: Parameters<typeof BookService.updateBookFields>) => {
        const first = calls++ === 0;
        const result = await real(...args);
        if (first) {
          firstCommitted();
          await gate;
        }
        return result;
      });

    const slow = books.updateBook('delta-race', { targetLanguage: 'en-US' });
    await committed;
    await books.updateBook('delta-race', { description: '新简介' });
    release();
    await slow;
    spy.mockRestore();

    const inMemory = books.getBookById('delta-race')!;
    expect(inMemory.targetLanguage).toBe('en-US');
    expect(inMemory.description).toBe('新简介');
  });

  it('库中不存在的书籍仍按原有方式写入', async () => {
    const books = await tab();
    books.books.push(baseBook('delta-absent'));

    await books.updateBook('delta-absent', { description: '简介' });

    const saved = (await BookService.getBookById('delta-absent'))!;
    expect(saved.description).toBe('简介');
    expect(saved.title).toBe('书');
  });
});

describe('实体与其他元数据字段同时更新', () => {
  it('先提交术语，再按字段增量保存其余字段，旧快照不覆盖其他标签页的修改', async () => {
    await BookService.saveBook(baseBook('mixed-1', { author: '甲' }));
    const stale = await tab();
    const other = await tab();
    await other.updateBook('mixed-1', { author: '乙', preserveIndents: false });
    const chapter = stale.getBookById('mixed-1')!.volumes![0]!.chapters![0]!;
    chapter.content = [{ id: 'p1', text: '原文', selectedTranslationId: '', translations: [] }];

    await stale.updateBook('mixed-1', {
      terminologies: [
        { id: 't1', name: 'Term', translation: { id: 'tt', translation: '术语', aiModelId: 'm' } },
      ],
      description: '新简介',
    });

    const saved = (await BookService.getBookById('mixed-1'))!;
    expect(saved.terminologies?.map((term) => term.id)).toEqual(['t1']);
    expect(saved.description).toBe('新简介');
    expect(saved.author).toBe('乙');
    expect(saved.preserveIndents).toBe(false);
    const inMemory = stale.getBookById('mixed-1')!;
    expect(inMemory.terminologies?.map((term) => term.id)).toEqual(['t1']);
    expect(inMemory.description).toBe('新简介');
    expect(inMemory.author).toBe('乙');
    expect(inMemory.volumes![0]!.chapters![0]!.content?.[0]?.id).toBe('p1');
  });

  it('只有实体修改、其余字段与快照相同时只提交实体，不再额外写入', async () => {
    await BookService.saveBook(baseBook('mixed-2', { author: '甲' }));
    const books = await tab();
    const update = vi.spyOn(BookService, 'updateBookFields');

    await books.updateBook('mixed-2', {
      terminologies: [
        { id: 't2', name: 'Term', translation: { id: 'tt', translation: '术语', aiModelId: 'm' } },
      ],
      author: '甲',
    });

    expect(update).not.toHaveBeenCalled();
    update.mockRestore();
    expect((await BookService.getBookById('mixed-2'))!.terminologies?.map((t) => t.id)).toEqual([
      't2',
    ]);
    expect(books.getBookById('mixed-2')!.terminologies?.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('卷章结构更新仍走整本保存', () => {
  it('同时更新卷章与术语时提交术语并写入新卷章结构', async () => {
    await BookService.saveBook(baseBook('snap-1'));
    const books = await tab();
    const volumes = [
      ...books.getBookById('snap-1')!.volumes!,
      { id: 'v2', title: '第二卷', chapters: [] },
    ];
    await books.updateBook('snap-1', {
      volumes,
      terminologies: [
        {
          id: 't1',
          name: 'Term',
          translation: { id: 'tt', translation: '术语', aiModelId: 'm' },
        },
      ],
    });

    const saved = (await BookService.getBookById('snap-1'))!;
    expect(saved.volumes?.map((volume) => volume.id)).toEqual(['v1', 'v2']);
    expect(saved.terminologies?.map((term) => term.id)).toEqual(['t1']);
    expect(books.getBookById('snap-1')!.terminologies?.map((term) => term.id)).toEqual(['t1']);
  });

  it('只更新术语且要求保存正文时提交术语后不再整本写入', async () => {
    await BookService.saveBook(baseBook('snap-2'));
    const books = await tab();
    await books.updateBook(
      'snap-2',
      {
        terminologies: [
          {
            id: 't2',
            name: 'Term',
            translation: { id: 'tt', translation: '术语', aiModelId: 'm' },
          },
        ],
      },
      { saveChapterContent: true },
    );

    const saved = (await BookService.getBookById('snap-2'))!;
    expect(saved.terminologies?.map((term) => term.id)).toEqual(['t2']);
    expect(books.getBookById('snap-2')!.volumes?.[0]?.chapters?.[0]?.id).toBe('snap-2-c1');
  });
});

describe('LibraryPersistence.updateBookFields', () => {
  it('在事务内读取最新记录并只应用补丁字段，返回已提交记录', async () => {
    await BookService.saveBook(baseBook('lp-1', { author: '甲', description: '旧' }));
    const db = await getDB();
    const result = await LibraryPersistence.updateBookFields(db, 'lp-1', {
      description: '新',
      lastEdited: new Date(5),
    });
    expect(result?.book.author).toBe('甲');
    expect(result?.book.description).toBe('新');
    const raw = (await db.get('books', 'lp-1'))!;
    expect(raw.description).toBe('新');
    expect(raw.volumes?.[0]?.chapters?.[0]?.id).toBe('lp-1-c1');
    const stored = (await db.get('book-revisions', 'lp-1'))!.revision;
    expect(result?.revision).toBe(stored);
    const noop = await LibraryPersistence.updateBookFields(db, 'lp-1', { description: '新' });
    expect(noop?.revision).toBe(stored);
  });

  it('修改目标语言时返回全书章节作为待维护变更', async () => {
    await BookService.saveBook(baseBook('lp-2'));
    const db = await getDB();
    const result = await LibraryPersistence.updateBookFields(db, 'lp-2', {
      targetLanguage: 'en-US',
    });
    expect(result?.book.targetLanguage).toBe('en-US');
    expect(result?.changes.get('lp-2')).toEqual(['lp-2-c1']);
  });

  it('记录不存在时返回 undefined 且不写入', async () => {
    const db = await getDB();
    expect(await LibraryPersistence.updateBookFields(db, 'missing', { title: 'x' })).toBe(
      undefined,
    );
    expect(await db.get('books', 'missing')).toBe(undefined);
  });
});

describe('buildBookFieldPatch', () => {
  const base = baseBook('patch', { author: '甲', tags: ['a'] });

  it('空输入得到空补丁', () => {
    expect(buildBookFieldPatch(base, {})).toEqual({});
  });

  it('未设置字段的空字符串 / 空数组占位视为未改动', () => {
    expect(buildBookFieldPatch(base, { description: '', webUrl: [], alternateTitles: [] })).toEqual(
      {},
    );
  });

  it('把已有值清空为空字符串 / 空数组仍是修改', () => {
    expect(buildBookFieldPatch(base, { author: '', tags: [] })).toEqual({ author: '', tags: [] });
  });

  it('跳过卷章、实体与身份字段，lastEdited 原样携带', () => {
    const lastEdited = new Date(1);
    expect(
      buildBookFieldPatch(base, {
        id: 'x',
        createdAt: new Date(2),
        volumes: [],
        terminologies: [],
        characterSettings: [],
        lastEdited,
      }),
    ).toEqual({ lastEdited });
  });
});
