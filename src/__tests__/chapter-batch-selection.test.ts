import './setup';
import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { Novel, Paragraph, Volume } from 'src/models/novel';
import { createChapterBatchSelection } from 'src/composables/book-details/useChapterBatchSelection';
import { createChapterCompletionStats } from 'src/composables/book-details/useChapterCompletionStats';
import { useTaskQueueStore } from 'src/stores/task-queue';

const chapter = (id: string) => ({ id, title: id, createdAt: new Date(0), lastEdited: new Date(0) });
const volume = (id: string, chapterIds: string[]): Volume =>
  ({ id, title: id, chapters: chapterIds.map(chapter) }) as unknown as Volume;
const novel = (volumes: Volume[]): Novel =>
  ({ id: 'b', title: 'B', targetLanguage: 'zh-CN', createdAt: new Date(0), lastEdited: new Date(0), volumes }) as Novel;

const para = (id: string, translated: boolean): Paragraph =>
  ({
    id,
    text: `原文 ${id}`,
    selectedTranslationId: translated ? `${id}-t` : '',
    translations: translated ? [{ id: `${id}-t`, translation: '译', aiModelId: 'm' }] : [],
  }) as Paragraph;

describe('createChapterBatchSelection', () => {
  const v1 = volume('v1', ['c1', 'c2', 'c3']);
  const v2 = volume('v2', ['c4']);
  const book = ref<Novel | undefined>(novel([v1, v2]));

  it('进入多选后切换章节勾选，退出时清空', () => {
    const s = createChapterBatchSelection(book);
    s.enter();
    s.toggle('c2');
    s.toggle('c1');
    expect(s.active.value).toBe(true);
    expect(s.count.value).toBe(2);
    expect(s.isSelected('c1')).toBe(true);
    s.toggle('c1');
    expect(s.isSelected('c1')).toBe(false);
    s.exit();
    expect(s.active.value).toBe(false);
    expect(s.count.value).toBe(0);
  });

  it('卷级三态：未选、部分、全选；点击未全选的卷勾选整卷，再点取消整卷', () => {
    const s = createChapterBatchSelection(book);
    s.enter();
    expect(s.volumeState(v1)).toBe('none');
    s.toggle('c1');
    expect(s.volumeState(v1)).toBe('some');
    s.toggleVolume(v1);
    expect(s.volumeState(v1)).toBe('all');
    s.toggleVolume(v1);
    expect(s.volumeState(v1)).toBe('none');
  });

  it('选中结果按书中章节顺序输出', () => {
    const s = createChapterBatchSelection(book);
    s.enter();
    s.toggle('c4');
    s.toggle('c1');
    s.toggle('c3');
    expect(s.orderedIds.value).toEqual(['c1', 'c3', 'c4']);
  });

  it('选未翻译：勾选全书完成度低于 100% 的章节', () => {
    const s = createChapterBatchSelection(book);
    s.enter();
    s.selectWhere((id) => id !== 'c2');
    expect(s.orderedIds.value).toEqual(['c1', 'c3', 'c4']);
  });
});

