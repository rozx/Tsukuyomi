import { afterEach, beforeEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { Blob, File } from 'node:buffer';
import axios from 'axios';
import { ImportMetadataService } from '../services/import/import-metadata-service';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportContentService } from '../services/import/import-content-service';
import { useSettingsStore } from '../stores/settings';
import { FirecrawlClient } from '../services/firecrawl/firecrawl-client';
import { __resetDbPromiseForTesting, getDB } from '../utils/indexed-db';

beforeEach(async () => {
  await useSettingsStore().updateSettings({ tavilyApiKey: 'test-search-key' });
});
afterEach(() => mock.restore());

describe('元信息搜索、采用及封面持久值', () => {
  it('应用后采用新候选会回到草稿，用户也能取消采用某个字段', async () => {
    const task = await ImportRepository.createTask();
    const draft = await ImportMetadataService.propose(task.id, 0, {
      field: 'author',
      value: '候选作者',
    });
    const current = (await ImportRepository.getTask(task.id))!;
    await (await getDB()).put('import-tasks', { ...current, state: 'applied' });
    const adopted = await ImportMetadataService.adopt(
      task.id,
      draft.metadataCandidates![0]!.id,
      draft.revision,
    );
    expect((await ImportRepository.getTask(task.id))!.state).toBe('draft');
    const declined = await ImportMetadataService.setAdoption(
      task.id,
      'author',
      false,
      adopted.revision,
    );
    expect(declined.metadata.author?.value).toBe('候选作者');
    expect(declined.metadata.author?.adopted).toBe(false);
  });
  it('复用现有搜索配置，结果只授予元信息用途，来源与工具回执可一起保存', async () => {
    const task = await ImportRepository.createTask();
    const post = spyOn(axios, 'post').mockResolvedValue({
      data: {
        results: [
          { title: '书籍信息', content: '作者介绍及页面中的正文', url: 'https://example.com/info' },
        ],
        answer: '候选元信息',
      },
    });
    const prepared = await ImportMetadataService.prepareSearch(task.id, '书名 作者 封面');
    expect(prepared.result.success).toBe(true);
    expect((await ImportRepository.listSources(task.id)).items).toHaveLength(0);
    await ImportRepository.saveStep(task.id, prepared);
    expect((await ImportRepository.listSources(task.id)).items[0]?.purpose).toBe('metadata-only');
    expect(JSON.stringify(prepared)).not.toContain('test-search-key');
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      api_key: 'test-search-key',
      include_raw_content: false,
    });
    const repeated = await ImportMetadataService.prepareSearch(task.id, '再次检查作者');
    expect(repeated.newSources).toHaveLength(0);
    expect(repeated.result.results?.[0]?.sourceId).toBe(prepared.result.results?.[0]?.sourceId);
  });

  it('搜索不可用保留草稿，Agent 候选不覆盖手动字段，用户按版本决定采用', async () => {
    const task = await ImportRepository.createTask();
    await ImportDraftService.edit(
      task.id,
      {
        baseDraftRevision: 0,
        operations: [{ op: 'set_metadata', field: 'title', value: '手动标题' }],
      },
      { actor: 'user' },
    );
    await useSettingsStore().updateSettings({ tavilyApiKey: '', firecrawlFallbackEnabled: false });
    const unavailable = await ImportMetadataService.prepareSearch(task.id, '补充作者');
    expect(unavailable.result.success).toBe(false);
    expect(unavailable.newSources).toEqual([]);
    const proposed = await ImportMetadataService.propose(task.id, 1, {
      field: 'title',
      value: '候选标题',
    });
    expect(proposed.metadata.title?.value).toBe('手动标题');
    const candidate = proposed.metadataCandidates![0]!;
    await expect(ImportMetadataService.adopt(task.id, candidate.id, 1)).rejects.toThrow(
      'DRAFT_CHANGED',
    );
    const adopted = await ImportMetadataService.adopt(task.id, candidate.id, proposed.revision);
    expect(adopted.metadata.title?.value).toBe('候选标题');
    expect(adopted.metadata.title?.adopted).toBe(true);
  });

  it('作者或版本冲突作为候选待处理；封面必须是来源中观察到的图片地址', async () => {
    const task = await ImportRepository.createTask();
    await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        {
          op: 'declare_candidates',
          candidates: [{ id: 'book', title: '所选小说', author: '原作者', sourceIds: [] }],
        },
      ],
    });
    const source = await ImportSourceService.registerMetadataUrl(
      task.id,
      'https://example.com/info',
      '信息页',
    );
    const snapshot = await ImportContentService.prepareSnapshot(
      source,
      new Blob(['<img src="/cover.jpg">']),
      { text: '<img src="/cover.jpg">' },
    );
    snapshot.inspection = {
      format: 'html',
      kind: 'content',
      metadata: { title: '不同版本', author: '新作者', cover: 'https://example.com/cover.jpg' },
      discoveryIds: [],
      warnings: [],
      missing: [],
    };
    await ImportRepository.saveStep(task.id, {
      resources: [snapshot],
      sources: [{ ...source, currentSnapshotId: snapshot.id }],
    });
    const proposed = await ImportMetadataService.propose(task.id, 1, {
      field: 'author',
      value: '新作者',
      sourceId: source.id,
      resourceId: snapshot.id,
    });
    expect(proposed.metadataCandidates![0]?.conflicts?.length).toBeGreaterThan(0);
    expect(proposed.metadata.author).toBeUndefined();
    await expect(
      ImportMetadataService.propose(task.id, proposed.revision, {
        field: 'cover',
        value: source.url!,
        sourceId: source.id,
        resourceId: snapshot.id,
      }),
    ).rejects.toThrow('INVALID_COVER');
    const cover = await ImportMetadataService.propose(task.id, proposed.revision, {
      field: 'cover',
      value: 'https://example.com/cover.jpg',
      sourceId: source.id,
      resourceId: snapshot.id,
    });
    expect(cover.metadataCandidates?.at(-1)?.value.value).toBe('https://example.com/cover.jpg');
  });

  it('本地封面只保存资源引用，刷新后按需转换成可持久使用的 data URL', async () => {
    const task = await ImportRepository.createTask();
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9o0AAAAASUVORK5CYII=',
      ),
      (character) => character.charCodeAt(0),
    );
    const [source] = await ImportSourceService.registerFiles(task.id, [
      new File([bytes], 'cover.png', { type: 'image/png' }),
    ]);
    const proposed = await ImportMetadataService.propose(task.id, 0, {
      field: 'cover',
      value: '',
      sourceId: source!.id,
      resourceId: source!.inputResourceId!,
    });
    const candidate = proposed.metadataCandidates![0]!;
    await ImportMetadataService.adopt(task.id, candidate.id, proposed.revision);
    await __resetDbPromiseForTesting();
    const current = (await ImportRepository.getTask(task.id))!.draft.metadata.cover!;
    expect(current.value).not.toMatch(/^(blob:|data:)/);
    const durable = await ImportMetadataService.resolveCover(task.id, current);
    expect(durable).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`);
  });
});

describe('元信息搜索经 Firecrawl 回退', () => {
  it('未配置 Tavily、回退开启：经 Firecrawl 搜索，结果仍只授予元信息用途', async () => {
    await useSettingsStore().updateSettings({ tavilyApiKey: '', firecrawlFallbackEnabled: true });
    const post = spyOn(axios, 'post');
    const search = spyOn(FirecrawlClient, 'search').mockResolvedValue([
      { title: '作者 Wiki', url: 'https://ja.wikipedia.org/wiki/a', snippet: '日本の作家' },
    ]);
    const task = await ImportRepository.createTask();
    const prepared = await ImportMetadataService.prepareSearch(task.id, '無職転生 作者');
    expect(post).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith('無職転生 作者', expect.objectContaining({ limit: 5 }));
    expect(prepared.result.success).toBe(true);
    await ImportRepository.saveStep(task.id, prepared);
    expect((await ImportRepository.listSources(task.id)).items[0]?.purpose).toBe('metadata-only');
  });

  it('搜索排队或进行中被取消：拒绝为取消错误且不记录结果', async () => {
    await useSettingsStore().updateSettings({ tavilyApiKey: '', firecrawlFallbackEnabled: true });
    let received: AbortSignal | undefined;
    spyOn(FirecrawlClient, 'search').mockImplementation((_query, options) => {
      received = options?.signal;
      return new Promise(() => {});
    });
    const task = await ImportRepository.createTask();
    const controller = new AbortController();
    const pending = ImportMetadataService.prepareSearch(task.id, '作者', controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(received).toBe(controller.signal);
    expect((await ImportRepository.listSources(task.id)).items).toHaveLength(0);
  });
});
