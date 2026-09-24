import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import './setup';

import { SyncDataService, type SyncMergeReport } from '../services/sync-data-service';
import { GlobalConfig } from '../services/global-config-cache';
import * as SettingsStore from '../stores/settings';
import * as BooksStore from '../stores/books';
import * as AIModelsStore from '../stores/ai-models';
import * as CoverHistoryStore from '../stores/cover-history';
import {
  getChapterBaselines,
  putChapterBaselines,
  recordStructureBaselines,
} from '../services/sync-chapter-baselines';
import { getDB } from '../utils/indexed-db';
import { chapterStructureHash } from '../utils/chapter-structure-hash';
import type { Chapter, Novel, Paragraph } from '../models/novel';
import type { SyncConfig } from '../models/sync';
import { SyncType } from '../models/sync';

const LAST_SYNC = 1_000_000;

function makeConfig(): SyncConfig {
  return {
    enabled: true,
    lastSyncTime: LAST_SYNC,
    syncInterval: 0,
    syncType: SyncType.Gist,
    syncParams: {},
    secret: '',
    apiEndpoint: '',
    deletedNovelIds: [],
    deletedModelIds: [],
    deletedCoverIds: [],
    deletedMemoryIds: [],
  };
}

function p(id: string, text: string, translations: string[] = []): Paragraph {
  const list = translations.map((t) => ({ id: `${id}-${t}`, translation: t, aiModelId: 'm' }));
  return { id, text, selectedTranslationId: list[0]?.id ?? '', translations: list };
}

function chapter(id: string, content: Paragraph[] | undefined, edited: number, webUrl?: string) {
  return {
    id,
    title: `第${id}话`,
    lastEdited: new Date(edited),
    createdAt: new Date(0),
    ...(webUrl ? { webUrl } : {}),
    ...(content ? { content } : {}),
  } as Chapter;
}

function novel(chapters: Chapter[], edited: number): Novel {
  return {
    id: 'b1',
    title: '测试书',
    createdAt: new Date(0),
    lastEdited: new Date(edited),
    volumes: [{ id: 'v1', title: '卷一', chapters }],
  };
}

/** 模拟 gist 下载：Date 变为 ISO 字符串 */
function asRemote(book: Novel): Novel {
  return JSON.parse(JSON.stringify(book)) as Novel;
}

async function baseline(chapterId: string, content: Paragraph[]) {
  await putChapterBaselines([
    { chapterId, bookId: 'b1', hash: await chapterStructureHash(content) },
  ]);
}

let books: Novel[];
let bulkAddBooks: ReturnType<typeof mock>;

function saved(): Novel {
  const calls = bulkAddBooks.mock.calls;
  const last = calls[calls.length - 1]![0] as Novel[];
  return last[0]!;
}

function savedContent(chapterIndex = 0): Paragraph[] {
  return saved().volumes![0]!.chapters![chapterIndex]!.content!;
}

async function applyRemote(remote: Novel, report?: SyncMergeReport) {
  return SyncDataService.applyPartialRemoteData(
    { 'novel:b1': { kind: 'novel', value: asRemote(remote) } },
    report,
  );
}

beforeEach(() => {
  books = [];
  bulkAddBooks = mock((incoming: Novel[]) => {
    books = incoming;
    return Promise.resolve();
  });
  spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
  spyOn(GlobalConfig, 'getGistSyncSnapshot').mockImplementation(() => makeConfig());
  spyOn(BooksStore, 'useBooksStore').mockImplementation(((): unknown => ({
    books,
    bulkAddBooks,
  })) as unknown as typeof BooksStore.useBooksStore);
  spyOn(SettingsStore, 'useSettingsStore').mockReturnValue({
    getAllSettings: () => ({ lastEdited: new Date(0) }),
    updateGistSync: mock(() => Promise.resolve()),
    cleanupOldDeletionRecords: mock(() => Promise.resolve()),
  } as unknown as ReturnType<typeof SettingsStore.useSettingsStore>);
  spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({
    models: [],
  } as unknown as ReturnType<typeof AIModelsStore.useAIModelsStore>);
  spyOn(CoverHistoryStore, 'useCoverHistoryStore').mockReturnValue({
    covers: [],
  } as unknown as ReturnType<typeof CoverHistoryStore.useCoverHistoryStore>);
});