describe('createChapterCompletionStats', () => {
  it('按书籍目标语言计算并缓存，只加载未缓存的章节', async () => {
    setActivePinia(createPinia());
    const book = ref<Novel | undefined>(novel([volume('v1', ['c1', 'c2'])]));
    const load = vi.fn((ids: string[]) =>
      Promise.resolve(
        new Map(ids.map((id) => [id, id === 'c1' ? [para('p1', true), para('p2', false)] : [para('p3', false)]])),
      ),
    );
    const stats = createChapterCompletionStats(book, { load });
    await stats.ensure(['c1']);
    expect(stats.percent('c1')).toBe(50);
    expect(stats.percent('c2')).toBeNull();
    await stats.ensure(['c1', 'c2']);
    expect(load).toHaveBeenLastCalledWith(['c2']);
    expect(stats.percent('c2')).toBe(0);
    expect(stats.isComplete('c1')).toBe(false);
  });

  it('队列写入章节后失效并重新计算', async () => {
    setActivePinia(createPinia());
    const book = ref<Novel | undefined>(novel([volume('v1', ['c1'])]));
    let translated = false;
    const load = vi.fn((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, [para('p1', translated)]]))));
    const stats = createChapterCompletionStats(book, { load });
    await stats.ensure(['c1']);
    expect(stats.percent('c1')).toBe(0);
    translated = true;
    useTaskQueueStore().lastChapterWrite = { bookId: 'b', chapterId: 'c1', at: 1 };
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stats.percent('c1')).toBe(100);
  });

  it('优先使用书籍详情页已计算的进度，不重复加载', async () => {
    setActivePinia(createPinia());
    const book = ref<Novel | undefined>(novel([volume('v1', ['c1', 'c2'])]));
    const load = vi.fn((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, [para('p', false)]]))));
    const seed = new Map([['c1', { total: 4, translated: 4 }]]);
    const stats = createChapterCompletionStats(book, { load, seed: () => seed });
    expect(stats.percent('c1')).toBe(100);
    await stats.ensure(['c1', 'c2']);
    expect(load).toHaveBeenCalledWith(['c2']);
  });

  it('写入后即使页面进度已有该章也重新计算', async () => {
    setActivePinia(createPinia());
    const book = ref<Novel | undefined>(novel([volume('v1', ['c1'])]));
    const load = vi.fn((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, [para('p', true)]]))));
    const stats = createChapterCompletionStats(book, { load, seed: () => new Map([['c1', { total: 1, translated: 0 }]]) });
    expect(stats.percent('c1')).toBe(0);
    useTaskQueueStore().lastChapterWrite = { bookId: 'b', chapterId: 'c1', at: 2 };
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stats.percent('c1')).toBe(100);
  });
});

describe('createChapterBatch · 确认入队', () => {
  it('6 章中 1 章已在队列：新增 5 项并提示，按书序入队后退出多选', async () => {
    const { createApp, defineComponent, h } = await import('vue');
    const { default: ToastService } = await import('primevue/toastservice');
    const { createChapterBatch } = await import('src/composables/book-details/useChapterBatch');
    const { useSettingsStore } = await import('src/stores/settings');
    const { useToastHistoryStore } = await import('src/stores/toast-history');
    const { configureTaskQueue, resetTaskQueueConfig } = await import('src/stores/task-queue');
    const pinia = createPinia();
    setActivePinia(pinia);
    configureTaskQueue({ locks: undefined, watchLibrary: false, runItem: () => new Promise(() => {}) });
    await useSettingsStore().loadSettings();
    await useSettingsStore().updateSettings({ uiLocale: 'zh-CN' });
    const book = ref<Novel | undefined>(novel([volume('v1', ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])]));
    let batch!: ReturnType<typeof createChapterBatch>;
    const app = createApp(
      defineComponent({
        setup() {
          batch = createChapterBatch(book, () => undefined);
          return () => h('div');
        },
      }),
    );
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    const queue = useTaskQueueStore();
    await queue.ensureStarted();
    await queue.pause();
    await queue.enqueue([{ bookId: 'b', chapterId: 'c3', kind: 'translation', mode: 'continue', origin: 'manual' }], { position: 'back' });
    batch.selection.enter();
    for (const id of ['c6', 'c1', 'c2', 'c3', 'c4', 'c5']) batch.selection.toggle(id);
    await batch.confirm({ kind: 'translation', mode: 'continue', position: 'back' });
    const added = queue.queuedItems.filter((item) => item.origin === 'batch').map((item) => item.chapterId);
    expect(added).toEqual(['c1', 'c2', 'c4', 'c5', 'c6']);
    expect(useToastHistoryStore().historyItems[0]?.summary).toBe('已加入 5 章，1 章已在队列中');
    expect(batch.selection.active.value).toBe(false);
    app.unmount();
    queue.dispose();
    resetTaskQueueConfig();
  });
});

