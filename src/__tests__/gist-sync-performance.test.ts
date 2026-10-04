import './setup';
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { Novel } from '../models/novel';
import type { AppSettings } from '../models/settings';
import { MANIFEST_FILE_NAME, novelEntryKey } from '../models/manifest';
import { SyncType, type SyncConfig } from '../models/sync';
import {
  downloadWithManifest,
  type GistFileLike,
  type UploadPayload,
} from '../services/gist-sync-incremental';
import { buildLocalManifest } from '../services/sync-manifest-builder';
import { canonicalStringify } from '../utils/canonical-json';
import { normalizeBookLanguages } from '../services/localization/normalize';
import { stripNovelLocalFields } from '../utils/sync-strip';

afterEach(() => mock.restore());

describe('Gist 下载性能', () => {
  for (const [bookCount, chunksPerBook, withFailures] of [
    [2, 1, false],
    [12, 1, false],
    [1, 12, false],
    [6, 3, false],
    [6, 3, true],
  ] as const) {
    it(`${bookCount} 本书 × ${chunksPerBook} 个文件应有界并发下载并按序重组（失败=${withFailures}）`, async () => {
      const novels: Novel[] = Array.from({ length: bookCount }, (_, i) => ({
        id: `book-${i}`,
        title: `书籍 ${i}`,
        createdAt: new Date(0),
        lastEdited: new Date(0),
        volumes: [],
      }));
      const payload: UploadPayload = {
        appSettings: { lastEdited: new Date(0) } as AppSettings,
        aiModels: [],
        coverHistory: [],
        novels,
        memoriesByBook: {},
      };
      const manifest = await buildLocalManifest(payload);
      // 本场景只测小说文件；聚合条目已同步。
      for (const key of ['settings', 'ai-models', 'cover-history']) delete manifest.entries[key];
      const files: Record<string, GistFileLike> = {};
      const rawFiles = new Map<string, string>();
      for (const novel of novels) {
        const json = canonicalStringify(stripNovelLocalFields(normalizeBookLanguages(novel)));
        const chunkSize = Math.ceil(json.length / chunksPerBook);
        if (chunksPerBook > 1) manifest.entries[novelEntryKey(novel.id)]!.chunks = chunksPerBook;
        for (let i = 0; i < chunksPerBook; i++) {
          const filename =
            chunksPerBook === 1 ? `book-${novel.id}.json` : `book-chunk-${novel.id}_${i}.json`;
          const url = `https://raw.test/${filename}`;
          files[filename] = { truncated: true, raw_url: url };
          rawFiles.set(url, json.slice(i * chunkSize, (i + 1) * chunkSize));
        }
      }
      files[MANIFEST_FILE_NAME] = { content: JSON.stringify(manifest) };
      let active = 0;
      let peak = 0;
      let rawRequests = 0;
      const fetchMock = async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!rawFiles.has(url)) {
          return new Response(JSON.stringify({ files }), { headers: { etag: 'remote-etag' } });
        }
        rawRequests++;
        active++;
        peak = Math.max(peak, active);
        // 不同延迟让文件乱序完成，检验重组顺序与全局并发上限。
        await new Promise((resolve) => setTimeout(resolve, rawRequests % 2 ? 20 : 30));
        active--;
        if (withFailures && /book-(1|3)_1\.json$/.test(url)) {
          return new Response('读取失败', { status: 503 });
        }
        return new Response(rawFiles.get(url));
      };
      spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
      const config: SyncConfig = {
        enabled: true,
        syncType: SyncType.Gist,
        syncParams: { gistId: 'test-gist', username: 'test' },
        secret: 'test-token',
        apiEndpoint: '',
        syncInterval: 300000,
        lastSyncTime: 0,
      };
      const progress: number[] = [];
      const start = performance.now();
      const result = await downloadWithManifest(config, ({ current }) => progress.push(current));
      console.info(
        `[sync-perf] ${bookCount} books × ${chunksPerBook} files: ${(performance.now() - start).toFixed(0)} ms, peak=${peak}`,
      );
      if (result.skipped) throw new Error('不应跳过下载');
      const failedBooks = new Set<string>(withFailures ? ['book-1', 'book-3'] : []);
      expect(result.failedEntryKeys).toEqual([...failedBooks].map(novelEntryKey));
      expect(Object.keys(result.changedEntries)).toEqual(
        novels
          .filter((novel) => !failedBooks.has(novel.id))
          .map((novel) => novelEntryKey(novel.id)),
      );
      expect(active).toBe(0);
      expect(rawRequests).toBe(bookCount * chunksPerBook);
      expect(progress.every((value, i) => i === 0 || value >= progress[i - 1]!)).toBe(true);
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(4);
    });
  }
});
