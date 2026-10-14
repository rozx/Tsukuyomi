import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from 'src/services/settings-service';
import { SyncDataService } from 'src/services/sync-data-service';
import type { SettingsImportStage } from 'src/services/sync-data-service';
import * as electronSettings from 'src/composables/useElectronSettings';
import { useSettingsStore } from 'src/stores/settings';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { MemoryService } from 'src/services/memory-service';
import type { Novel } from 'src/models/novel';
import { useSettingsImportExport } from 'src/composables/settings/useSettingsImportExport';

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock('src/composables/useToastHistory', () => ({
  useToastWithHistory: () => ({ add: toastAdd }),
}));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const FILE = new File(['{}'], 'backup.json', { type: 'application/json' });
const PARSED = {
  success: true as const,
  data: { models: [], novels: [], coverHistory: [] },
  message: '已导入 0 本书',
};

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(async () => {
  toastAdd.mockClear();
  await useSettingsStore().loadSettings();
  await useSettingsStore().setUiLocale('zh-CN');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('导入资料', () => {
  it('依次显示读取与各写入阶段，进度递增，结束后恢复空闲并提示成功', async () => {
    const parse = deferred<typeof PARSED>();
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockReturnValue(parse.promise);
    let report!: (stage: SettingsImportStage) => void;
    const apply = deferred();
    vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockImplementation(
      (_data, _id, onProgress) => {
        report = onProgress!;
        return apply.promise;
      },
    );
    const s = useSettingsImportExport();

    const running = s.importFromFile(FILE);
    expect(s.busy.value).toBe('import');
    expect(s.stage.value).toBe('reading');
    expect(s.statusText.value).toBe('正在读取并校验文件…');
    const readingProgress = s.progress.value!;

    parse.resolve(PARSED);
    await flush();
    report('backup');
    expect(s.statusText.value).toBe('正在备份当前数据…');
    report('novels');
    expect(s.statusText.value).toBe('正在导入书籍…');
    expect(s.progress.value!).toBeGreaterThan(readingProgress);
    report('finalize');
    const finalizing = s.progress.value!;
    expect(finalizing).toBeLessThan(100);

    apply.resolve();
    await running;

    expect(s.busy.value).toBeNull();
    expect(s.stage.value).toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', detail: '已导入 0 本书' }),
    );
  });

  it('进行中再次触发导入或导出会被忽略', async () => {
    const parse = deferred<typeof PARSED>();
    const read = vi.spyOn(SettingsService, 'importSettingsFromFile').mockReturnValue(parse.promise);
    vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockResolvedValue();
    const load = vi.spyOn(electronSettings, 'loadBooksWithContentAndMemories');
    const s = useSettingsImportExport();

    const running = s.importFromFile(FILE);
    await s.importFromFile(FILE);
    await s.exportSettings();

    expect(read).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
    parse.resolve(PARSED);
    await running;
  });

  it('文件校验失败：提示错误，不写入数据，恢复空闲', async () => {
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockResolvedValue({
      success: false,
      error: '文件格式不正确',
    });
    const apply = vi.spyOn(SyncDataService, 'importSettingsSnapshot');
    const s = useSettingsImportExport();

    await s.importFromFile(FILE);

    expect(apply).not.toHaveBeenCalled();
    expect(s.busy.value).toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: '文件格式不正确' }),
    );
  });

  it('写入数据时出错：提示错误原因（之前会静默失败），恢复空闲', async () => {
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockResolvedValue(PARSED);
    vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockRejectedValue(new Error('quota'));
    const s = useSettingsImportExport();

    await s.importFromFile(FILE);

    expect(s.busy.value).toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: expect.stringContaining('quota') }),
    );
  });

  it('界面语言切换时阶段文字跟着变', async () => {
    const parse = deferred<typeof PARSED>();
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockReturnValue(parse.promise);
    vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockResolvedValue();
    const s = useSettingsImportExport();

    const running = s.importFromFile(FILE);
    await useSettingsStore().setUiLocale('en-US');
    expect(s.statusText.value).not.toMatch(/[一-鿿]/);

    parse.resolve(PARSED);
    await running;
  });
});