afterEach(() => {
  mock.restore();
});

describe('同步段落结构裁决：复现现有错误', () => {
  it('删除的段落不再在章末复活', async () => {
    const base = [p('p1', '一'), p('p2', '二'), p('p3', '三')];
    await baseline('c12', base);
    books = [novel([chapter('c12', base, 1000)], 1000)];
    const remote = novel([chapter('c12', [p('p1', '一'), p('p2', '二')], 2000)], 2000);

    await applyRemote(remote);

    expect(savedContent().map((x) => x.id)).toEqual(['p1', 'p2']);
  });

  it('修订后的段落不带回旧译文', async () => {
    const base = [p('p30', '旧原文')];
    await baseline('c12', base);
    books = [novel([chapter('c12', [p('p30', '旧原文', ['旧译一', '旧译二'])], 1000)], 1000)];
    const remote = novel([chapter('c12', [p('p30', '新原文')], 2000)], 2000);

    await applyRemote(remote);

    const merged = savedContent();
    expect(merged).toHaveLength(1);
    expect(merged[0]!.text).toBe('新原文');
    expect(merged[0]!.translations).toEqual([]);
  });

  it('旧设备翻译后仍不能撤回另一台设备的结构修订', async () => {
    const base = [p('p1', '一'), p('p2', '二'), p('p3', '三')];
    await baseline('c12', base);
    // 设备 B：结构与基准相同，但在 A 上传之后翻译过，章节与书的时间都更新
    books = [
      novel(
        [chapter('c12', [p('p1', '一', ['one']), p('p2', '二', ['two']), p('p3', '三')], 3000)],
        3000,
      ),
    ];
    // 设备 A：修订第 2 段原文、删除第 3 段
    const remote = novel([chapter('c12', [p('p1', '一'), p('p2', '二改')], 2000)], 2000);

    await applyRemote(remote);

    const merged = savedContent();
    expect(merged.map((x) => [x.id, x.text])).toEqual([
      ['p1', '一'],
      ['p2', '二改'],
    ]);
    expect(merged[0]!.translations.map((t) => t.translation)).toEqual(['one']);
    expect(merged[1]!.translations).toEqual([]);
  });
});

