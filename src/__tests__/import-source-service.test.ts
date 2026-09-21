import { afterEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';

afterEach(() => mock.restore());

describe('来源授权与登记', () => {
  it('目录检查准备和追加来源可与工具回执一起提交，失败不留下半步登记', async () => {
    const task = await ImportRepository.createTask();
    const directory = await ImportSourceService.registerDirectory(task.id, [
      { file: new File(['正文'], '1.txt'), path: '书/1.txt' },
    ]);
    const prepared = await ImportSourceService.prepareDirectoryInspection(task.id, directory.id);
    expect(
      await ImportRepository.getResource(task.id, prepared.discoveries[0]!.id),
    ).toBeUndefined();
    await ImportRepository.saveStep(task.id, { resources: prepared.resources });
    const discoveryId = prepared.discoveries[0]!.id;
    await expect(
      ImportSourceService.addDiscoveredBatch(task.id, [discoveryId], {
        finish: () => ({ events: [{ kind: 'progress', data: () => '不可保存' }] }),
      }),
    ).rejects.toThrow();
    expect((await ImportRepository.listSources(task.id)).items).toHaveLength(1);
    const result = await ImportSourceService.addDiscoveredBatch(
      task.id,
      [discoveryId, discoveryId],
      {
        finish: (sources) => ({
          events: [
            { kind: 'tool-call', callId: 'add', toolName: 'add_sources', data: '{}' },
            {
              kind: 'tool-result',
              callId: 'add',
              toolName: 'add_sources',
              data: { ids: sources.map((source) => source.id) },
            },
          ],
          checkpoint: { messages: [], remainingCalls: [], completedCallIds: ['add'] },
        }),
      },
    );
    expect(result[0]?.id).toBe(result[1]?.id);
    expect((await ImportRepository.listSources(task.id)).items).toHaveLength(2);
    expect((await ImportRepository.getTask(task.id))?.checkpoint?.completedCallIds).toEqual([
      'add',
    ]);
  });

  it('添加 URL 和文件只登记，不请求、不解码、不生成章节', async () => {
    const task = await ImportRepository.createTask();
    const network = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('不应请求'));
    const file = new File(['小说正文'], 'novel.unusual', { type: 'text/plain' });
    const read = spyOn(file, 'arrayBuffer');
    const url = await ImportSourceService.registerUrl(
      task.id,
      'https://example.com/book?p=2#chapter',
    );
    const files = await ImportSourceService.registerFiles(task.id, [file]);
    expect(url.url).toBe('https://example.com/book?p=2');
    expect(url.anchor).toBe('#chapter');
    expect(files[0]?.name).toBe('novel.unusual');
    expect(read).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect((await ImportRepository.getTask(task.id))?.draft.chapters).toEqual([]);
  });

  it('文件夹保存用户选择清单，显式枚举后才可追加其中的文件', async () => {
    const task = await ImportRepository.createTask();
    const directory = await ImportSourceService.registerDirectory(task.id, [
      { file: new File(['a'], '1.txt'), path: '书/卷一/1.txt' },
      { file: new File(['b'], '2.txt'), path: '书/卷二/2.txt' },
    ]);
    expect((await ImportRepository.listSources(task.id)).items).toHaveLength(1);
    const discoveries = await ImportSourceService.inspectDirectory(task.id, directory.id);
    expect(discoveries.map((d) => d.locator)).toEqual(['书/卷一/1.txt', '书/卷二/2.txt']);
    const child = await ImportSourceService.addDiscovered(task.id, discoveries[0]!.id);
    expect(child.parentSourceId).toBe(directory.id);
    expect(child.purpose).toBe('content-derived');
    expect(child.status).toBe('registered');
    await expect(ImportSourceService.addDiscovered(task.id, '/etc/passwd')).rejects.toThrow(
      'SOURCE_SCOPE',
    );
    await expect(
      ImportSourceService.registerDirectory(task.id, [
        { file: new File(['x'], 'x'), path: '../outside.txt' },
      ]),
    ).rejects.toThrow('INVALID_PATH');
  });

  it('相对 URL、分页环和重复登记去重，保留查询参数与章节锚点', async () => {
    const task = await ImportRepository.createTask();
    const root = await ImportSourceService.registerUrl(task.id, 'https://example.com/book/index');
    const observed = await ImportSourceService.recordDiscoveries(task.id, root.id, [
      { name: '第 2 页', kind: 'url', locator: '?page=2#c1', relation: 'next' },
    ]);
    const first = await ImportSourceService.addDiscovered(task.id, observed[0]!.id);
    const again = await ImportSourceService.addDiscovered(task.id, observed[0]!.id);
    expect(first.id).toBe(again.id);
    expect(first.url).toBe('https://example.com/book/index?page=2');
    expect(first.anchor).toBe('#c1');
    expect((await ImportSourceService.registerUrl(task.id, root.url!)).id).toBe(root.id);
    await expect(ImportSourceService.registerUrl(task.id, 'javascript:alert(1)')).rejects.toThrow(
      'INVALID_URL',
    );
    await expect(ImportSourceService.registerUrl(task.id, 'file:///tmp/book.txt')).rejects.toThrow(
      'INVALID_URL',
    );
  });

  it('元信息来源及派生页面不能自行升级，用户补充同 URL 可以授予正文', async () => {
    const task = await ImportRepository.createTask();
    const metadata = await ImportSourceService.registerMetadataUrl(
      task.id,
      'https://example.com/search',
      '搜索结果',
    );
    const links = await ImportSourceService.recordDiscoveries(task.id, metadata.id, [
      { name: '正文链接', kind: 'url', locator: '/chapter', relation: 'chapter' },
    ]);
    const derived = await ImportSourceService.addDiscovered(task.id, links[0]!.id);
    expect(derived.purpose).toBe('metadata-only');
    const granted = await ImportSourceService.registerUrl(task.id, derived.url!);
    expect(granted.id).not.toBe(derived.id);
    expect(granted.purpose).toBe('content-root');
    const other = await ImportRepository.createTask();
    await expect(ImportSourceService.addDiscovered(other.id, links[0]!.id)).rejects.toThrow(
      'SOURCE_SCOPE',
    );
  });

  it('同名文件不合并，失败来源补充文件保留原失败记录', async () => {
    const task = await ImportRepository.createTask();
    const failed = await ImportSourceService.registerUrl(task.id, 'https://example.com/failed');
    await ImportRepository.saveStep(task.id, {
      sources: [
        { ...failed, status: 'failed', error: { code: 'LOGIN_REQUIRED', message: '需要登录' } },
      ],
    });
    const added = await ImportSourceService.registerFiles(
      task.id,
      [new File(['a'], 'chapter.txt'), new File(['b'], 'chapter.txt')],
      failed.id,
    );
    expect(added[0]?.id).not.toBe(added[1]?.id);
    expect(added[0]?.replacesSourceId).toBe(failed.id);
    expect((await ImportRepository.getSource(task.id, failed.id)).status).toBe('failed');
    expect((await ImportRepository.getTask(task.id))?.draft.chapters).toEqual([]);
  });
});
