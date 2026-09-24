import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import type { Router } from 'vue-router';
import { FEATURES } from 'src/constants/features';
import { ImportRepository } from 'src/services/import/import-repository';
import { ImportSourceService } from 'src/services/import/import-source-service';
import { ImportAgentService } from 'src/services/import/import-agent-service';
import { handoffToImporter, repairWithImporter } from 'src/composables/book-sync/book-sync-handoff';

afterEach(() => {
  FEATURES.importWorkspace = true;
  vi.restoreAllMocks();
});

function router() {
  return { push: vi.fn(() => Promise.resolve()) } as unknown as Router & {
    push: ReturnType<typeof vi.fn>;
  };
}

describe('交给 AI 导入器', () => {
  it('创建任务、登记网址并跳转，不启动 Agent', async () => {
    const createTask = vi.spyOn(ImportRepository, 'createTask');
    const registerUrl = vi.spyOn(ImportSourceService, 'registerUrl');
    const run = vi.spyOn(ImportAgentService, 'run');
    const nav = router();

    const taskId = await handoffToImporter('https://example.com/novel/1', nav);

    expect(createTask).toHaveBeenCalledWith('导入：example.com');
    expect(registerUrl).toHaveBeenCalledWith(taskId, 'https://example.com/novel/1');
    expect(nav.push).toHaveBeenCalledWith(`/import/${taskId}`);
    expect(run).not.toHaveBeenCalled();
    const { items } = await ImportRepository.listSources(taskId);
    expect(items.map((source) => source.url)).toEqual(['https://example.com/novel/1']);
  });

  it('AI 导入关闭时拒绝交接，不创建任务', async () => {
    FEATURES.importWorkspace = false;
    const createTask = vi.spyOn(ImportRepository, 'createTask');
    const nav = router();

    await expect(handoffToImporter('https://example.com/novel/1', nav)).rejects.toThrow(
      'IMPORT_DISABLED',
    );
    expect(createTask).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe('用 AI 导入器修复配方', () => {
  const book = { id: 'b1', title: '作品', webUrl: ['https://example.com/book'] };

  it('打开修复任务并跳转，不启动 Agent', async () => {
    const run = vi.spyOn(ImportAgentService, 'run');
    const nav = router();
    const taskId = await repairWithImporter(book, '目录无法复现', nav);
    expect(nav.push).toHaveBeenCalledWith(`/import/${taskId}`);
    expect((await ImportRepository.getTask(taskId))?.purpose).toEqual({
      kind: 'recipe-repair',
      bookId: 'b1',
      reason: '目录无法复现',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('AI 导入关闭时拒绝，不创建任务', async () => {
    FEATURES.importWorkspace = false;
    const createTask = vi.spyOn(ImportRepository, 'createTask');
    await expect(repairWithImporter(book, '失效', router())).rejects.toThrow('IMPORT_DISABLED');
    expect(createTask).not.toHaveBeenCalled();
  });
});
