import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { EmbeddingQueue, type EmbeddingQueueProgress } from '../services/embedding-queue';
import { EmbeddingService } from '../services/embedding-service';
import {
  ChapterEmbeddingService,
  CHAPTER_MODEL_VERSION,
} from '../services/chapter-embedding-service';
import { MemoryService } from '../services/memory-service';
import { dispatchMemoryChanged } from '../services/memory-cache';
import { MEMORY_EMBEDDING_VERSION } from '../utils/memory-embedding-lookup';
import { useSettingsStore } from '../stores/settings';
import { useBooksStore } from '../stores/books';
import { createEmbeddingBackground } from '../composables/task-center/useEmbeddingBackground';
import type { ChapterEmbedding } from '../models/chapter-embedding';
import type { Memory } from '../models/memory';

type Listener = (event: CustomEvent) => void;
let queueListeners: Record<string, Listener> = {};

function progress(patch: Partial<EmbeddingQueueProgress> = {}): EmbeddingQueueProgress {
  return {
    total: 0,
    completed: 0,
    pending: 0,
    etaMs: 0,
    running: false,
    paused: false,
    userPaused: false,
    syncGated: false,
    breakdown: {
      memory: { total: 0, completed: 0, pending: 0 },
      chapter: { total: 0, completed: 0, pending: 0 },
    },
    currentTask: null,
    ...patch,
  };
}

const emitProgress = async (patch: Partial<EmbeddingQueueProgress>) => {
  queueListeners.progress?.(new CustomEvent('progress', { detail: progress(patch) }));
  await nextTick();
};

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  await nextTick();
};

let app: App | undefined;
let chunks: ReturnType<typeof vi.spyOn>;
let memories: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  queueListeners = {};
  vi.spyOn(EmbeddingQueue, 'addEventListener').mockImplementation((type, listener) => {
    queueListeners[type] = listener;
    return () => delete queueListeners[type];
  });
  vi.spyOn(EmbeddingService, 'getStatus').mockReturnValue('ready');
  chunks = vi.spyOn(ChapterEmbeddingService, 'getChunksForBook').mockResolvedValue([]);
  memories = vi.spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue([]);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
});

async function mount(path: string, options: { initial?: Partial<EmbeddingQueueProgress> } = {}) {
  vi.spyOn(EmbeddingQueue, 'getProgress').mockReturnValue(progress(options.initial));
  const pinia = createPinia();
  setActivePinia(pinia);
  useSettingsStore().settings.enableLocalEmbedding = true;
  const books = useBooksStore();
  for (const [id, title] of [
    ['b1', '当前书'],
    ['b2', '另一本书'],
  ] as const) {
    await books.addBook({
      id,
      title,
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [
        {
          id: `${id}-v`,
          title: '卷一',
          chapters: ['c1', 'c2', 'c3'].map((chapter) => ({
            id: `${id}-${chapter}`,
            title: chapter,
            createdAt: new Date(0),
            lastEdited: new Date(0),
          })),
        },
      ],
    } as never);
  }
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/books/:id', component: { render: () => null } },
      { path: '/settings', component: { render: () => null } },
    ],
  });
  await router.push(path);
  const visible = ref(false);
  let bg!: ReturnType<typeof createEmbeddingBackground>;
  app = createApp(
    defineComponent({
      setup() {
        bg = createEmbeddingBackground({ visible: () => visible.value });
        return () => null;
      },
    }),
  );
  app.use(pinia).use(router).mount(document.createElement('div'));
  await nextTick();
  return { bg, visible, router, settings: useSettingsStore() };
}

const chunk = (chapterId: string, model: string): ChapterEmbedding =>
  ({
    chapterId,
    bookId: 'b1',
    kind: 'content',
    chunkIndex: 0,
    model,
    targetLanguage: 'zh-CN',
    inputSignature: 'sig',
  }) as ChapterEmbedding;

const memory = (id: string, embeddingModel: string | undefined, vector: boolean): Memory =>
  ({
    id,
    bookId: 'b1',
    summary: '短摘要',
    content: '短内容',
    embeddings: vector ? [[0.1, 0.2]] : undefined,
    embeddingModel,
  }) as unknown as Memory;

