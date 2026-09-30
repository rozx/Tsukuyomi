import { ImportPlanService } from '../services/import/import-plan-service';
import { BookSyncReplay } from '../services/book-sync/replay';
import { serializeImportError } from '../services/import/import-error';
import { AssistantExecution } from '../services/ai/tasks/utils/assistant-execution';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { parseChapter } from '../services/book-sync/replay';
import { validateImportMetadata } from '../services/import/import-metadata-validation';
import { ImportLibraryService } from '../services/import/import-library-service';
import { getDB } from '../utils/indexed-db';
import { importActionInfo } from '../composables/import-page/import-action-info';
import { createImportActionContext } from '../composables/import-page/import-action-context';
import { importFailure, localizeImportFeedback } from '../services/import/import-error';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { zipSync, strToU8 } from 'fflate';
import { processImportJob } from '../services/import/import-parsing-jobs';

import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportWorkerFixture } from './import-worker-fixture';
import { ImportRepository } from '../services/import/import-repository';
import type { AppLocale } from '../models/locale';
afterEach(() => vi.restoreAllMocks());
function text(value: unknown): string {
  return typeof value === 'string' ? value : (value as { message: string }).message;
}
describe('导入自有警告与默认标题三语', () => {
  it('执行器拒绝错配工具结果时使用固定英文说明和TOOL_PAIR身份', async () => {
    const call = {
      id: 'c',
      type: 'function' as const,
      function: { name: 'test', arguments: '{}' },
    };
    const execution = new AssistantExecution({
      languages: captureExecutionLanguages('en-US'),
      context: {
        currentBookId: null,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      },
      tools: [
        {
          type: 'function',
          function: {
            name: 'test',
            description: '',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      systemPrompt: () => Promise.resolve(''),
      executeTool: () =>
        Promise.resolve({
          result: { role: 'tool' as const, tool_call_id: 'wrong', name: 'test', content: '{}' },
        }),
      saveCheckpoint: () => Promise.resolve(),
    });
    await execution.recordReply([{ role: 'assistant', content: '', tool_calls: [call] }], [call]);
    let failed: unknown;
    try {
      await execution.runTools([call], [{ role: 'assistant', content: '', tool_calls: [call] }]);
    } catch (error) {
      failed = error;
    }
    expect((failed as Error).message).toContain('TOOL_PAIR');
    expect((failed as Error).message).not.toMatch(/\p{Script=Han}/u);
  });

  it('旧缺失说明与同一自动缺失章节不重复计数或重译用户输入', async () => {
    const task = await ImportRepository.createTask();
    await ImportRepository.mutateTask(task.id, (current) => {
      current.draft.completeness.missing = ['Chapter（未取得正文）'];
      current.draft.volumes = [{ id: 'v', title: 'V', inferred: false }];
      current.draft.chapters = [
        {
          id: 'c',
          volumeId: 'v',
          title: 'Chapter',
          content: [],
          sourceIds: [],
          selected: true,
          status: 'missing',
          inferredTitle: false,
          inferredStructure: false,
        },
      ];
      return Promise.resolve();
    });
    const plan = await ImportPlanService.preview(task.id, 0);
    expect(plan.completeness.missing).toHaveLength(1);
    expect(plan.completeness.missing[0]).toBe('Chapter（未取得正文）');
  });
  it('生产回放的失败结果跨JSON仍保留自有语言身份', async () => {
    const replay = new BookSyncReplay({
      version: 1,
      engine: { kind: 'builtin', site: 'kakuyomu' },
      catalogUrls: ['https://unsupported.example/book'],
      recordedAt: 0,
      verifiedChapterCount: 0,
    });
    const result = await replay.fetchCatalog();
    expect(result.ok).toBe(false);
    const projected = localizeImportFeedback(JSON.parse(JSON.stringify(result)), 'en-US');
    expect(projected.message).toContain('built-in site');
    expect(projected.message).not.toMatch(/\p{Script=Han}/u);
  });

  it('完整性提示在操作详情显示译后的说明和原始章名', () => {
    const context = createImportActionContext([], { sourceNames: new Map(), uiLocale: 'en-US' });
    const info = importActionInfo(
      'preview_import',
      {},
      {
        completeness: {
          missing: [importFailure('MISSING_CHAPTER', 'missingNotRead', { title: '用户章名' })],
        },
      },
      context,
    );
    const values = info.details.map((item) => item.value).join('\n');
    expect(values).toContain('用户章名');
    expect(values).toContain('body unavailable');
    expect(values).not.toContain('[object Object]');
  });

  it('配方回放失败保留本应用错误身份，可投影英文', () => {
    let error: unknown;
    try {
      parseChapter(
        '<html><head><title>ログイン</title></head><body>ログイン</body></html>',
        'https://example.com/chapter',
        {
          version: 1,
          engine: { kind: 'html', content: { selector: 'body' } },
          catalogUrls: ['https://example.com'],
          recordedAt: 0,
          verifiedChapterCount: 0,
        } as never,
      );
    } catch (failure) {
      error = failure;
    }
    const record = localizeImportFeedback(serializeImportError(error), 'en-US');
    expect(record.message).toContain('verification');
    expect(record.message).not.toMatch(/\p{Script=Han}/u);
  });

  it('公共执行器的参数不完整错误使用固定执行语言', () => {
    const execution = new AssistantExecution({
      languages: captureExecutionLanguages('en-US'),
      context: {
        currentBookId: null,
        currentChapterId: null,
        hoveredParagraphId: null,
        selectedParagraphId: null,
      },
      tools: [],
      systemPrompt: () => Promise.resolve(''),
      executeTool: () => Promise.resolve({}),
      saveCheckpoint: () => Promise.resolve(),
    });
    try {
      execution.normalizeCalls([
        { id: 'c', type: 'function', function: { name: 'test', arguments: '[' } },
      ]);
    } catch (error) {
      expect((error as Error).message).toContain('JSON');
      expect((error as Error).message).not.toMatch(/\p{Script=Han}/u);
    }
  });

  it('元信息候选冲突说明可投影英文，不改变用户作者值', async () => {
    const task = await ImportRepository.createTask();
    task.draft.novelScope = {
      revision: 1,
      candidates: [{ id: 'n', title: 'Original title', author: 'Old author', sourceIds: [] }],
      selectedCandidateId: 'n',
      needsChoice: false,
    };
    const result = validateImportMetadata(task.draft, 'author', '用户作者', 'agent');
    const projected = localizeImportFeedback(result, 'en-US');
    expect(text(projected.conflicts[0])).toContain('author');
    expect(projected.value.value).toBe('用户作者');
  });
  it('书库匹配理由使用英文，书名原文不被翻译', async () => {
    const task = await ImportRepository.createTask();
    await (
      await getDB()
    ).put('books', {
      id: 'b',
      title: '用户书名',
      createdAt: new Date(),
      lastEdited: new Date(),
    } as never);
    const found = await ImportLibraryService.search(task.id, { query: '用户书名' });
    const projected = localizeImportFeedback(found, 'en-US');
    expect(projected.items[0]!.title).toBe('用户书名');
    expect(text(projected.items[0]!.reasons[0])).toContain('Title');
  });

  it('操作详情按界面语言展示结构化警告，不丢提示且用户标题保留', () => {
    const context = createImportActionContext([], {
      sourceNames: new Map(),
      uiLocale: 'en-US',
    } as never);
    const warning = importFailure('SHORT_CHAPTER', 'noticeShortChapter');
    const result = importActionInfo(
      'get_text_structure',
      { batch_id: 'b' },
      { items: [{ title: '用户章节', warnings: [warning] }] },
      context,
    );
    const details = result.details.map((d) => d.value).join('\n');
    expect(details).toContain('Chapter body is short');
    expect(details).toContain('用户章节');
    expect(details).not.toContain('[object Object]');
  });

  for (const [locale, phrase] of [
    ['en-US', 'generic'],
    ['zh-TW', '通用'],
    ['zh-CN', '通用'],
  ] as const) {
    it(`${locale}HTML排除理由和提取警告有可恢复身份，原文和自定义排除保持`, async () => {
      const html = '<body><nav>来源导航文字</nav><div>保留的原文</div></body>';
      const parsed = await processImportJob({ kind: 'content', text: html, format: 'html' });
      const projected = localizeImportFeedback(structuredClone(parsed), locale);
      expect(text(projected.warnings[0])).toContain(phrase);
      if (locale === 'en-US')
        for (const range of projected.excluded)
          expect(text(range.reason)).not.toMatch(/\p{Script=Han}/u);
      expect(projected.blocks.map((b) => b.text)).toEqual(parsed.blocks.map((b) => b.text));
      const source = await processImportJob({
        kind: 'content',
        format: 'text',
        text: '原文A原文B',
        rules: { excludeRanges: [{ start: 0, end: 3, reason: '用户指定的原因' }] },
      });
      expect(localizeImportFeedback(source, locale).excluded[0]!.reason).toBe('用户指定的原因');
    });
  }
  for (const execution of ['main', 'worker'] as const) {
    it(`${execution}英文执行产生英文默认卷章名，保留原文及UTF16偏移`, async () => {
      const parser = new ImportParsingClient(() =>
        execution === 'worker' ? (new ImportWorkerFixture() as unknown as Worker) : undefined,
      );
      const result = await parser.run(
        { kind: 'structure', format: 'text', text: '保留的原文🙂', rules: { mode: 'single' } },
        { uiLocale: 'en-US' } as never,
      );
      expect(result.value.volumes[0]!.title).toBe('Unassigned volume');
      expect(result.value.chapters[0]!.title).toBe('Body');
      expect(result.value.chapters[0]!.end).toBe('保留的原文🙂'.length);
    });
  }
  it('章节警告和排除原因经序列化后可投影英文，源标题原样保留', async () => {
    const result = await processImportJob({
      kind: 'structure',
      format: 'markdown',
      text: '前言\n# 原章名\nx\n# 原章名\n',
      rules: { mode: 'markdown', chapter_level: 1 },
    });
    const projected = localizeImportFeedback(JSON.parse(JSON.stringify(result)), 'en-US');
    const warnings = projected.chapters.flatMap((c: { warnings: unknown[] }) => c.warnings);
    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of warnings) expect(text(warning)).not.toMatch(/\p{Script=Han}/u);
    for (const range of projected.excluded)
      expect(text(range.reason)).not.toMatch(/\p{Script=Han}/u);
    expect(projected.chapters[1].title).toBe('原章名');
  });
  it('EPUB缺资源和远程资源提示本地化，URL保留', async () => {
    const bytes = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
      ),
      'book.opf': strToU8(
        '<package><manifest><item id="c" href="missing.xhtml" media-type="application/xhtml+xml"/><item id="remote" href="https://example.com/原名" media-type="text/css"/></manifest><spine><itemref idref="c"/></spine></package>',
      ),
    });
    const result = await processImportJob({ kind: 'epub', bytes });
    const projected = localizeImportFeedback(result, 'en-US');
    const warnings = projected.warnings.map(text).join('\n');
    expect(warnings).toContain('Remote resource');
    expect(warnings).toContain('https://example.com/原名');
    expect(warnings).toContain('reading resources');
  });
  it('新任务默认名按显式UI生成，已有用户名字不随语言改变', async () => {
    const repository = ImportRepository as unknown as {
      createTask(
        name?: string,
        uiLocale?: AppLocale,
      ): ReturnType<typeof ImportRepository.createTask>;
    };
    const created = await repository.createTask(undefined, 'en-US');
    expect(created.name).toBe('New import task');
    const named = await repository.createTask('用户任务名', 'en-US');
    expect(named.name).toBe('用户任务名');
  });
});

describe('导入取消反馈', () => {
  it('自有取消保留AbortError身份并能按执行语言显示', async () => {
    const signal = new AbortController();
    signal.abort();
    let failure: unknown;
    const { ImportTextStructureService } = await import('../services/import/import-text-structure');
    try {
      await new ImportTextStructureService().prepare(
        { taskId: 't', runId: 'r', runEpoch: 1, modelId: 'm' },
        { resource_id: 'missing', base_draft_revision: 0, rules: { mode: 'single' } },
        undefined,
        signal.signal,
      );
    } catch (error) {
      failure = error;
    }
    expect((failure as Error).name).toBe('AbortError');
    const { serializeImportError } = await import('../services/import/import-error');
    const projected = localizeImportFeedback(serializeImportError(failure), 'en-US');
    expect(projected.message).toContain('canceled');
    expect(projected.message).not.toMatch(/\p{Script=Han}/u);
  });
});
