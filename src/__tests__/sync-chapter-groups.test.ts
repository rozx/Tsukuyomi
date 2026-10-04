import './setup';
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { expect as check } from 'vitest';
import type { Octokit } from '@octokit/rest';
import type { Chapter, Novel } from '../models/novel';
import type { AppSettings } from '../models/settings';
import { MANIFEST_SCHEMA_VERSION } from '../models/manifest';
import { SyncType, type SyncConfig } from '../models/sync';
import {
  downloadWithManifest,
  uploadIncremental,
  type UploadPayload,
} from '../services/gist-sync-incremental';
import {
  buildMemoriesPayload,
  buildLocalManifest,
  manifestToHashes,
  manifestToEntries,
} from '../services/sync-manifest-builder';
import { chapterGroupId } from '../services/sync-chapter-layout';
import { GistSyncService } from '../services/gist-sync-service';
import { canonicalStringify } from '../utils/canonical-json';
import { hashJson } from '../utils/content-hash';
import { normalizeBookLanguages } from '../services/localization/normalize';
import { stripNovelLocalFields } from '../utils/sync-strip';
import { SyncDataService } from '../services/sync-data-service';
import { GlobalConfig } from '../services/global-config-cache';
import * as BooksStore from '../stores/books';

afterEach(() => mock.restore());

function chapter(id: string): Chapter {
  return {
    id,
    title: id,
    createdAt: new Date(0),
    lastEdited: new Date(0),
    content: [{ id: `p-${id}`, text: `正文 ${id}`, translations: [], selectedTranslationId: '' }],
    originalContent: `原始正文 ${id}`,
  };
}

function variedText(bytes: number): string {
  let seed = 12345;
  const data = new Uint8Array(bytes);
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = seed & 255;
  }
  return Buffer.from(data).toString('base64');
}

function fixture(count = 32) {
  const novel: Novel = {
    id: 'book-1',
    title: '测试书籍',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'volume-1',
        title: '卷一',
        chapters: Array.from({ length: count }, (_, i) => chapter(`c-${i}`)),
      },
    ],
  };
  const payload: UploadPayload = {
    appSettings: { lastEdited: new Date(0) } as AppSettings,
    novels: [novel],
    aiModels: [],
    coverHistory: [],
    memoriesByBook: {},
  };
  const config: SyncConfig = {
    enabled: true,
    lastSyncTime: 1000,
    syncInterval: 300000,
    syncType: SyncType.Gist,
    syncParams: { gistId: 'test-gist', username: 'test' },
    secret: 'test',
    apiEndpoint: '',
    knownRemoteSchemaVersion: MANIFEST_SCHEMA_VERSION,
  };
  const files: Record<string, { content: string }> = {};
  const patches: Array<Record<string, { content: string } | null>> = [];
  const octokit = {
    rest: {
      gists: {
        update: (params: { files: Record<string, { content: string } | null> }) => {
          patches.push(params.files);
          for (const [name, file] of Object.entries(params.files)) {
            if (file) files[name] = file;
            else delete files[name];
          }
          return Promise.resolve({ headers: { etag: 'test-etag' }, data: {} });
        },
      },
    },
  } as unknown as Octokit;
  const upload = async () => {
    patches.length = 0;
    const result = await uploadIncremental(octokit, config, payload, { ...files });
    config.knownRemoteHashes = manifestToHashes(result.manifest);
    config.knownRemoteEntries = manifestToEntries(result.manifest);
    return result;
  };
  return { novel, payload, config, files, patches, octokit, upload };
}

