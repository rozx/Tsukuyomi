import { beforeEach, afterEach, describe, it, mock, spyOn } from 'bun:test';
import { expect, vi } from 'vitest';
import './setup';
import { Blob, File } from 'node:buffer';
import { zipSync, strToU8 } from 'fflate';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportContentService } from '../services/import/import-content-service';
import * as transport from '../services/scraper/core/page-transport';
import { getDB } from '../utils/indexed-db';
import { NovelScraperFactory } from '../services/scraper/novel-scraper-factory';

const service = new ImportExtractionService(new ImportParsingClient(() => undefined));
beforeEach(() => vi.stubGlobal('Blob', Blob));
afterEach(() => {
  mock.restore();
  vi.unstubAllGlobals();
});

describe('来源快照与显式提取步骤', () => {
  it('已支持网站的嵌入式目录通过单页规则返回，不把页面空壳当作缺章', async () => {
    const task = await ImportRepository.createTask();
    const url = 'https://kakuyomu.jp/works/12345';
    const source = await ImportSourceService.registerUrl(task.id, url);
    const state = {
      props: {
        pageProps: {
          __APOLLO_STATE__: {
            'Work:12345': { title: '嵌入式目录小说', tableOfContents: [{ __ref: 'toc' }] },
            toc: { episodeUnions: [{ __ref: 'episode' }] },
            episode: { id: '456', title: '第一章' },
          },
        },
      },
      query: { workId: '12345' },
    };
    const html = `<div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script>`;
    const adapter = NovelScraperFactory.getScraper(url)!;
    const request = spyOn(adapter, 'fetchPageSnapshot').mockResolvedValue({
      html,
      requestUrl: url,
      transportUrl: url,
      status: 200,
      contentType: 'text/html',
    });
    const result = await service.prepareInspection(task.id, source.id);
    expect(result.result.success).toBe(true);
    expect(result.result.kind).toBe('catalog');
    expect(result.result.metadata?.title).toBe('嵌入式目录小说');
    expect(
      result.result.discoveries?.some(
        (entry) => entry.locator === 'https://kakuyomu.jp/works/12345/episodes/456',
      ),
    ).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('登记不解析；显式检查保存完整快照，再提取原文引用且重新提取不覆盖旧结果', async () => {
    const task = await ImportRepository.createTask();
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File(['正文一\n正文二'], 'book.any'),
    ]);
    const inspect = await service.prepareInspection(task.id, source!.id);
    expect(inspect.result.success).toBe(true);
    expect((await ImportRepository.getSource(task.id, source!.id)).status).toBe('registered');
    await ImportRepository.saveStep(task.id, inspect);
    const first = await service.prepareExtraction(task.id, [
      { sourceId: source!.id, snapshotId: inspect.result.snapshotId! },
    ]);
    await ImportRepository.saveStep(task.id, first);
    const contentId = first.results[0]!.contentId!;
    await ImportRepository.saveStep(task.id, await service.prepareInspection(task.id, source!.id));
    expect((await ImportRepository.getSource(task.id, source!.id)).status).toBe('extracted');
    expect((await ImportContentService.read(task.id, contentId)).text).toBe('正文一\n正文二');
    const second = await service.prepareExtraction(task.id, [
      {
        sourceId: source!.id,
        snapshotId: inspect.result.snapshotId!,
        rules: { ranges: [{ start: 0, end: 3 }] },
      },
    ]);
    await ImportRepository.saveStep(task.id, second);
    expect(second.results[0]?.contentId).not.toBe(contentId);
    expect(await ImportRepository.getResource(task.id, contentId)).toBeDefined();
    expect((await ImportRepository.getTask(task.id))?.draft.chapters).toEqual([]);
    expect(await (await getDB()).count('books')).toBe(0);
  });

  it('URL 只读取指定资源，发现链接返回引用而不自动登记和跟页', async () => {
    const task = await ImportRepository.createTask();
    const source = await ImportSourceService.registerUrl(task.id, 'https://example.com/book');
    const fetch = spyOn(transport, 'fetchScraperPage').mockResolvedValue({
      html: '<main><nav class="toc"><a href="/ch1">第一章</a></nav></main>',
      requestUrl: source.url!,
      transportUrl: source.url!,
      status: 200,
      contentType: 'text/html',
    });
    const prepared = await service.prepareInspection(task.id, source.id);
    await ImportRepository.saveStep(task.id, prepared);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(prepared.result.discoveries?.[0]?.name).toBe('第一章');
    expect((await ImportRepository.listSources(task.id)).items).toHaveLength(1);
    const added = await ImportSourceService.addDiscovered(
      task.id,
      prepared.result.discoveries![0]!.id,
    );
    expect(added.url).toBe('https://example.com/ch1');
    expect(fetch).toHaveBeenCalledTimes(1);
    const cached = await service.prepareInspection(task.id, source.id);
    expect(cached.result.discoveries?.[0]?.id).toBe(prepared.result.discoveries?.[0]?.id);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('验证页面失败可追溯，补文件不丢失原失败，批次一项失败不丢其他正文', async () => {
    const task = await ImportRepository.createTask();
    const [login, good] = await ImportSourceService.registerFiles(task.id, [
      new File(['<title>年齢確認</title><a id="yes18">Enter</a>'], 'login.html'),
      new File(['完整正文'], 'chapter.txt'),
    ]);
    const failed = await service.prepareInspection(task.id, login!.id);
    await ImportRepository.saveStep(task.id, failed);
    expect(failed.result.success).toBe(false);
    expect((await ImportRepository.getSource(task.id, login!.id)).error?.code).toBe(
      'SOURCE_UNAVAILABLE',
    );
    const success = await service.prepareInspection(task.id, good!.id);
    await ImportRepository.saveStep(task.id, success);
    const batch = await service.prepareExtraction(task.id, [
      { sourceId: login!.id },
      { sourceId: good!.id },
    ]);
    await ImportRepository.saveStep(task.id, batch);
    expect(batch.results.map((result) => result.success)).toEqual([false, true]);
    const [replacement] = await ImportSourceService.registerFiles(
      task.id,
      [new File(['补充正文'], 'replacement.txt')],
      login!.id,
    );
    expect(replacement?.replacesSourceId).toBe(login!.id);
    expect((await ImportRepository.getSource(task.id, login!.id)).status).toBe('failed');
    expect(await ImportRepository.getResource(task.id, batch.results[1]!.contentId!)).toBeDefined();
  });

  it('EPUB 检查生成资源引用，Agent 选择章节后才能提取，不自动创建章节', async () => {
    const bytes = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8('<container><rootfile full-path="book.opf"/></container>'),
      'book.opf': strToU8(
        '<package><metadata><title>小说</title></metadata><manifest><item id="a" href="ch.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>',
      ),
      'ch.xhtml': strToU8('<p>EPUB 正文</p>'),
    });
    const task = await ImportRepository.createTask();
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File([bytes], 'book.epub'),
    ]);
    const inspection = await service.prepareInspection(task.id, source!.id);
    await ImportRepository.saveStep(task.id, inspection);
    const chapter = inspection.result.discoveries?.find((entry) => entry.relation === 'chapter');
    expect(chapter).toBeDefined();
    const selected = await ImportSourceService.addDiscovered(task.id, chapter!.id);
    const extracted = await service.prepareExtraction(task.id, [{ sourceId: selected.id }]);
    await ImportRepository.saveStep(task.id, extracted);
    expect(extracted.results[0]?.success).toBe(true);
    expect((await ImportContentService.read(task.id, extracted.results[0]!.contentId!)).text).toBe(
      'EPUB 正文',
    );
    expect((await ImportRepository.getTask(task.id))?.draft.chapters).toEqual([]);
  });

  it('元信息来源可读取，但提取结果不能伪装为正文；跨任务快照被拒绝', async () => {
    const task = await ImportRepository.createTask();
    const source = await ImportSourceService.registerMetadataUrl(
      task.id,
      'https://example.com/book',
      '信息页',
    );
    spyOn(transport, 'fetchScraperPage').mockResolvedValue({
      html: '<article><p>网页正文</p></article>',
      requestUrl: source.url!,
      transportUrl: source.url!,
      status: 200,
      contentType: 'text/html',
    });
    const info = await service.prepareInspection(task.id, source.id);
    await ImportRepository.saveStep(task.id, info);
    const parsed = await service.prepareExtraction(task.id, [{ sourceId: source.id }]);
    expect(parsed.results[0]?.error?.code).toBe('METADATA_ONLY');
    const other = await ImportRepository.createTask();
    const [file] = await ImportSourceService.registerFiles(other.id, [
      new File(['正文'], 'file.txt'),
    ]);
    const crossed = await service.prepareExtraction(other.id, [
      { sourceId: file!.id, snapshotId: info.result.snapshotId! },
    ]);
    expect(crossed.results[0]?.error?.code).toBe('SOURCE_SCOPE');
  });

  it('取消不会生成可保存的迟到结果', async () => {
    const task = await ImportRepository.createTask();
    const source = await ImportSourceService.registerUrl(task.id, 'https://example.com/book');
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.prepareInspection(task.id, source.id, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(await (await getDB()).count('import-resources')).toBe(0);
    expect((await ImportRepository.getSource(task.id, source.id)).status).toBe('registered');
  });

  it('缓存检查在读取发现引用期间取消，也不能返回可提交结果', async () => {
    const task = await ImportRepository.createTask();
    const source = await ImportSourceService.registerUrl(task.id, 'https://example.com/book');
    spyOn(transport, 'fetchScraperPage').mockResolvedValue({
      html: '<nav class="toc"><a href="/chapter">第一章</a></nav>',
      requestUrl: source.url!,
      transportUrl: source.url!,
      status: 200,
      contentType: 'text/html',
    });
    const first = await service.prepareInspection(task.id, source.id);
    await ImportRepository.saveStep(task.id, first);
    const controller = new AbortController();
    const original = ImportRepository.getResource.bind(ImportRepository);
    spyOn(ImportRepository, 'getResource').mockImplementation(async (taskId, id) => {
      const result = await original(taskId, id);
      if (id === first.result.discoveries?.[0]?.id) controller.abort();
      return result;
    });
    await expect(
      service.prepareInspection(task.id, source.id, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('批次中无效的来源引用不会丢弃其余可读取来源', async () => {
    const task = await ImportRepository.createTask();
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File(['有效正文'], 'chapter.txt'),
    ]);
    const batch = await service.prepareExtraction(task.id, [
      { sourceId: 'missing' },
      { sourceId: source!.id },
    ]);
    await ImportRepository.saveStep(task.id, batch);
    expect(batch.results.map((result) => result.success)).toEqual([false, true]);
  });

  it('补充旧快照的检查信息时生成新快照，不覆盖不可变资源', async () => {
    const task = await ImportRepository.createTask();
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File(['旧正文'], 'novel.txt'),
    ]);
    const raw = await ImportContentService.prepareSnapshot(source!, new Blob(['旧正文']), {
      text: '旧正文',
    });
    await ImportRepository.saveStep(task.id, {
      resources: [raw],
      sources: [{ ...source!, currentSnapshotId: raw.id }],
    });
    const inspected = await service.prepareInspection(task.id, source!.id);
    await ImportRepository.saveStep(task.id, inspected);
    expect(inspected.result.snapshotId).not.toBe(raw.id);
    expect(await ImportRepository.getResource(task.id, raw.id)).toEqual(raw);
  });

  it('明确重提取旧版本时不回退来源的最新快照', async () => {
    const task = await ImportRepository.createTask();
    const source = await ImportSourceService.registerUrl(task.id, 'https://example.com/book');
    const request = spyOn(transport, 'fetchScraperPage').mockResolvedValue({
      html: '<p>第一版</p>',
      requestUrl: source.url!,
      transportUrl: source.url!,
      status: 200,
      contentType: 'text/html',
    });
    const first = await service.prepareInspection(task.id, source.id);
    await ImportRepository.saveStep(task.id, first);
    request.mockResolvedValue({
      html: '<p>第二版</p>',
      requestUrl: source.url!,
      transportUrl: source.url!,
      status: 200,
      contentType: 'text/html',
    });
    const latest = await service.prepareInspection(task.id, source.id, { refresh: true });
    await ImportRepository.saveStep(task.id, latest);
    const historical = await service.prepareExtraction(task.id, [
      { sourceId: source.id, snapshotId: first.result.snapshotId! },
    ]);
    await ImportRepository.saveStep(task.id, historical);
    expect(historical.results[0]?.success).toBe(true);
    expect((await ImportRepository.getSource(task.id, source.id)).currentSnapshotId).toBe(
      latest.result.snapshotId,
    );
  });
});
