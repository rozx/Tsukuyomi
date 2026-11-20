import './setup';
import { describe, expect, it, vi } from 'vitest';
import type { Novel, Paragraph } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { TaskQueueItem } from 'src/models/task-queue';
import {
  computeChapterTaskTargets,
  resolveRunTargets,
  runChapterTask,
  type ChapterTaskExecutorDeps,
  type ChapterTaskServices,
} from 'src/services/chapter-task/chapter-task-executor';

function para(id: string, text: string, translated?: string): Paragraph {
  return {
    id,
    text,
    translations: translated
      ? [{ id: `${id}-t`, translation: translated, aiModelId: 'm' }]
      : [],
    selectedTranslationId: translated ? `${id}-t` : '',
    ...(translated ? { translationsByLanguage: { 'zh-CN': { translations: [{ id: `${id}-t`, translation: translated, aiModelId: 'm' }], selectedTranslationId: `${id}-t` } } } : {}),
  } as Paragraph;
}

const model = { id: 'model-1', name: 'M' } as AIModel;

function book(chapterIds = ['c1']): Novel {
  return {
    id: 'b1',
    title: 'B',
    targetLanguage: 'zh-CN',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'v1',
        title: '',
        chapters: chapterIds.map((id) => ({
          id,
          title: { original: `第${id}章`, translation: { id: 't', translation: '', aiModelId: '' } },
          createdAt: new Date(0),
          lastEdited: new Date(0),
        })),
      },
    ],
  } as unknown as Novel;
}

function item(patch: Partial<TaskQueueItem> = {}): TaskQueueItem {
  return {
    id: 'q1',
    bookId: 'b1',
    chapterId: 'c1',
    kind: 'translation',
    mode: 'continue',
    origin: 'manual',
    status: 'running',
    order: 1,
    completedParagraphIds: [],
    aiTaskIds: [],
    enqueuedAt: 1,
    ...patch,
  };
}

function setup(paragraphs: Paragraph[], services: Partial<ChapterTaskServices>, opts: { model?: AIModel | undefined; book?: Novel | undefined } = {}) {
  const added: Omit<AIProcessingTask, 'id' | 'startTime'>[] = [];
  const updates: { id: string; updates: Partial<AIProcessingTask> }[] = [];
  const saved: string[][] = [];
  const persisted: Partial<TaskQueueItem>[] = [];
  const order: string[] = [];
  const deps: ChapterTaskExecutorDeps = {
    services: {
      translate: vi.fn(),
      polish: vi.fn(),
      proofread: vi.fn(),
      ...services,
    } as ChapterTaskServices,
    aiProcessingStore: {
      addTask: vi.fn((task: Omit<AIProcessingTask, 'id' | 'startTime'>) => {
        added.push(task);
        return Promise.resolve(`task-${added.length}`);
      }),
      updateTask: vi.fn((id: string, u: Partial<AIProcessingTask>) => {
        updates.push({ id, updates: u });
        return Promise.resolve();
      }),
      appendThinkingMessage: vi.fn(() => Promise.resolve()),
      appendOutputContent: vi.fn(() => Promise.resolve()),
      removeTask: vi.fn(() => Promise.resolve()),
      activeTasks: [],
    },
    uiLocale: 'zh-CN',
    getBook: () => ('book' in opts ? opts.book : book()),
    getModel: () => ('model' in opts ? opts.model : model),
    loadChapterParagraphs: vi.fn(() => Promise.resolve(paragraphs)),
    saveParagraphResults: vi.fn((_ctx: unknown, results: { id: string }[]) => {
      order.push(`save:${results.map((r) => r.id).join(',')}`);
      saved.push(results.map((r) => r.id));
      return Promise.resolve();
    }),
    saveTitleTranslation: vi.fn(() => Promise.resolve()),
    persistItem: vi.fn((patch: Partial<TaskQueueItem>) => {
      order.push(`persist:${(patch.completedParagraphIds ?? []).join(',')}`);
      persisted.push(patch);
      return Promise.resolve();
    }),
    onProgress: vi.fn(),
    onInFlight: vi.fn(),
    onAction: vi.fn(),
    onToast: vi.fn(),
  };
  return { deps, added, updates, saved, persisted, order };
}

const signal = new AbortController().signal;