describe('后台向量化：队列状态', () => {
  it('初始状态由 getProgress 同步读取，之后随进度事件更新', async () => {
    const { bg } = await mount('/', { initial: { pending: 5, running: true, etaMs: 4000 } });
    expect(bg.progress.value.pending).toBe(5);
    expect(bg.progress.value.etaMs).toBe(4000);
    await emitProgress({ pending: 2, running: true });
    expect(bg.progress.value.pending).toBe(2);
  });

  it('运行期间批次间隙保留最后的任务，队列空闲后才清除', async () => {
    const task = { kind: 'chapter' as const, bookId: 'b1', itemCount: 8 };
    const { bg } = await mount('/books/b1', { initial: { running: true, currentTask: task } });
    expect(bg.currentTask.value).toEqual(task);
    await emitProgress({ running: true, currentTask: null });
    expect(bg.currentTask.value).toEqual(task);
    await emitProgress({ running: false, currentTask: null });
    expect(bg.currentTask.value).toBeNull();
  });

  it('处理别的书时标明书名', async () => {
    const task = { kind: 'memory' as const, bookId: 'b2', itemCount: 3 };
    const { bg, router } = await mount('/books/b1', {
      initial: { running: true, currentTask: task },
    });
    expect(bg.processingOtherBook.value).toBe(true);
    expect(bg.currentTaskBookTitle.value).toBe('另一本书');
    await router.push('/books/b2');
    await nextTick();
    expect(bg.processingOtherBook.value).toBe(false);
  });

  it('同步闸门与用户暂停分开反映', async () => {
    const { bg } = await mount('/', {
      initial: { pending: 3, paused: true, syncGated: true, userPaused: false },
    });
    expect(bg.syncGated.value).toBe(true);
    expect(bg.userPaused.value).toBe(false);
  });
});

describe('后台向量化：本书统计', () => {
  it('章节与记忆的已嵌入 / 总数与旧向量计数', async () => {
    chunks.mockResolvedValue([chunk('b1-c1', CHAPTER_MODEL_VERSION), chunk('b1-c2', 'old-model')]);
    memories.mockResolvedValue([
      memory('m1', MEMORY_EMBEDDING_VERSION, true),
      memory('m2', 'old-model', true),
      memory('m3', undefined, false),
    ]);
    const { bg, visible } = await mount('/books/b1');
    visible.value = true;
    await settle();
    expect(bg.chapterStats.value).toEqual({ embedded: 1, total: 3 });
    expect(bg.memoryStats.value).toEqual({ embedded: 1, total: 3 });
    expect(bg.staleCounts.value).toEqual({ chapter: 1, memory: 1 });
  });

  it('只在可见时刷新：合并一批事件，忽略访问时间变化，隐藏后不再读取', async () => {
    const { visible } = await mount('/books/b1');
    await settle();
    expect(chunks).not.toHaveBeenCalled();
    expect(memories).not.toHaveBeenCalled();

    visible.value = true;
    await settle();
    expect(chunks).toHaveBeenCalledTimes(1);
    chunks.mockClear();
    memories.mockClear();
    for (let index = 0; index < 8; index++) {
      dispatchMemoryChanged({ bookId: 'b1', memoryId: `m${index}`, action: 'embedding-updated' });
    }
    await settle();
    expect(chunks).toHaveBeenCalledTimes(1);
    expect(memories).toHaveBeenCalledTimes(1);

    chunks.mockClear();
    dispatchMemoryChanged({ bookId: 'b1', action: 'accessed' });
    await settle();
    expect(chunks).not.toHaveBeenCalled();

    visible.value = false;
    dispatchMemoryChanged({ bookId: 'b1', action: 'embedding-updated' });
    queueListeners['batch-complete']?.(new CustomEvent('batch-complete'));
    await settle();
    expect(chunks).not.toHaveBeenCalled();
  });

  it('不在书籍页时不计算本书统计', async () => {
    const { bg, visible } = await mount('/settings');
    visible.value = true;
    await settle();
    expect(bg.bookId.value).toBeUndefined();
    expect(chunks).not.toHaveBeenCalled();
    expect(memories).not.toHaveBeenCalled();
  });
});

