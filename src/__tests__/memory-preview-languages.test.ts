import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, nextTick, ref } from 'vue';
import type { App } from 'vue';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
import { getDB } from '../utils/indexed-db';
import { MemoryService } from '../services/memory-service';
import { EmbeddingService } from '../services/embedding-service';
import { setNameTranslation } from '../services/localization/selection';
import {
  getLastScoreBreakdowns,
  getRelatedMemoriesForChunk,
  buildChapterSemanticQuery,
  clearLastScoreBreakdowns,
} from '../services/ai/tasks/utils/context-builder';
import { useMemoryReferences } from '../composables/book-details/useMemoryReferences';
import type { Novel, Terminology, CharacterSetting } from '../models/novel';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  clearLastScoreBreakdowns();
});
async function fixture() {
  const chapter = translationChapter('c', '11111111');
  chapter.content![0]!.text = 'Shared source';
  chapter.title = setNameTranslation(
    { original: '原始名称', translation: { id: 'cn', translation: '简中标题秘密', aiModelId: '' } },
    'en-US',
    { id: 'en', translation: 'English heading', aiModelId: '' },
    { counter: 3, actorId: 'a' },
    0,
  );
  const { books, pinia } = await chapterTranslationFixture([chapter]);
  vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
  const en = await MemoryService.createMemory('fixture-book', 'English heading', 'English heading');
  const cn = await MemoryService.createMemory('fixture-book', '简中标题秘密', '简中标题秘密');
  const book = ref<Novel | undefined>(books.getBookById('fixture-book'));
  const selected = ref(chapter);
  const terms = ref<Terminology[]>([]);
  const characters = ref<CharacterSetting[]>([]);
  let preview!: ReturnType<typeof useMemoryReferences>;
  app = createApp({
    setup() {
      preview = useMemoryReferences(book, selected, terms, characters);
      return () => null;
    },
  });
  app.use(pinia).mount(document.createElement('div'));
  return { book, selected, terms, characters, preview, en, cn };
}
describe('页面记忆预览目标与请求归属', () => {
  it('预览回退不更新共享记忆访问时间或书籍修改序号', async () => {
    const { preview } = await fixture();
    const memory = await MemoryService.createMemory(
      'fixture-book',
      'Shared fallback',
      'Shared fallback',
    );
    const db = await getDB();
    const before = await db.get('memories', memory.id);
    const revision = await db.get('book-revisions', 'fixture-book');
    vi.spyOn(MemoryService, 'getAllBookMemories').mockRejectedValue(
      new Error('fixture scoring unavailable'),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await preview.refreshReferencedMemories();
    expect(preview.usedMemoryReferences.value.map((row) => row.memoryId)).toContain(memory.id);
    expect(await db.get('memories', memory.id)).toEqual(before);
    expect(await db.get('book-revisions', 'fixture-book')).toEqual(revision);
  });

  it('评分读取失败时预览和实际注入回退相同的最近记忆', async () => {
    const { selected, preview } = await fixture();
    const memory = await MemoryService.createMemory(
      'fixture-book',
      '用户原有剧情内容',
      'Shared fallback',
    );
    vi.spyOn(MemoryService, 'getAllBookMemories').mockRejectedValue(
      new Error('fixture scoring unavailable'),
    );
    vi.spyOn(MemoryService, 'getRecentMemories').mockResolvedValue([memory]);
    await preview.refreshReferencedMemories();
    expect(preview.usedMemoryReferences.value.map((row) => row.memoryId)).toEqual([memory.id]);
    const prompt = await getRelatedMemoriesForChunk(
      'fixture-book',
      'Shared source',
      15,
      'c',
      [],
      [],
      buildChapterSemanticQuery(selected.value, 'en-US'),
      'en-US',
      'en-US',
    );
    expect(prompt).toContain(`[${memory.id}] Shared fallback`);
    expect(getLastScoreBreakdowns('fixture-book')).toEqual({});
  });

  it('旧预览晚返回不能覆盖真实注入任务的评分旁路', async () => {
    const { book, selected, preview } = await fixture();
    const original = MemoryService.getAllBookMemories.bind(MemoryService);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    vi.spyOn(MemoryService, 'getAllBookMemories').mockImplementation(async (...args) => {
      if (++calls === 1) {
        entered.resolve();
        await release.promise;
      }
      return original(...args);
    });
    const pending = preview.refreshReferencedMemories();
    await entered.promise;
    book.value = { ...book.value!, targetLanguage: 'zh-CN' };
    await getRelatedMemoriesForChunk(
      'fixture-book',
      'Shared source',
      15,
      'c',
      [],
      [],
      buildChapterSemanticQuery(selected.value, 'zh-CN'),
      'en-US',
      'zh-CN',
    );
    const fresh = getLastScoreBreakdowns('fixture-book');
    expect(fresh).toBeDefined();
    release.resolve();
    await pending;
    expect(getLastScoreBreakdowns('fixture-book')).toEqual(fresh);
  });

  it('页面目标译名预览使用完整语言槽，实体改变和缺失目标都会刷新', async () => {
    const { book, selected, terms, preview } = await fixture();
    selected.value.title = '';
    const owner = setNameTranslation(
      {
        original: '原术语',
        translation: { id: 'term-cn', translation: '简中专名', aiModelId: '' },
      },
      'en-US',
      { id: 'term-en', translation: 'Silver blade', aiModelId: '' },
      { counter: 4, actorId: 'a' },
      0,
    );
    terms.value = [{ id: 'term', name: '原术语', ...owner }];
    const memory = await MemoryService.createMemory('fixture-book', 'Silver blade', 'Silver blade');
    await preview.refreshReferencedMemories();
    expect(preview.usedMemoryReferences.value.map((row) => row.memoryId)).toContain(memory.id);
    book.value = { ...book.value!, targetLanguage: 'zh-TW' };
    await nextTick();
    expect(preview.usedMemoryReferences.value).toEqual([]);
    await preview.refreshReferencedMemories();
    expect(preview.usedMemoryReferences.value).toEqual([]);
  });
  it('正文同长度修改或标题更新会废弃等待中的预览', async () => {
    const { selected, preview } = await fixture();
    const original = MemoryService.getAllBookMemories.bind(MemoryService);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(MemoryService, 'getAllBookMemories').mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    });
    const pending = preview.refreshReferencedMemories();
    await entered.promise;
    selected.value.content![0]!.text = 'Other content';
    selected.value.title = 'Changed title';
    release.resolve();
    await pending;
    expect(preview.usedMemoryReferences.value).toEqual([]);
  });

  it('旧英文预览晚返回不能覆盖切目标后的新结果或加载状态', async () => {
    const { book, preview, cn } = await fixture();
    const original = MemoryService.getAllBookMemories.bind(MemoryService);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    vi.spyOn(MemoryService, 'getAllBookMemories').mockImplementation(async (...args) => {
      if (++calls === 1) {
        entered.resolve();
        await release.promise;
      }
      return original(...args);
    });
    const pending = preview.refreshReferencedMemories();
    await entered.promise;
    book.value = { ...book.value!, targetLanguage: 'zh-CN' };
    await nextTick();
    await preview.refreshReferencedMemories();
    const fresh = structuredClone(preview.usedMemoryReferences.value.map((row) => ({ ...row })));
    expect(fresh.map((row) => row.memoryId)).toContain(cn.id);
    release.resolve();
    await pending;
    expect(preview.usedMemoryReferences.value).toEqual(fresh);
    expect(preview.isLoadingMemoryReferences.value).toBe(false);
  });
  it('切目标后旧请求在防抖窗口返回也不能展示旧目标预览', async () => {
    const { book, preview } = await fixture();
    const original = MemoryService.getAllBookMemories.bind(MemoryService);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(MemoryService, 'getAllBookMemories').mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    });
    const pending = preview.refreshReferencedMemories();
    await entered.promise;
    book.value = { ...book.value!, targetLanguage: 'zh-TW' };
    await nextTick();
    release.resolve();
    await pending;
    expect(preview.usedMemoryReferences.value).toEqual([]);
  });
  it('页面卸载后未完成预览不再写入状态', async () => {
    const { preview } = await fixture();
    const original = MemoryService.getAllBookMemories.bind(MemoryService);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(MemoryService, 'getAllBookMemories').mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    });
    const pending = preview.refreshReferencedMemories();
    await entered.promise;
    app!.unmount();
    app = undefined;
    release.resolve();
    await pending;
    expect(preview.usedMemoryReferences.value).toEqual([]);
    expect(preview.isLoadingMemoryReferences.value).toBe(false);
  });

  it('英文目标标题与实际预览评分一致，切目标自动刷新', async () => {
    const { book, preview, en, cn } = await fixture();
    await preview.refreshReferencedMemories();
    expect(preview.usedMemoryReferences.value.map((row) => row.memoryId)).toContain(en.id);
    expect(preview.usedMemoryReferences.value.map((row) => row.memoryId)).not.toContain(cn.id);
    book.value = { ...book.value!, targetLanguage: 'zh-CN' };
    await nextTick();
    await preview.refreshReferencedMemories();
    expect(preview.usedMemoryReferences.value.map((row) => row.memoryId)).toContain(cn.id);
    expect(preview.usedMemoryReferences.value.map((row) => row.memoryId)).not.toContain(en.id);
  });
});
