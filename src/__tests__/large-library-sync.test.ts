import './setup';
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { expect as check } from 'vitest';
import type { Octokit } from '@octokit/rest';
import type { Novel } from '../models/novel';
import type { AppSettings } from '../models/settings';
import { MANIFEST_SCHEMA_VERSION } from '../models/manifest';
import { SyncType, type SyncConfig } from '../models/sync';
import {
  conditionalGetGist,
  downloadWithManifest,
  filenamesForEntry,
  uploadIncremental,
  type GistFileLike,
  type UploadPayload,
} from '../services/gist-sync-incremental';
import { manifestToEntries, manifestToHashes } from '../services/sync-manifest-builder';
import { GistSyncService } from '../services/gist-sync-service';

afterEach(() => mock.restore());

function library(bookCount: number, chapterCount: number, wordsPerChapter: number): UploadPayload {
  const words = Array.from({ length: 4096 }, (_, i) => `word${i.toString(36)}`);
  let seed = 12345;
  const novels: Novel[] = Array.from({ length: bookCount }, (_, bookIndex) => {
    const id = `book-${String(bookIndex).padStart(4, '0')}`;
    return {
      id,
      title: id,
      createdAt: new Date(0),
      lastEdited: new Date(0),
      volumes: [
        {
          id: `${id}-volume`,
          title: '卷一',
          chapters: Array.from({ length: chapterCount }, (_, i) => {
            const text = Array.from({ length: wordsPerChapter }, () => {
              seed ^= seed << 13;
              seed ^= seed >>> 17;
              seed ^= seed << 5;
              return words[(seed >>> 0) % words.length];
            }).join(' ');
            return {
              id: `${id}-chapter-${i}`,
              title: `第 ${i} 章`,
              createdAt: new Date(0),
              lastEdited: new Date(0),
              content: [
                { id: `${id}-paragraph-${i}`, text, translations: [], selectedTranslationId: '' },
              ],
              originalContent: text,
            };
          }),
        },
      ],
    };
  });
  return {
    appSettings: { lastEdited: new Date(0) } as AppSettings,
    aiModels: [],
    coverHistory: [],
    memoriesByBook: {},
    novels,
  };
}

/** 模拟 API 仅返回前 300 个文件；raw URL 使用文件最后修改的修订，头修订单独返回。 */
function gist(legacy?: UploadPayload) {
  const gistId = 'a'.repeat(32);
  const config: SyncConfig = {
    enabled: true,
    syncType: SyncType.Gist,
    syncParams: { gistId, username: 'library-owner' },
    secret: 'test-token',
    apiEndpoint: '',
    lastSyncTime: 0,
    syncInterval: 300000,
    knownRemoteSchemaVersion: MANIFEST_SCHEMA_VERSION,
  };
  type Files = Record<string, { content: string }>;
  let files: Files = {
    'manifest.json': {
      content: JSON.stringify({
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        updatedAt: '',
        entries: {},
      }),
    },
  };
  if (legacy) {
    files = {
      'tsukuyomi-settings.json': {
        content: JSON.stringify({
          appSettings: legacy.appSettings,
          aiModels: legacy.aiModels,
          coverHistory: legacy.coverHistory,
        }),
      },
      ...Object.fromEntries(
        legacy.novels.map((book) => [`novel-${book.id}.json`, { content: JSON.stringify(book) }]),
      ),
    };
    delete config.knownRemoteSchemaVersion;
  }
  let number = 0;
  const revision = () => number.toString(16).padStart(40, '0');
  config.lastRemoteETag = `get-${revision()}`;
  let interruptFinal = false;
  const snapshots = new Map<string, Files>([[revision(), { ...files }]]);
  const lastModified = new Map<string, string>();
  const patches: Array<Record<string, { content: string } | null>> = [];
  const rawRequests: string[] = [];
  const response = (value: unknown, etag = revision()) =>
    new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', etag } });
  const apiData = (sha: string) => {
    const snapshot = snapshots.get(sha)!;
    const names = Object.keys(snapshot).sort();
    return {
      id: gistId,
      history: [{ version: sha }],
      truncated: names.length > 300,
      files: Object.fromEntries(
        names.slice(0, 300).map((name) => [
          name,
          {
            ...(snapshot[name]!.content.length <= 600 ? { content: snapshot[name]!.content } : {}),
            truncated: snapshot[name]!.content.length > 600,
            raw_url: `https://gist.githubusercontent.com/library-owner/${gistId}/raw/${lastModified.get(name) ?? sha}/${name}`,
          },
        ]),
      ),
    };
  };
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.hostname === 'gist.githubusercontent.com') {
      rawRequests.push(url.href);
      const [, , , , sha, name] = url.pathname.split('/');
      const file = snapshots.get(sha!)?.[decodeURIComponent(name!)];
      return Promise.resolve(
        file ? new Response(file.content) : new Response('missing', { status: 404 }),
      );
    }
    const sha = url.pathname.split('/')[3] ?? revision();
    const etag = `get-${sha}`;
    if (new Headers(init?.headers).get('If-None-Match') === etag)
      return Promise.resolve(new Response(null, { status: 304, headers: { etag } }));
    return Promise.resolve(response(apiData(sha), etag));
  };
  spyOn(globalThis, 'fetch').mockImplementation(fetch as typeof globalThis.fetch);
  const octokit = {
    rest: {
      gists: {
        update: (params: { files: Record<string, { content: string } | null> }) => {
          if (interruptFinal && params.files['manifest.json']) {
            interruptFinal = false;
            return Promise.reject(new Error('模拟迁移中断'));
          }
          patches.push(params.files);
          number++;
          files = { ...files };
          for (const [name, file] of Object.entries(params.files)) {
            if (file) {
              files[name] = file;
              lastModified.set(name, revision());
            } else {
              if (!files[name]) throw new Error(`Cannot delete missing file ${name}`);
              delete files[name];
            }
          }
          snapshots.set(revision(), { ...files });
          return Promise.resolve({
            headers: { etag: `patch-${revision()}` },
            data: { history: [{ version: revision() }] },
          });
        },
      },
    },
  } as unknown as Octokit;
  const upload = async (payload: UploadPayload, snapshot?: Record<string, GistFileLike>) => {
    const result = await uploadIncremental(
      octokit,
      config,
      payload,
      snapshot ?? { ...files },
      undefined,
      'zh-CN',
      { checkConcurrency: true },
    );
    config.knownRemoteHashes = manifestToHashes(result.manifest);
    config.knownRemoteEntries = manifestToEntries(result.manifest);
    config.knownRemoteSchemaVersion = result.manifest.schemaVersion;
    config.lastRemoteETag = result.remoteETag;
    return result;
  };
  const removeFile = (name: string) => {
    files = { ...files };
    delete files[name];
    number++;
    snapshots.set(revision(), { ...files });
  };
  return {
    config,
    patches,
    rawRequests,
    upload,
    revision,
    apiData,
    removeFile,
    interruptBeforeManifest: () => {
      interruptFinal = true;
    },
  };
}