describe('computeChapterTaskTargets', () => {
  const paragraphs = [para('a', '一', '1'), para('b', '二'), para('c', '   '), para('d', '四')];

  it('继续翻译：只取目标语言下未翻译的非空段落', () => {
    expect(computeChapterTaskTargets({ kind: 'translation', mode: 'continue' }, paragraphs, 'zh-CN')).toEqual(['b', 'd']);
  });

  it('全部重新翻译：全部非空段落', () => {
    expect(computeChapterTaskTargets({ kind: 'translation', mode: 'retranslate' }, paragraphs, 'zh-CN')).toEqual(['a', 'b', 'd']);
  });

  it('润色 / 校对：只取已有译文的段落', () => {
    expect(computeChapterTaskTargets({ kind: 'polish' }, paragraphs, 'zh-CN')).toEqual(['a']);
    expect(computeChapterTaskTargets({ kind: 'proofreading' }, paragraphs, 'zh-CN')).toEqual(['a']);
  });
});

describe('resolveRunTargets（断点续跑）', () => {
  const paragraphs = [para('a', '一', '旧'), para('b', '二', '旧'), para('c', '三', '旧')];

  it('首次运行按范围计算并清空完成记录', () => {
    const r = resolveRunTargets(item({ mode: 'retranslate' }), paragraphs, 'zh-CN');
    expect(r).toEqual({ runIds: ['a', 'b', 'c'], snapshot: ['a', 'b', 'c'], completed: [] });
  });

  it('重新翻译中断后恢复：只处理剩余段落，即使它们已有旧译文', () => {
    const r = resolveRunTargets(
      item({ mode: 'retranslate', targetParagraphIds: ['a', 'b', 'c'], targetLanguage: 'zh-CN', completedParagraphIds: ['a'] }),
      paragraphs,
      'zh-CN',
    );
    expect(r.runIds).toEqual(['b', 'c']);
    expect(r.completed).toEqual(['a']);
  });

  it('中断期间段落被删除：忽略被删段落', () => {
    const r = resolveRunTargets(
      item({ mode: 'retranslate', targetParagraphIds: ['a', 'b', 'x'], targetLanguage: 'zh-CN', completedParagraphIds: ['a'] }),
      paragraphs,
      'zh-CN',
    );
    expect(r.runIds).toEqual(['b']);
  });

  it('目标语言改变后重新计算，不沿用完成记录', () => {
    const r = resolveRunTargets(
      item({ mode: 'retranslate', targetParagraphIds: ['a', 'b', 'c'], targetLanguage: 'en-US', completedParagraphIds: ['a', 'b'] }),
      paragraphs,
      'zh-CN',
    );
    expect(r).toEqual({ runIds: ['a', 'b', 'c'], snapshot: ['a', 'b', 'c'], completed: [] });
  });

  it('快照段落全部消失（重新导入）时按原范围重新计算', () => {
    const r = resolveRunTargets(
      item({ mode: 'retranslate', targetParagraphIds: ['x', 'y'], targetLanguage: 'zh-CN', completedParagraphIds: ['x'] }),
      paragraphs,
      'zh-CN',
    );
    expect(r.runIds).toEqual(['a', 'b', 'c']);
    expect(r.completed).toEqual([]);
  });
});