describe('后台向量化：操作', () => {
  it('补齐缺失同时补章节与记忆，重建只补章节，暂停 / 继续作用于嵌入队列', async () => {
    const chapterBacklog = vi.spyOn(EmbeddingQueue, 'enqueueChapterBacklog').mockResolvedValue(0);
    const memoryBacklog = vi.spyOn(EmbeddingQueue, 'enqueueBacklog').mockResolvedValue(0);
    const recompute = vi
      .spyOn(EmbeddingQueue, 'enqueueAllChaptersForRecompute')
      .mockResolvedValue(0);
    const pause = vi.spyOn(EmbeddingQueue, 'pause').mockImplementation(() => undefined);
    const resume = vi.spyOn(EmbeddingQueue, 'resume').mockImplementation(() => undefined);
    const { bg } = await mount('/books/b1');

    bg.backfill();
    expect(chapterBacklog).toHaveBeenCalledWith('b1');
    expect(memoryBacklog).toHaveBeenCalledWith('b1');
    bg.rebuildChapters();
    expect(recompute).toHaveBeenCalledWith('b1');
    bg.pause();
    expect(pause).toHaveBeenCalled();
    bg.resume();
    expect(resume).toHaveBeenCalled();
  });

  it('重建旧向量只重建有旧向量的类型，点击后先隐藏提示', async () => {
    chunks.mockResolvedValue([chunk('b1-c2', 'old-model')]);
    const chapterBacklog = vi.spyOn(EmbeddingQueue, 'enqueueChapterBacklog').mockResolvedValue(0);
    const memoryBacklog = vi.spyOn(EmbeddingQueue, 'enqueueBacklog').mockResolvedValue(0);
    const { bg, visible } = await mount('/books/b1');
    visible.value = true;
    await settle();
    expect(bg.showStale.value).toBe(true);
    bg.rebuildStale();
    expect(chapterBacklog).toHaveBeenCalledWith('b1');
    expect(memoryBacklog).not.toHaveBeenCalled();
    expect(bg.showStale.value).toBe(false);
  });

  it('不在书籍页时补齐与重建不做任何事', async () => {
    const chapterBacklog = vi.spyOn(EmbeddingQueue, 'enqueueChapterBacklog').mockResolvedValue(0);
    const { bg } = await mount('/');
    bg.backfill();
    bg.rebuildChapters();
    expect(chapterBacklog).not.toHaveBeenCalled();
  });

  it('测试查询打开对话框，换书或离开书籍页时关闭；本地嵌入关闭时区不可用', async () => {
    const { bg, settings, router } = await mount('/books/b1');
    expect(bg.enabled.value).toBe(true);
    bg.openTestQuery();
    expect(bg.testQueryVisible.value).toBe(true);
    await router.push('/books/b2');
    await nextTick();
    expect(bg.testQueryVisible.value).toBe(false);
    settings.settings.enableLocalEmbedding = false;
    await nextTick();
    expect(bg.enabled.value).toBe(false);
  });
});

describe('后台向量化：嵌入设置', () => {
  it('「嵌入设置」带分区参数打开设置页，不改动会同步的「上次打开分区」', async () => {
    const { bg, router, settings } = await mount('/books/b1');
    const save = vi.spyOn(settings, 'setLastOpenedSettingsTab').mockResolvedValue();
    await bg.openSettings();
    expect(router.currentRoute.value.path).toBe('/settings');
    expect(router.currentRoute.value.query.tab).toBe('embedding');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('后台向量化：chip 活动判断', () => {
  it('有待处理或正在处理且未暂停时为活动；任务中心从未打开也能判断', async () => {
    const { bg } = await mount('/', { initial: { pending: 4 } });
    expect(bg.active.value).toBe(true);
    await emitProgress({ running: true, pending: 0 });
    expect(bg.active.value).toBe(true);
    await emitProgress({ running: false, pending: 0 });
    expect(bg.active.value).toBe(false);
  });

  it('用户暂停、同步挂起或本地嵌入关闭时视为空闲', async () => {
    const { bg, settings } = await mount('/', { initial: { pending: 4 } });
    await emitProgress({ pending: 4, paused: true, userPaused: true });
    expect(bg.active.value).toBe(false);
    await emitProgress({ pending: 4, paused: true, syncGated: true });
    expect(bg.active.value).toBe(false);
    await emitProgress({ pending: 4 });
    expect(bg.active.value).toBe(true);
    settings.settings.enableLocalEmbedding = false;
    await nextTick();
    expect(bg.active.value).toBe(false);
  });
});