describe('章节小组增量同步', () => {
  it('本地删章、远端只改标题时补下载正文组，恢复及后续上传保留原文和译文', async () => {
    const state = fixture(2);
    const remoteChapter = state.novel.volumes![0]!.chapters![0]!;
    remoteChapter.content![0]!.translations = [
      { id: 'translation-1', translation: '保留译文', aiModelId: 'model-1' },
    ];
    remoteChapter.content![0]!.selectedTranslationId = 'translation-1';
    await state.upload();
    const previousConfig = structuredClone(state.config);
    const local = structuredClone(state.novel);
    local.volumes![0]!.chapters!.shift();
    local.lastEdited = new Date(2000);
    remoteChapter.title = '另一设备的新标题';
    remoteChapter.lastEdited = new Date(3000);
    state.novel.lastEdited = new Date(3000);
    const uploaded = await state.upload();
    expect(uploaded.uploadedEntries).toEqual(['novel:book-1']);
    spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(
        new Response(JSON.stringify({ files: state.files }), {
          headers: { etag: 'remote', 'content-type': 'application/json' },
        }),
      )) as unknown as typeof fetch);
    const result = await new GistSyncService().downloadFromGistWithManifest(
      previousConfig,
      undefined,
      [local],
    );
    if (result.skipped) throw new Error('不应跳过');
    expect(result.failedEntryKeys).toEqual([]);
    const entry = result.changedEntries['novel:book-1'];
    if (entry?.kind !== 'novel') throw new Error('缺少书籍');
    expect(entry.value.volumes![0]!.chapters![0]!.content?.[0]?.text).toBe('正文 c-0');
    expect(entry.unchangedChapterIds).toEqual(['c-1']);
    let saved: Novel | undefined;
    spyOn(GlobalConfig, 'ensureInitialized').mockResolvedValue(undefined);
    spyOn(GlobalConfig, 'getGistSyncSnapshot').mockReturnValue(previousConfig);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      books: [local],
      bulkAddBooks: (books: Novel[]) => {
        saved = books[0];
        return Promise.resolve();
      },
    } as unknown as ReturnType<typeof BooksStore.useBooksStore>);
    expect(await SyncDataService.applyPartialRemoteData(result.changedEntries)).toEqual([]);
    const restored = saved!.volumes![0]!.chapters!.find((chapter) => chapter.id === 'c-0')!;
    expect(restored.title).toBe('另一设备的新标题');
    expect(restored.originalContent).toBe('原始正文 c-0');
    expect(restored.content![0]!.text).toBe('正文 c-0');
    expect(restored.content![0]!.translations[0]!.translation).toBe('保留译文');
    const next = await buildLocalManifest({ ...state.payload, novels: [saved!] });
    const key = `chapters:book-1:${chapterGroupId('c-0')}`;
    expect(next.entries[key]!.hash).toBe(uploaded.manifest.entries[key]!.hash);
  });

  it('本地缺章需要补读的小组缺失时，下载报告失败而不能确认不完整书籍', async () => {
    const state = fixture(1);
    await state.upload();
    const previousConfig = structuredClone(state.config);
    state.novel.volumes![0]!.chapters![0]!.title = '远端标题更新';
    await state.upload();
    const group = chapterGroupId('c-0');
    delete state.files[`chapters-book-1_${group}.json`];
    spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ files: state.files }), { headers: { etag: 'new' } }),
    );
    const result = await downloadWithManifest(previousConfig, undefined, 'zh-CN', []);
    if (result.skipped) throw new Error('不应跳过');
    expect(result.failedEntryKeys).toEqual([`chapters:book-1:${group}`]);
  });

  it('无远端快照时也把已有 manifest 计入中间批次的 300 文件上限', async () => {
    const state = fixture(0);
    state.payload.novels = Array.from({ length: 9 }, (_, i) => ({
      ...state.novel,
      id: `new-${i}`,
    }));
    state.config.knownRemoteHashes = Object.fromEntries(
      Array.from({ length: 290 }, (_, i) => [`novel:old-${i}`, 'old']),
    );
    state.config.knownRemoteEntries = Object.fromEntries(
      Object.entries(state.config.knownRemoteHashes).map(([key, hash]) => [key, { hash }]),
    );
    await check(
      uploadIncremental(state.octokit, state.config, state.payload, {}),
    ).rejects.toMatchObject({ code: 'GIST_FILE_LIMIT_EXCEEDED' });
    expect(state.patches).toHaveLength(0);
  });
  it('强制覆盖无 manifest 的旧布局时清理远端独有旧分块', async () => {
    const state = fixture(0);
    state.payload.novels = [];
    state.files['novel-old.meta.json'] = { content: '{"chunks":1}' };
    state.files['novel-chunk-old#0.json'] = { content: '{}' };
    await uploadIncremental(
      state.octokit,
      state.config,
      state.payload,
      { ...state.files },
      undefined,
      'zh-CN',
      { overwrite: true },
    );
    expect(state.files['novel-chunk-old#0.json']).toBeUndefined();
    expect(state.files['novel-old.meta.json']).toBeUndefined();
  });
  it('v5 多批迁移中断后旧正文仍可读，重试发布 v6 后移除旧文件', async () => {
    const state = fixture(1);
    const text = variedText(3400000);
    state.novel.volumes![0]!.chapters![0]!.content![0]!.text = text;
    const legacyBook = stripNovelLocalFields(normalizeBookLanguages(state.novel));
    const memory = {
      id: 'memory-1',
      bookId: 'book-1',
      content: '旧记忆',
      summary: '',
      createdAt: 0,
      updatedAt: 0,
      lastAccessedAt: 0,
    };
    state.payload.memoriesByBook['book-1'] = [memory];
    const legacyMemories = buildMemoriesPayload([memory], undefined);
    const legacyManifest = {
      schemaVersion: 5,
      updatedAt: '',
      entries: {
        'memories:book-1': {
          hash: await hashJson(legacyMemories),
          lastEdited: new Date(0).toISOString(),
        },
        settings: {
          hash: await hashJson(state.payload.appSettings),
          lastEdited: new Date(0).toISOString(),
        },
        'novel:book-1': { hash: await hashJson(legacyBook), lastEdited: new Date(0).toISOString() },
      },
    };
    state.files['novel-book-1.json'] = { content: canonicalStringify(legacyBook) };
    const legacySettings = canonicalStringify(state.payload.appSettings);
    state.files['tsukuyomi-settings.json'] = { content: legacySettings };
    state.files['memories-book-1.json'] = { content: canonicalStringify(legacyMemories) };
    state.files['manifest.json'] = { content: JSON.stringify(legacyManifest) };
    state.payload.appSettings.lastEdited = new Date(1000);
    memory.content = '新记忆';
    memory.updatedAt = 1000;
    state.config.knownRemoteSchemaVersion = 5;
    state.config.knownRemoteHashes = manifestToHashes(legacyManifest);
    state.config.knownRemoteEntries = manifestToEntries(legacyManifest);
    const update = state.octokit.rest.gists.update;
    let calls = 0;
    const interruption = spyOn(state.octokit.rest.gists, 'update').mockImplementation(((
      params: Parameters<typeof update>[0],
    ) => {
      if (++calls === 3) return Promise.reject(new Error('中断'));
      return update(params);
    }) as typeof update);
    await check(state.upload()).rejects.toThrow('中断');
    expect(JSON.parse(state.files['manifest.json']!.content).pendingUpgradeFrom).toBe(5);
    expect(state.files['novel-book-1.json']!.content).toBe(canonicalStringify(legacyBook));
    expect(state.files['tsukuyomi-settings.json']!.content).toBe(legacySettings);
    expect(state.files['memories-book-1.json']!.content).toBe(canonicalStringify(legacyMemories));
    spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(
        new Response(JSON.stringify({ files: state.files }), {
          headers: { etag: 'pending', 'content-type': 'application/json' },
        }),
      )) as unknown as typeof fetch);
    const pending = await downloadWithManifest(state.config);
    if (pending.skipped) throw new Error('不应跳过');
    expect(pending.failedEntryKeys).toEqual([]);
    expect(pending.needsSchemaUpgrade).toBe(true);
    interruption.mockRestore();
    const completed = await state.upload();
    expect(completed.manifest.schemaVersion).toBe(6);
    expect(completed.manifest.pendingUpgradeFrom).toBeUndefined();
    expect(state.files['novel-book-1.json']).toBeUndefined();
    const restored = await new GistSyncService().downloadFromGistRevision(state.config, 'v6');
    check(restored.success, restored.error).toBe(true);
    expect(restored.data!.novels[0]!.volumes![0]!.chapters![0]!.content![0]!.text).toBe(text);
    expect(restored.data!.memories![0]!.content).toBe('新记忆');
  }, 30000);

  it('大书只新增一章仍只上传一个小组、目录和清单', async () => {
    const state = fixture(32);
    const text = variedText(3200000);
    state.novel.volumes![0]!.chapters!.forEach((c, index) => {
      c.content![0]!.text = text.slice(index * 130000, (index + 1) * 130000);
    });
    await state.upload();
    const originalFiles = { ...state.files };
    state.novel.volumes![0]!.chapters!.push(chapter('new-chapter'));
    await state.upload();
    const written = Object.keys(Object.assign({}, ...state.patches));
    expect(written).toHaveLength(3);
    expect(written.filter((name) => name.startsWith('chapters-'))).toHaveLength(1);
    for (const name of Object.keys(originalFiles).filter((name) => !written.includes(name))) {
      expect(state.files[name]!.content).toBe(originalFiles[name]!.content);
    }
  }, 30000);

  for (const damage of ['missing-file', 'wrong-group', 'missing-chapter', 'bad-hash'] as const) {
    it(`正文小组 ${damage} 时中止下载并保持未确认状态`, async () => {
      const state = fixture(2);
      const uploaded = await state.upload();
      const knownBefore = { ...state.config.knownRemoteHashes };
      const groupId = chapterGroupId('c-0');
      const filename = `chapters-book-1_${groupId}.json`;
      const key = `chapters:book-1:${groupId}`;
      if (damage === 'missing-file') delete state.files[filename];
      else {
        const value = {
          bookId: damage === 'wrong-group' ? 'other-book' : 'book-1',
          groupId,
          chapters: damage === 'missing-chapter' ? [] : [{ id: 'c-0', content: [] }],
        };
        state.files[filename] = { content: JSON.stringify(value) };
        if (damage !== 'bad-hash') uploaded.manifest.entries[key]!.hash = await hashJson(value);
        state.files['manifest.json'] = { content: JSON.stringify(uploaded.manifest) };
      }
      spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ files: state.files }), { headers: { etag: 'broken' } }),
      );
      const result = await downloadWithManifest({ ...state.config, knownRemoteHashes: {} });
      if (result.skipped) throw new Error('不应跳过');
      expect(result.failedEntryKeys?.length).toBeGreaterThan(0);
      expect(state.config.knownRemoteHashes).toEqual(knownBefore);
    });
  }
  it('强制覆盖清理远端独有书籍及其全部正文组', async () => {
    const state = fixture(2);
    await state.upload();
    state.payload.novels = [];
    state.patches.length = 0;
    await uploadIncremental(
      state.octokit,
      { ...state.config, knownRemoteHashes: {}, knownRemoteEntries: {} },
      state.payload,
      { ...state.files },
      undefined,
      'zh-CN',
      { overwrite: true },
    );
    expect(
      Object.keys(state.files).filter(
        (name) => name.startsWith('chapters-') || name.startsWith('book-'),
      ),
    ).toEqual([]);
  });
  it('历史恢复必须重组完整正文，缺失正文组则拒绝恢复', async () => {
    const state = fixture(2);
    await state.upload();
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ files: state.files }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await new GistSyncService().downloadFromGistRevision(state.config, 'revision-1');
    expect(result.success).toBe(true);
    expect(result.data!.novels[0]!.volumes![0]!.chapters![0]!.content![0]!.text).toBe('正文 c-0');
    delete state.files[`chapters-book-1_${chapterGroupId('c-0')}.json`];
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ files: state.files }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const broken = await new GistSyncService().downloadFromGistRevision(state.config, 'revision-2');
    expect(broken.success).toBe(false);
    expect(broken.data).toBeUndefined();
  });
  it('写入将超过 300 文件时，在任何 PATCH 前拒绝', async () => {
    const state = fixture();
    for (let i = 0; i < 290; i++) state.files[`external-${i}.txt`] = { content: '保留' };
    await check(state.upload()).rejects.toMatchObject({ code: 'GIST_FILE_LIMIT_EXCEEDED' });
    expect(state.patches).toHaveLength(0);
    expect(Object.keys(state.files)).toHaveLength(290);
  });

  it('仅正文变化时读取一个小组和目录，其他正文保持未下载', async () => {
    const state = fixture();
    await state.upload();
    const previousConfig = structuredClone(state.config);
    state.novel.volumes![0]!.chapters![0]!.content![0]!.text = '远端编辑';
    await state.upload();
    const requested: string[] = [];
    const remoteFiles = Object.fromEntries(
      Object.keys(state.files).map((name) => [
        name,
        name === 'manifest.json'
          ? state.files[name]
          : { truncated: true, raw_url: `https://raw.test/${name}` },
      ]),
    );
    const fetchImpl = (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('https://raw.test/')) {
        const name = url.slice('https://raw.test/'.length);
        requested.push(name);
        return Promise.resolve(new Response(state.files[name]!.content));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ files: remoteFiles }), { headers: { etag: 'new' } }),
      );
    };
    spyOn(globalThis, 'fetch').mockImplementation(fetchImpl as typeof fetch);
    const result = await downloadWithManifest(previousConfig, undefined, 'zh-CN', [state.novel]);
    if (result.skipped) throw new Error('不应跳过');
    expect(result.failedEntryKeys).toEqual([]);
    expect(requested.sort()).toEqual(
      ['book-book-1.json', `chapters-book-1_${chapterGroupId('c-0')}.json`].sort(),
    );
    const book = result.changedEntries['novel:book-1'];
    if (book?.kind !== 'novel') throw new Error('缺书');
    const untouched = book.value.volumes![0]!.chapters!.find(
      (c) => chapterGroupId(c.id) !== chapterGroupId('c-0'),
    )!;
    expect(untouched.content).toBeUndefined();
    expect(book.unchangedChapterIds).toContain(untouched.id);
  });

  it('章节重排只传目录；删除最后一章会移除空组；删除书籍清理所有正文', async () => {
    const state = fixture(2);
    await state.upload();
    state.novel.volumes![0]!.chapters!.reverse();
    expect((await state.upload()).uploadedEntries).toEqual(['novel:book-1']);
    const removed = state.novel.volumes![0]!.chapters!.pop()!;
    const result = await state.upload();
    expect(result.deletedEntries).toContain(`chapters:book-1:${chapterGroupId(removed.id)}`);
    expect(state.files[`chapters-book-1_${chapterGroupId(removed.id)}.json`]).toBeUndefined();
    state.payload.novels = [];
    await state.upload();
    expect(
      Object.keys(state.files).filter(
        (name) => name.startsWith('chapters-') || name.startsWith('book-'),
      ),
    ).toEqual([]);
  });
  it('新设备下载重组全部章节正文和原始文本', async () => {
    const state = fixture();
    await state.upload();
    spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ files: state.files }), { headers: { etag: 'remote' } }),
    );
    const result = await downloadWithManifest({ ...state.config, knownRemoteHashes: {} });
    if (result.skipped) throw new Error('不应跳过');
    expect(result.failedEntryKeys).toEqual([]);
    const book = result.changedEntries['novel:book-1'];
    if (book?.kind !== 'novel') throw new Error('缺少书籍');
    expect(book.value.volumes![0]!.chapters).toHaveLength(32);
    expect(book.value.volumes![0]!.chapters![0]!.content![0]!.text).toBe('正文 c-0');
    expect(book.value.volumes![0]!.chapters![31]!.originalContent).toBe('原始正文 c-31');
  });
  it('新增一章只上传一个正文小组、书籍目录和清单', async () => {
    const state = fixture();
    await state.upload();
    state.novel.volumes![0]!.chapters!.splice(3, 0, chapter('new-chapter'));
    const result = await state.upload();
    const written = Object.keys(Object.assign({}, ...state.patches));
    expect(result.uploadedEntries.filter((key) => key.startsWith('chapters:'))).toHaveLength(1);
    expect(written).toHaveLength(3);
    expect(written).toContain('book-book-1.json');
    expect(written).toContain('manifest.json');
  });
});