describe('导出资料', () => {
  it('导出期间显示状态（进度不确定），结束后恢复空闲并提示成功', async () => {
    const load = deferred<{ novelsWithContent: never[]; memories: never[] }>();
    vi.spyOn(electronSettings, 'loadBooksWithContentAndMemories').mockReturnValue(load.promise);
    vi.spyOn(SettingsService, 'exportSettings').mockReturnValue({ success: true });
    const s = useSettingsImportExport();

    const running = s.exportSettings();
    expect(s.busy.value).toBe('export');
    expect(s.stage.value).toBe('exporting');
    expect(s.progress.value).toBeNull();
    expect(s.statusText.value).toBe('正在打包导出数据…');

    load.resolve({ novelsWithContent: [], memories: [] });
    await running;

    expect(s.busy.value).toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('读取书籍内容出错：提示错误，恢复空闲', async () => {
    vi.spyOn(electronSettings, 'loadBooksWithContentAndMemories').mockRejectedValue(
      new Error('disk'),
    );
    const s = useSettingsImportExport();

    await s.exportSettings();

    expect(s.busy.value).toBeNull();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error', detail: expect.stringContaining('disk') }),
    );
  });
});

describe('结果状态', () => {
  it('导入成功后保留结果状态，下次操作开始时清空', async () => {
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockResolvedValue(PARSED);
    vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockResolvedValue();
    const s = useSettingsImportExport();
    expect(s.lastResult.value).toBeNull();

    await s.importFromFile(FILE);

    expect(s.lastResult.value).toMatchObject({
      kind: 'import',
      ok: true,
      detail: '已导入 0 本书',
    });
    expect(s.lastResult.value!.at).toBeGreaterThan(0);

    const parse = deferred<typeof PARSED>();
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockReturnValue(parse.promise);
    const running = s.importFromFile(FILE);
    expect(s.lastResult.value).toBeNull();
    parse.resolve(PARSED);
    await running;
  });

  it.each([
    [
      '文件校验失败',
      () =>
        vi
          .spyOn(SettingsService, 'importSettingsFromFile')
          .mockResolvedValue({ success: false, error: '文件格式不正确' }),
      '文件格式不正确',
    ],
    [
      '写入失败',
      () => {
        vi.spyOn(SettingsService, 'importSettingsFromFile').mockResolvedValue(PARSED);
        vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockRejectedValue(new Error('quota'));
      },
      'quota',
    ],
  ])('导入%s后保留失败状态与原因', async (_name, arrange, detail) => {
    arrange();
    const s = useSettingsImportExport();
    await s.importFromFile(FILE);
    expect(s.lastResult.value).toMatchObject({ kind: 'import', ok: false });
    expect(s.lastResult.value!.detail).toContain(detail);
  });

  it('导出成功与失败同样保留结果状态', async () => {
    vi.spyOn(electronSettings, 'loadBooksWithContentAndMemories').mockResolvedValue({
      novelsWithContent: [],
      memories: [],
    });
    vi.spyOn(SettingsService, 'exportSettings').mockReturnValue({ success: true });
    const s = useSettingsImportExport();
    await s.exportSettings();
    expect(s.lastResult.value).toMatchObject({ kind: 'export', ok: true });

    vi.spyOn(SettingsService, 'exportSettings').mockReturnValue({
      success: false,
      error: '写入失败',
    });
    await s.exportSettings();
    expect(s.lastResult.value).toMatchObject({ kind: 'export', ok: false, detail: '写入失败' });
  });
});

describe('当前数据', () => {
  function book(id: string, chapters: number): Novel {
    return {
      id,
      title: id,
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [
        {
          id: 'v',
          title: '卷',
          chapters: Array.from({ length: chapters }, (_, i) => ({
            id: `${id}-${i}`,
            title: `${i}`,
            createdAt: new Date(0),
            lastEdited: new Date(0),
          })),
        },
      ],
    } as Novel;
  }

  it('统计将被覆盖的各类数据数量，Memory 异步统计完成前为 null', async () => {
    const count = deferred<number>();
    vi.spyOn(MemoryService, 'countAllMemories').mockReturnValue(count.promise);
    useAIModelsStore().$patch({ models: [{ id: 'm1' }, { id: 'm2' }] as never });
    useBooksStore().$patch({ books: [book('a', 3), book('b', 2)] });
    useCoverHistoryStore().$patch({ covers: [{ id: 'c1' }] as never });
    useSettingsStore().$patch({ syncs: [{ id: 's1' }] as never });

    const s = useSettingsImportExport();
    expect(s.currentData.value).toEqual({
      models: 2,
      books: 2,
      chapters: 5,
      covers: 1,
      memories: null,
      syncs: 1,
    });

    count.resolve(7);
    await flush();
    expect(s.currentData.value.memories).toBe(7);
  });

  it('随 store 变化更新', () => {
    vi.spyOn(MemoryService, 'countAllMemories').mockResolvedValue(0);
    const s = useSettingsImportExport();
    useBooksStore().$patch({ books: [book('a', 4)] });
    expect(s.currentData.value).toMatchObject({ books: 1, chapters: 4 });
  });

  it.each([
    ['成功', () => vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockResolvedValue()],
    [
      '失败回滚',
      () => vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockRejectedValue(new Error('x')),
    ],
  ])('导入%s后重新统计 Memory', async (_name, arrange) => {
    const countSpy = vi.spyOn(MemoryService, 'countAllMemories').mockResolvedValueOnce(5);
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockResolvedValue(PARSED);
    arrange();
    const s = useSettingsImportExport();
    await flush();
    expect(s.currentData.value.memories).toBe(5);

    countSpy.mockResolvedValueOnce(9);
    await s.importFromFile(FILE);
    await flush();

    expect(s.currentData.value.memories).toBe(9);
  });

  it('Memory 统计出错时显示为 null，不影响其他数量', async () => {
    vi.spyOn(MemoryService, 'countAllMemories').mockRejectedValue(new Error('db'));
    const s = useSettingsImportExport();
    await flush();
    expect(s.currentData.value.memories).toBeNull();
    expect(s.currentData.value.books).toBe(0);
  });
});

describe('切换选项卡（组件卸载后重新挂载）', () => {
  it('新实例沿用进行中的状态，且不能再启动导入或导出', async () => {
    const parse = deferred<typeof PARSED>();
    const read = vi.spyOn(SettingsService, 'importSettingsFromFile').mockReturnValue(parse.promise);
    vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockResolvedValue();
    const load = vi.spyOn(electronSettings, 'loadBooksWithContentAndMemories');
    const before = useSettingsImportExport();
    const running = before.importFromFile(FILE);

    const after = useSettingsImportExport();
    expect(after.busy.value).toBe('import');
    expect(after.stage.value).toBe('reading');
    expect(after.progress.value).not.toBeNull();
    await after.importFromFile(FILE);
    await after.exportSettings();
    expect(read).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();

    parse.resolve(PARSED);
    await running;
    expect(after.busy.value).toBeNull();
    expect(after.lastResult.value).toMatchObject({ kind: 'import', ok: true });
  });

  it('操作结束后重新进入时仍能看到上次结果', async () => {
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockResolvedValue(PARSED);
    vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockResolvedValue();
    await useSettingsImportExport().importFromFile(FILE);

    expect(useSettingsImportExport().lastResult.value).toMatchObject({
      kind: 'import',
      ok: true,
      detail: '已导入 0 本书',
    });
  });

  it('导入中途重新进入的实例，在导入结束后也会看到重新统计的 Memory 数量', async () => {
    const countSpy = vi.spyOn(MemoryService, 'countAllMemories').mockResolvedValue(5);
    const parse = deferred<typeof PARSED>();
    vi.spyOn(SettingsService, 'importSettingsFromFile').mockReturnValue(parse.promise);
    vi.spyOn(SyncDataService, 'importSettingsSnapshot').mockResolvedValue();
    const running = useSettingsImportExport().importFromFile(FILE);
    const after = useSettingsImportExport();
    await flush();
    expect(after.currentData.value.memories).toBe(5);

    countSpy.mockResolvedValue(0);
    parse.resolve(PARSED);
    await running;
    await flush();

    expect(after.currentData.value.memories).toBe(0);
  });
});