describe('同步段落结构裁决：其余规则', () => {
  it('原文相同的段落合并双方译文', async () => {
    books = [novel([chapter('c1', [p('p5', '五', ['本地译'])], 1000)], 1000)];
    const remote = novel([chapter('c1', [p('p5', '五', ['远端译'])], 2000)], 2000);

    await applyRemote(remote);

    const translations = savedContent()[0]!.translations.map((t) => t.translation);
    expect(translations.sort()).toEqual(['本地译', '远端译']);
  });

  it('没有基准时保持现有行为：较新的章节为主并追加另一方独有的段落', async () => {
    books = [novel([chapter('c1', [p('p1', '一'), p('p2', '二')], 1000)], 1000)];
    const remote = novel([chapter('c1', [p('p1', '一')], 2000)], 2000);

    await applyRemote(remote);

    expect(savedContent().map((x) => x.id)).toEqual(['p1', 'p2']);
  });

  it('两方结构都与基准相同时只合并译文', async () => {
    const base = [p('p1', '一'), p('p2', '二')];
    await baseline('c1', base);
    books = [novel([chapter('c1', [p('p1', '一', ['one']), p('p2', '二')], 1000)], 1000)];
    const remote = novel([chapter('c1', [p('p1', '一'), p('p2', '二', ['two'])], 2000)], 2000);
    const report: SyncMergeReport = { structureConflicts: [] };

    await applyRemote(remote, report);

    const merged = savedContent();
    expect(merged.map((x) => x.translations.map((t) => t.translation))).toEqual([['one'], ['two']]);
    expect(report.structureConflicts).toEqual([]);
  });

  it('只有本地改过结构时以本地为准，即使远端章节更新', async () => {
    const base = [p('p1', '一'), p('p2', '二')];
    await baseline('c1', base);
    books = [novel([chapter('c1', [p('p1', '一'), p('p2', '二'), p('p3', '三')], 1000)], 1000)];
    const remote = novel([chapter('c1', [p('p1', '一', ['one']), p('p2', '二')], 2000)], 2000);

    await applyRemote(remote);

    const merged = savedContent();
    expect(merged.map((x) => x.id)).toEqual(['p1', 'p2', 'p3']);
    expect(merged[0]!.translations.map((t) => t.translation)).toEqual(['one']);
  });

  it('两方都改过结构时沿用现有规则并记录冲突', async () => {
    const base = [p('p1', '一'), p('p2', '二')];
    await baseline('c12', base);
    books = [novel([chapter('c12', [p('p1', '一'), p('p2', '二'), p('pL', '本地')], 1000)], 1000)];
    const remote = novel(
      [chapter('c12', [p('p1', '一'), p('p2', '二'), p('pR', '远端')], 2000)],
      2000,
    );
    const report: SyncMergeReport = { structureConflicts: [] };

    await applyRemote(remote, report);

    expect(savedContent().map((x) => x.id)).toEqual(['p1', 'p2', 'pR', 'pL']);
    expect(report.structureConflicts).toEqual([
      { bookId: 'b1', bookTitle: '测试书', chapterId: 'c12', chapterTitle: '第c12话' },
    ]);
  });

  it('webUrl 配对且章节 ID 不同时视为没有基准', async () => {
    const local = [p('p1', '一'), p('p2', '二')];
    const remoteContent = [p('p1', '一')];
    // 若误用了任一侧 ID 的基准，都会判定为单方修改而不追加 p2
    await baseline('c-local', local);
    await baseline('c-remote', local);
    books = [novel([chapter('c-local', local, 1000, 'https://x/1')], 1000)];
    const remote = novel([chapter('c-remote', remoteContent, 2000, 'https://x/1')], 2000);

    await applyRemote(remote);

    expect(savedContent().map((x) => x.id)).toEqual(['p1', 'p2']);
  });

  it('远端章节缺少内联正文时按没有基准处理', async () => {
    const base = [p('p1', '一'), p('p2', '二')];
    await baseline('c1', base);
    books = [novel([chapter('c1', [p('p1', '一')], 1000)], 1000)];
    const remote = novel([chapter('c1', undefined, 2000)], 2000);
    const report: SyncMergeReport = { structureConflicts: [] };

    await applyRemote(remote, report);

    expect(savedContent().map((x) => x.id)).toEqual(['p1']);
    expect(report.structureConflicts).toEqual([]);
  });
});

