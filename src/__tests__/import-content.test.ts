import { describe, it } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { Blob } from 'node:buffer';
import { ImportRepository } from '../services/import/import-repository';
import { ImportContentService } from '../services/import/import-content-service';
import type { ImportSource } from '../models/import';

async function prepare(text: string) {
  const task = await ImportRepository.createTask();
  const source: ImportSource = {
    id: 'source',
    taskId: task.id,
    kind: 'file',
    origin: 'user',
    purpose: 'content-root',
    name: '同名.txt',
    status: 'registered',
    createdAt: 1,
  };
  await ImportRepository.registerSources(task.id, [source], []);
  const snapshot = await ImportContentService.prepareSnapshot(source, new Blob([text]), {
    text,
    encoding: 'utf-8',
  });
  await ImportRepository.saveStep(task.id, { resources: [snapshot] });
  return { task, source, snapshot };
}

describe('导入快照与原文引用', () => {
  it('刷新创建新快照，相同文件名不等于相同内容', async () => {
    const { task, source, snapshot } = await prepare('第一版');
    const same = await ImportContentService.prepareSnapshot(source, new Blob(['第一版']), {
      text: '第一版',
    });
    const changed = await ImportContentService.prepareSnapshot(source, new Blob(['第二版']), {
      text: '第二版',
    });
    expect(same.id).not.toBe(snapshot.id);
    expect(same.digest).toBe(snapshot.digest);
    expect(changed.digest).not.toBe(snapshot.digest);
    await ImportRepository.saveStep(task.id, {
      resources: [same, changed],
      sources: [{ ...source, currentSnapshotId: changed.id, status: 'inspected' }],
    });
    expect((await ImportRepository.getResource(task.id, snapshot.id))?.kind === 'snapshot').toBe(
      true,
    );
    expect((await ImportContentService.read(task.id, snapshot.id, { limit: 100 })).text).toBe(
      '第一版',
    );
  });

  it('重复文本有不同块标识，块内切片精确，长预览不能代替全文', async () => {
    const { task, snapshot } = await prepare('重复\n重复');
    const extraction = ImportContentService.prepareExtraction(snapshot, {
      rules: {},
      blocks: [
        { text: '重复', start: 0, end: 2, kind: 'body' },
        { text: '重复', start: 3, end: 5, kind: 'body' },
      ],
      excluded: [],
      metadata: {},
      warnings: [],
    });
    expect(extraction.blocks[0]?.id).not.toBe(extraction.blocks[1]?.id);
    await ImportRepository.saveStep(task.id, { resources: [extraction] });
    const first = await ImportContentService.read(task.id, extraction.id, { limit: 2 });
    expect(first.text).toBe('重复');
    expect(first.total).toBe(5);
    expect(first.nextOffset).toBe(2);
    const rest = await ImportContentService.read(task.id, extraction.id, {
      offset: first.nextOffset!,
      limit: 100,
    });
    expect(first.text + rest.text).toBe('重复\n重复');
    expect(
      await ImportContentService.resolve(task.id, {
        kind: 'extraction',
        resourceId: extraction.id,
        blockId: extraction.blocks[1]!.id,
        start: 1,
        end: 2,
      }),
    ).toBe('复');
    await expect(
      ImportContentService.resolve(task.id, {
        kind: 'extraction',
        resourceId: extraction.id,
        blockId: extraction.blocks[0]!.id,
        end: 20,
      }),
    ).rejects.toThrow('INVALID_RANGE');
  });

  it('重提取保留原结果、排除记录和草稿引用；拒绝空结果及跨任务引用', async () => {
    const { task, snapshot } = await prepare('导航\n正文');
    const options = {
      rules: { excludeRanges: [{ start: 0, end: 3, reason: '导航' }] },
      blocks: [{ text: '正文', start: 3, end: 5, kind: 'body' as const }],
      excluded: [{ start: 0, end: 3, text: '导航\n', reason: '导航' }],
      metadata: {},
      warnings: [],
    };
    const original = ImportContentService.prepareExtraction(snapshot, options);
    const retry = ImportContentService.prepareExtraction(snapshot, options);
    expect(retry.id).not.toBe(original.id);
    await ImportRepository.saveStep(task.id, { resources: [original, retry] });
    expect((await ImportRepository.getTask(task.id))?.draft.revision).toBe(0);
    expect(await ImportRepository.getResource(task.id, original.id)).toEqual(original);
    expect(() =>
      ImportContentService.prepareExtraction(snapshot, { ...options, blocks: [] }),
    ).toThrow('EMPTY_CONTENT');
    const other = await ImportRepository.createTask();
    await expect(
      ImportContentService.resolve(other.id, {
        kind: 'extraction',
        resourceId: original.id,
        blockId: original.blocks[0]!.id,
      }),
    ).rejects.toThrow('SOURCE_SCOPE');
  });

  it('元信息来源的文本可检查，但不能作为小说正文引用', async () => {
    const { task, source, snapshot } = await prepare('搜索结果包含正文');
    const db = await import('../utils/indexed-db').then((m) => m.getDB());
    await db.put('import-sources', { ...source, purpose: 'metadata-only' });
    const extraction = ImportContentService.prepareExtraction(snapshot, {
      rules: {},
      blocks: [{ start: 0, end: 8, text: '搜索结果包含正文', kind: 'body' }],
      excluded: [],
      metadata: {},
      warnings: [],
    });
    await ImportRepository.saveStep(task.id, { resources: [extraction] });
    await expect(
      ImportContentService.resolve(task.id, {
        kind: 'extraction',
        resourceId: extraction.id,
        blockId: extraction.blocks[0]!.id,
      }),
    ).rejects.toThrow('METADATA_ONLY');
  });
});