describe('createChapterBatch · 展开卷的完成度', () => {
  it('进入多选后只为已展开卷的章节计算完成度，展开新卷时补算', async () => {
    const { createApp, defineComponent, h, ref: vueRef } = await import('vue');
    const { default: ToastService } = await import('primevue/toastservice');
    const { createChapterBatch } = await import('src/composables/book-details/useChapterBatch');
    const pinia = createPinia();
    setActivePinia(pinia);
    const book = ref<Novel | undefined>(novel([volume('v1', ['c1', 'c2']), volume('v2', ['c3'])]));
    const expanded = vueRef(new Set(['v1']));
    const load = vi.fn((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, [para('p', false)]]))));
    let batch!: ReturnType<typeof createChapterBatch>;
    const app = createApp(
      defineComponent({
        setup() {
          batch = createChapterBatch(book, () => undefined, {
            isVolumeExpanded: (id) => expanded.value.has(id),
            load,
          });
          return () => h('div');
        },
      }),
    );
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    await nextTick();
    expect(load).not.toHaveBeenCalled();
    batch.selection.enter();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenLastCalledWith(['c1', 'c2']);
    expanded.value = new Set(['v1', 'v2']);
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenLastCalledWith(['c3']);
    app.unmount();
  });
});

describe('createChapterBatch · 对话框预估', () => {
  it('润色时没有译文的章节计入不适用，已在队列的计入重复，新增数量不含它们', async () => {
    const { createApp, defineComponent, h } = await import('vue');
    const { default: ToastService } = await import('primevue/toastservice');
    const { createChapterBatch } = await import('src/composables/book-details/useChapterBatch');
    const { configureTaskQueue, resetTaskQueueConfig } = await import('src/stores/task-queue');
    const pinia = createPinia();
    setActivePinia(pinia);
    configureTaskQueue({ locks: undefined, watchLibrary: false, runItem: () => new Promise(() => {}) });
    const book = ref<Novel | undefined>(novel([volume('v1', ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])]));
    const seed = new Map([
      ['c1', { total: 2, translated: 2 }],
      ['c2', { total: 2, translated: 0 }],
      ['c3', { total: 2, translated: 1 }],
      ['c4', { total: 2, translated: 0 }],
      ['c5', { total: 2, translated: 2 }],
      ['c6', { total: 2, translated: 2 }],
    ]);
    let batch!: ReturnType<typeof createChapterBatch>;
    const app = createApp(
      defineComponent({
        setup() {
          batch = createChapterBatch(book, () => seed);
          return () => h('div');
        },
      }),
    );
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    const queue = useTaskQueueStore();
    await queue.ensureStarted();
    await queue.pause();
    await queue.enqueue([{ bookId: 'b', chapterId: 'c5', kind: 'polish', origin: 'manual' }], { position: 'back' });
    batch.selection.enter();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) batch.selection.toggle(id);
    expect(batch.preview('polish')).toEqual({ add: 3, duplicate: 1, notApplicable: 2 });
    expect(batch.preview('translation')).toEqual({ add: 6, duplicate: 0, notApplicable: 0 });
    app.unmount();
    queue.dispose();
    resetTaskQueueConfig();
  });
});

describe('createChapterBatch · 多选会话缓存', () => {
  it('退出多选后清空完成度缓存，再次进入时重新计算', async () => {
    const { createApp, defineComponent, h } = await import('vue');
    const { default: ToastService } = await import('primevue/toastservice');
    const { createChapterBatch } = await import('src/composables/book-details/useChapterBatch');
    const pinia = createPinia();
    setActivePinia(pinia);
    const book = ref<Novel | undefined>(novel([volume('v1', ['c1'])]));
    const load = vi.fn((ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, [para('p', false)]]))),
    );
    let batch!: ReturnType<typeof createChapterBatch>;
    const app = createApp(
      defineComponent({
        setup() {
          batch = createChapterBatch(book, () => undefined, { isVolumeExpanded: () => true, load });
          return () => h('div');
        },
      }),
    );
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    batch.selection.enter();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(1);
    batch.selection.exit();
    await nextTick();
    expect(batch.stats.percent('c1')).toBeNull();
    batch.selection.enter();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(2);
    app.unmount();
  });
});