describe('runChapterTask', () => {
  it('无可用模型时以可读错误失败，不调用服务', async () => {
    const translate = vi.fn();
    const { deps } = setup([para('a', '一')], { translate }, { model: undefined });
    await expect(runChapterTask(item(), deps, signal)).rejects.toThrow('NO_MODEL');
    expect(translate).not.toHaveBeenCalled();
  });

  it('书籍或章节不存在时失败', async () => {
    const { deps } = setup([para('a', '一')], {}, { book: undefined });
    await expect(runChapterTask(item(), deps, signal)).rejects.toThrow('BOOK_DELETED');
    const { deps: deps2 } = setup([para('a', '一')], {}, { book: book(['other']) });
    await expect(runChapterTask(item(), deps2, signal)).rejects.toThrow('CHAPTER_MISSING');
  });

  it('润色在运行时发现没有译文段落时失败并给出原因', async () => {
    const polish = vi.fn();
    const { deps } = setup([para('a', '一')], { polish });
    await expect(runChapterTask(item({ kind: 'polish', mode: undefined }), deps, signal)).rejects.toThrow('NO_TRANSLATION');
    expect(polish).not.toHaveBeenCalled();
  });

  it('继续翻译时全部已翻译：不调用服务，返回 targetCount 0', async () => {
    const translate = vi.fn();
    const { deps } = setup([para('a', '一', '1')], { translate });
    const result = await runChapterTask(item(), deps, signal);
    expect(result.targetCount).toBe(0);
    expect(translate).not.toHaveBeenCalled();
  });

  it('addTask 注入 queueItemId，记下 taskId，进度只按该 taskId 更新', async () => {
    const translate = vi.fn(async (_paragraphs, _model, options) => {
      await options.aiProcessingStore.addTask({ type: 'translation', modelName: 'M', status: 'thinking' });
      options.onProgress?.({ total: 1, current: 1, currentParagraphs: ['a'] });
      await options.onParagraphTranslation?.([{ id: 'a', translation: '译' }]);
      return { text: '', actions: [] };
    });
    const { deps, added, updates, persisted } = setup([para('a', '一')], { translate });
    await runChapterTask(item(), deps, signal);
    expect(added[0]?.queueItemId).toBe('q1');
    expect(persisted.some((p) => p.aiTaskIds?.includes('task-1'))).toBe(true);
    const progressUpdates = updates.filter((u) => u.updates.progress);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates.every((u) => u.id === 'task-1')).toBe(true);
  });

  it('翻译：段落落盘成功后才记为完成并持久化', async () => {
    const translate = vi.fn(async (_paragraphs, _model, options) => {
      await options.onParagraphTranslation?.([{ id: 'a', translation: '译a' }]);
      await options.onParagraphTranslation?.([{ id: 'b', translation: '译b' }]);
      return { text: '', actions: [] };
    });
    const { deps, order } = setup([para('a', '一'), para('b', '二')], { translate });
    const result = await runChapterTask(item(), deps, signal);
    expect(result.appliedCount).toBe(2);
    const saveA = order.indexOf('save:a');
    const persistA = order.indexOf('persist:a');
    expect(saveA).toBeGreaterThan(-1);
    expect(persistA).toBeGreaterThan(saveA);
    expect(order.indexOf('persist:a,b')).toBeGreaterThan(order.indexOf('save:b'));
  });

  it('翻译中途抛出时，已落盘的批次已记为完成，异常向上传递', async () => {
    const translate = vi.fn(async (_paragraphs, _model, options) => {
      await options.onParagraphTranslation?.([{ id: 'a', translation: '译a' }]);
      throw new Error('请求已取消');
    });
    const { deps, persisted } = setup([para('a', '一'), para('b', '二')], { translate });
    await expect(runChapterTask(item(), deps, signal)).rejects.toThrow('请求已取消');
    expect(persisted.at(-1)?.completedParagraphIds).toEqual(['a']);
  });

  it('润色按块边界记完成：看过但未改动的段落也算完成，同块重试不算换块', async () => {
    const polish = vi.fn(async (_paragraphs, _model, options) => {
      options.onProgress?.({ total: 2, current: 1, currentParagraphs: ['a', 'b'] });
      await options.onParagraphPolish?.([{ id: 'a', translation: '新a' }]);
      // 同一块重试
      options.onProgress?.({ total: 2, current: 1, currentParagraphs: ['a', 'b'] });
      options.onProgress?.({ total: 2, current: 2, currentParagraphs: ['c'] });
      return { text: '', actions: [] };
    });
    const paragraphs = [para('a', '一', '1'), para('b', '二', '2'), para('c', '三', '3')];
    const { deps, persisted, saved } = setup(paragraphs, { polish });
    const result = await runChapterTask(item({ kind: 'polish', mode: undefined }), deps, signal);
    expect(saved).toEqual([['a']]);
    expect(result.appliedCount).toBe(1);
    expect(new Set(persisted.at(-1)?.completedParagraphIds)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('润色中断后恢复：只处理剩余段落', async () => {
    const polish = vi.fn(() => Promise.resolve({ text: '', actions: [] }));
    const paragraphs = [para('a', '一', '1'), para('b', '二', '2'), para('c', '三', '3')];
    const { deps } = setup(paragraphs, { polish });
    await runChapterTask(
      item({ kind: 'polish', mode: undefined, targetParagraphIds: ['a', 'b', 'c'], targetLanguage: 'zh-CN', completedParagraphIds: ['a', 'b'] }),
      deps,
      signal,
    );
    const calls = polish.mock.calls as unknown as [Paragraph[]][];
    const sent = calls[0]![0].map((p) => p.id);
    expect(sent).toEqual(['c']);
  });

  it('翻译时回写标题译文', async () => {
    const translate = vi.fn(async (_paragraphs, _model, options) => {
      await options.onTitleTranslation?.('第一章 译');
      return { text: '', actions: [] };
    });
    const { deps } = setup([para('a', '一')], { translate });
    await runChapterTask(item(), deps, signal);
    expect(deps.saveTitleTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ chapterId: 'c1', expectedOriginal: '第c1章', translation: '第一章 译' }),
    );
  });
});
