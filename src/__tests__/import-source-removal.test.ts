import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { File } from 'node:buffer';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportPreviewService } from '../services/import/import-preview-service';
import { ImportPlanService } from '../services/import/import-plan-service';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import { ImportApplicationService } from '../services/import/import-application-service';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import { webLocksFixture } from './web-locks-fixture';
import { draft } from './import-fixtures';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('从来源列表移除入口', () => {
  it('移除不修改已导入书库，也不破坏原导入的撤销记录', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    const input = await draft('已经导入的正文');
    const plan = await ImportPlanService.preview(input.taskId, 1);
    const application = new ImportApplicationService();
    await application.apply(await application.confirmApply(input.taskId, plan.id));
    const before = await ImportLibraryReader.readBook(plan.targetBookId);
    await ImportSourceService.remove(input.taskId, input.source.id);
    expect(await ImportLibraryReader.readBook(plan.targetBookId)).toEqual(before);
    expect(
      (await application.revert(await application.confirmRevert(input.taskId, plan.id))).state,
    ).toBe('reverted');
  });

  it('旧来源状态写回不能重新激活已移除的入口', async () => {
    const task = await ImportRepository.createTask();
    const source = await ImportSourceService.registerUrl(task.id, 'https://example.com/book');
    await ImportSourceService.remove(task.id, source.id);
    await expect(
      ImportRepository.saveStep(task.id, { sources: [{ ...source, status: 'inspected' }] }),
    ).rejects.toThrow('SOURCE_SCOPE');
    expect((await ImportRepository.listSources(task.id)).items).toHaveLength(0);
  });

  it('移除后不再提取或跟随旧引用，用户仍能主动重新添加', async () => {
    const task = await ImportRepository.createTask();
    const root = await ImportSourceService.registerUrl(task.id, 'https://example.com/book');
    const links = await ImportSourceService.recordDiscoveries(task.id, root.id, [
      { kind: 'url', name: '章节', locator: '/chapter', relation: 'chapter' },
    ]);
    const child = await ImportSourceService.addDiscovered(task.id, links[0]!.id);
    await ImportSourceService.remove(task.id, child.id);
    await expect(ImportSourceService.addDiscovered(task.id, links[0]!.id)).rejects.toThrow(
      'SOURCE_REMOVED',
    );
    await expect(
      new ImportExtractionService().prepareInspection(task.id, child.id),
    ).rejects.toThrow('SOURCE_REMOVED');
    await ImportSourceService.remove(task.id, root.id);
    await expect(ImportSourceService.addDiscovered(task.id, links[0]!.id)).rejects.toThrow(
      'SOURCE_REMOVED',
    );
    const added = await ImportSourceService.registerUrl(task.id, root.url!);
    expect(added.id).not.toBe(root.id);
    expect((await ImportRepository.listSources(task.id)).items.map((source) => source.id)).toEqual([
      added.id,
    ]);
  });

  it('已移除的文件夹不能继续枚举，原始文件仍可追溯', async () => {
    const task = await ImportRepository.createTask();
    const directory = await ImportSourceService.registerDirectory(task.id, [
      { file: new File(['内容'], '1.txt'), path: '书/1.txt' },
    ]);
    await ImportSourceService.remove(task.id, directory.id);
    await expect(ImportSourceService.inspectDirectory(task.id, directory.id)).rejects.toThrow(
      'SOURCE_REMOVED',
    );
    expect(await ImportRepository.getResource(task.id, directory.inputResourceId!)).toMatchObject({
      kind: 'directory',
    });
  });

  it('移除来源及派生入口，但保留草稿、正文和再次预览能力', async () => {
    const input = await draft('保留的完整正文');
    const before = (await ImportRepository.getTask(input.taskId))!;
    const links = await ImportSourceService.recordDiscoveries(input.taskId, input.source.id, [
      { kind: 'url', name: '附属章', locator: 'https://example.com/chapter', relation: 'chapter' },
    ]);
    const child = await ImportSourceService.addDiscovered(input.taskId, links[0]!.id);
    const [other] = await ImportSourceService.registerFiles(input.taskId, [
      new File(['另一来源'], '其他.txt'),
    ]);

    expect(await ImportSourceService.remove(input.taskId, input.source.id)).toBe(2);
    const listed = await ImportRepository.listSources(input.taskId);
    expect(listed.items.map((source) => source.id)).toEqual([other!.id]);
    expect((await ImportRepository.getTask(input.taskId))?.draft).toEqual(before.draft);
    expect(
      (await ImportPreviewService.chapter(input.taskId, input.chapter.id)).paragraphs.map(
        (p) => p.text,
      ),
    ).toEqual(['保留的完整正文']);
    const plan = await ImportPlanService.preview(input.taskId, before.draft.revision);
    expect(plan.chapters[0]?.content.map((p) => p.text)).toEqual(['保留的完整正文']);
    expect(await ImportRepository.getSource(input.taskId, child.id)).toHaveProperty('removedAt');
    expect(await ImportSourceService.remove(input.taskId, input.source.id)).toBe(0);
  });

  it('运行中拒绝移除，跨任务来源不能删除', async () => {
    const a = await ImportRepository.createTask();
    const b = await ImportRepository.createTask();
    const source = await ImportSourceService.registerUrl(a.id, 'https://example.com/book');
    await expect(ImportSourceService.remove(b.id, source.id)).rejects.toThrow('SOURCE_SCOPE');
    await ImportRepository.mutateTask(a.id, (task) => {
      task.state = 'running';
      return Promise.resolve();
    });
    await expect(ImportSourceService.remove(a.id, source.id)).rejects.toThrow('TASK_BUSY');
    expect((await ImportRepository.listSources(a.id)).items).toHaveLength(1);
  });
});