describe('多书库文件列表截断', () => {
  for (const history of [false, true]) {
    it(`API 未返回 files 时保持失败，不能恢复为空书库（历史=${history}）`, async () => {
      const remote = gist();
      spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
      );
      const service = new GistSyncService();
      const result = history
        ? await service.downloadFromGistRevision(remote.config, '1'.repeat(40))
        : await service.downloadFromGist(remote.config);
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
    });
  }
  it('清单也未出现在列表中时，按响应的头修订补齐同步文件', async () => {
    const id = 'a'.repeat(32);
    const head = '1'.repeat(40);
    const root = `https://gist.githubusercontent.com/owner/${id}/raw/${head}/`;
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      updatedAt: '',
      entries: { 'novel:tail': { hash: 'hash', lastEdited: '' } },
    };
    const requests: string[] = [];
    const fetch = (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requests.push(url);
      if (url === root + 'manifest.json')
        return Promise.resolve(new Response(JSON.stringify(manifest)));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            truncated: true,
            history: [{ version: head }],
            files: {
              'anchor.txt': {
                raw_url: `https://gist.githubusercontent.com/owner/${id}/raw/${'0'.repeat(40)}/anchor.txt`,
              },
            },
          }),
          { headers: { etag: 'current' } },
        ),
      );
    };
    spyOn(globalThis, 'fetch').mockImplementation(fetch as typeof globalThis.fetch);
    const result = await conditionalGetGist('test-token', id);
    if (result.notModified) throw new Error('不应跳过');
    expect(result.files['book-tail.json']!.raw_url).toBe(root + 'book-tail.json');
    expect(result.files['manifest.json']!.content).toBe(JSON.stringify(manifest));
    expect(requests).toEqual([`https://api.github.com/gists/${id}`, root + 'manifest.json']);
  });
  it('20 本书、2200 章、440 万词可同步，并完整下载 API 未列出的正文', async () => {
    const payload = library(20, 110, 2000);
    const remote = gist(payload);
    remote.interruptBeforeManifest();
    await check(remote.upload(payload)).rejects.toThrow('模拟迁移中断');
    const resume = await conditionalGetGist(remote.config.secret, remote.config.syncParams.gistId!);
    if (resume.notModified) throw new Error('不应跳过');
    const legacy = await new GistSyncService().downloadFromGist(remote.config);
    check(legacy.success, legacy.error).toBe(true);
    expect(legacy.data!.novels).toHaveLength(20);
    remote.config.lastRemoteETag = resume.etag;
    await remote.upload(payload, resume.files);
    const firstRevision = remote.revision();
    expect(remote.apiData(firstRevision).truncated).toBe(true);
    expect(remote.apiData(firstRevision).files['manifest.json']).toBeUndefined();
    const downloaded = await downloadWithManifest({
      ...remote.config,
      lastRemoteETag: '',
      knownRemoteHashes: {},
    });
    if (downloaded.skipped) throw new Error('不应跳过');
    expect(downloaded.failedEntryKeys).toEqual([]);
    const novels = Object.values(downloaded.changedEntries).flatMap((entry) =>
      entry.kind === 'novel' ? [entry.value] : [],
    );
    expect(novels).toHaveLength(20);
    let wordCount = 0;
    for (const expected of payload.novels) {
      const actual = novels.find((book) => book.id === expected.id)!;
      const chapters = actual.volumes![0]!.chapters!;
      expect(chapters).toHaveLength(110);
      chapters.forEach((chapter, i) => {
        expect(chapter.content![0]!.text).toBe(
          expected.volumes![0]!.chapters![i]!.content![0]!.text,
        );
        wordCount += chapter.content![0]!.text.split(' ').length;
      });
    }
    expect(wordCount).toBe(4400000);
    const rawCount = remote.rawRequests.length;
    const unchanged = await downloadWithManifest({
      ...remote.config,
      lastRemoteETag: downloaded.remoteETag,
    });
    expect(unchanged.skipped).toBe(true);
    expect(remote.rawRequests).toHaveLength(rawCount);
    const chapter = {
      ...payload.novels[19]!.volumes![0]!.chapters![0]!,
      id: 'appended-chapter',
      title: '新增一章',
    };
    payload.novels[19]!.volumes![0]!.chapters!.push(chapter);
    remote.patches.length = 0;
    await remote.upload(payload);
    expect(Object.keys(Object.assign({}, ...remote.patches))).toHaveLength(3);
    payload.novels.pop();
    remote.patches.length = 0;
    await remote.upload(payload, downloaded.remoteFilesSnapshot);
    expect(
      Object.values(Object.assign({}, ...remote.patches)).filter((value) => value === null),
    ).toHaveLength(17);
    const afterDeletion = await downloadWithManifest({
      ...remote.config,
      lastRemoteETag: '',
      knownRemoteHashes: {},
    });
    if (afterDeletion.skipped) throw new Error('不应跳过');
    expect(afterDeletion.failedEntryKeys).toEqual([]);
    expect(
      Object.values(afterDeletion.changedEntries).filter((entry) => entry.kind === 'novel'),
    ).toHaveLength(19);
    const restored = await new GistSyncService().downloadFromGistRevision(
      remote.config,
      firstRevision,
    );
    expect(restored.success).toBe(true);
    expect(restored.data!.novels).toHaveLength(20);
    expect(
      restored.data!.novels.find((book) => book.id === 'book-0019')!.volumes![0]!.chapters,
    ).toHaveLength(110);
  }, 60000);

  it('300 本小书同样可以完整同步；未列出的正文实际缺失时必须失败', async () => {
    const payload = library(300, 1, 8);
    const remote = gist();
    const uploaded = await remote.upload(payload);
    const result = await downloadWithManifest({
      ...remote.config,
      lastRemoteETag: '',
      knownRemoteHashes: {},
    });
    if (result.skipped) throw new Error('不应跳过');
    expect(result.failedEntryKeys).toEqual([]);
    expect(
      Object.values(result.changedEntries).filter((entry) => entry.kind === 'novel'),
    ).toHaveLength(300);
    const key = Object.keys(uploaded.manifest.entries).find((key) =>
      key.startsWith('chapters:book-0299:'),
    )!;
    remote.removeFile(filenamesForEntry(key)[0]!);
    const writes = remote.patches.length;
    const damaged = await downloadWithManifest({
      ...remote.config,
      lastRemoteETag: '',
      knownRemoteHashes: {},
    });
    if (damaged.skipped) throw new Error('不应跳过');
    expect(damaged.failedEntryKeys).toContain(key);
    expect(remote.patches).toHaveLength(writes);
  }, 30000);

  for (const failure of [
    'missing-manifest',
    'corrupt-manifest',
    'wrong-origin',
    'missing-revision',
  ] as const) {
    it(`截断快照 ${failure} 时不能降级成不完整书库`, async () => {
      const id = 'a'.repeat(32);
      const sha = '1'.repeat(40);
      const fetch = (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/raw/'))
          return Promise.resolve(
            new Response(failure === 'corrupt-manifest' ? '{broken' : 'missing', {
              status: failure === 'missing-manifest' ? 404 : 200,
            }),
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              truncated: true,
              history: failure === 'missing-revision' ? [] : [{ version: sha }],
              files: {
                'anchor.txt': {
                  raw_url: `https://${failure === 'wrong-origin' ? 'invalid.example' : 'gist.githubusercontent.com'}/owner/${id}/raw/${sha}/anchor.txt`,
                },
              },
            }),
          ),
        );
      };
      spyOn(globalThis, 'fetch').mockImplementation(fetch as typeof globalThis.fetch);
      let error: unknown;
      try {
        await conditionalGetGist('test-token', id);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
    });
  }
});