describe('旧版全量下载入口同样按基准裁决', () => {
  it('applyDownloadedData 使用基准：删除的段落不复活，并记录冲突报告', async () => {
    const base = [p('p1', '一'), p('p2', '二'), p('p3', '三')];
    await baseline('c12', base);
    await baseline('c13', [p('q1', '一')]);
    books = [
      novel(
        [chapter('c12', base, 1000), chapter('c13', [p('q1', '一'), p('qL', '本地')], 1000)],
        1000,
      ),
    ];
    const remote = novel(
      [
        chapter('c12', [p('p1', '一'), p('p2', '二')], 2000),
        chapter('c13', [p('q1', '一'), p('qR', '远端')], 2000),
      ],
      2000,
    );
    const report: SyncMergeReport = { structureConflicts: [] };

    await SyncDataService.applyDownloadedData(
      { novels: [asRemote(remote)] },
      LAST_SYNC,
      false,
      report,
    );

    expect(savedContent(0).map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(report.structureConflicts.map((c) => c.chapterId)).toEqual(['c13']);
    const baselines = await getChapterBaselines(['c12']);
    expect(baselines.get('c12')).toBe(await chapterStructureHash([p('p1', '一'), p('p2', '二')]));
  });
});

describe('下载应用后写入基准', () => {
  it('应用成功后写入远端条目的结构（不是合并结果）', async () => {
    books = [novel([chapter('c1', [p('p1', '一'), p('pL', '本地')], 3000)], 3000)];
    const remoteContent = [p('p1', '一'), p('pR', '远端')];
    const remote = novel([chapter('c1', remoteContent, 2000)], 2000);

    await applyRemote(remote);

    const merged = savedContent().map((x) => x.id);
    expect(merged).toEqual(['p1', 'pL', 'pR']);
    const baselines = await getChapterBaselines(['c1']);
    expect(baselines.get('c1')).toBe(await chapterStructureHash(remoteContent));
  });

  it('本地没有该书时，写入新书的结构基准', async () => {
    const remoteContent = [p('p1', '一')];
    await applyRemote(novel([chapter('c1', remoteContent, 2000)], 2000));

    const baselines = await getChapterBaselines(['c1']);
    expect(baselines.get('c1')).toBe(await chapterStructureHash(remoteContent));
  });

  it('应用失败的条目保留原有基准', async () => {
    const base = [p('p1', '一')];
    await baseline('c1', base);
    books = [novel([chapter('c1', base, 1000)], 1000)];
    bulkAddBooks.mockImplementation(() => Promise.reject(new Error('写入失败')));

    const failed = await applyRemote(novel([chapter('c1', [p('p9', '九')], 2000)], 2000));

    expect(failed).toEqual(['novel:b1']);
    const baselines = await getChapterBaselines(['c1']);
    expect(baselines.get('c1')).toBe(await chapterStructureHash(base));
  });

  it('远端章节没有内联正文时不写基准', async () => {
    books = [novel([chapter('c1', [p('p1', '一')], 1000)], 1000)];

    await applyRemote(novel([chapter('c1', undefined, 2000)], 2000));

    expect((await getChapterBaselines(['c1'])).has('c1')).toBe(false);
  });
});

describe('双设备端到端模拟', () => {
  interface Device {
    books: Novel[];
    baselines: Array<{ chapterId: string; bookId: string; hash: string; recordedAt: number }>;
  }

  async function useDevice(device: Device, run: () => Promise<void>) {
    const db = await getDB();
    await db.clear('sync-chapter-baselines');
    for (const record of device.baselines) await db.put('sync-chapter-baselines', record);
    books = device.books;
    await run();
    device.books = books;
    device.baselines = await db.getAll('sync-chapter-baselines');
  }

  /** 模拟一次同步：先下载应用远端，再把本地结果上传并记录上传时的结构 */
  async function sync(device: Device, remote: { book: Novel }) {
    await useDevice(device, async () => {
      await applyRemote(remote.book);
      remote.book = asRemote(books[0]!);
      await recordStructureBaselines([remote.book]);
    });
  }

  it('A 修订并上传，B 翻译后同步，再回到 A 同步：两边都是 A 的结构且保留 B 的新译文', async () => {
    const base = [p('p1', '一'), p('p2', '二'), p('p3', '三')];
    const baseHash = await chapterStructureHash(base);
    const initialBaselines = [{ chapterId: 'c12', bookId: 'b1', hash: baseHash, recordedAt: 0 }];
    const deviceA: Device = {
      books: [novel([chapter('c12', base, 1000)], 1000)],
      baselines: [...initialBaselines],
    };
    const deviceB: Device = {
      books: [novel([chapter('c12', base, 1000)], 1000)],
      baselines: [...initialBaselines],
    };
    const remote = { book: asRemote(novel([chapter('c12', base, 1000)], 1000)) };

    // 设备 A：修订第 2 段、删除第 3 段，然后上传
    deviceA.books = [novel([chapter('c12', [p('p1', '一'), p('p2', '二改')], 2000)], 2000)];
    await useDevice(deviceA, async () => {
      remote.book = asRemote(books[0]!);
      await recordStructureBaselines([remote.book]);
    });

    // 设备 B：未同步，翻译了第 1、2 段（旧原文），时间晚于 A
    deviceB.books = [
      novel(
        [chapter('c12', [p('p1', '一', ['one']), p('p2', '二', ['two']), p('p3', '三')], 3000)],
        3000,
      ),
    ];
    await sync(deviceB, remote);

    // 回到设备 A 同步
    await sync(deviceA, remote);

    for (const device of [deviceA, deviceB]) {
      const content = device.books[0]!.volumes![0]!.chapters![0]!.content!;
      expect(content.map((x) => [x.id, x.text])).toEqual([
        ['p1', '一'],
        ['p2', '二改'],
      ]);
      expect(content[0]!.translations.map((t) => t.translation)).toEqual(['one']);
      expect(content[1]!.translations).toEqual([]);
    }
  });
});
