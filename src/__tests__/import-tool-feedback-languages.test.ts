import { conciseErrorText } from '../services/import/import-error-text';
import { ImportLibraryReader } from '../services/import/import-library-reader';
import { ImportStorageStatus } from '../services/import/import-storage-status';
import { chapterBatchSummary } from '../services/import/import-batch-state';
import type { ImportChapterBatch } from '../models/import-batch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportWorkerFixture } from './import-worker-fixture';
import {
  localizeImportFeedback,
  serializeImportError,
  importError,
} from '../services/import/import-error';
import { getDB } from '../utils/indexed-db';
import { ImportRepository } from '../services/import/import-repository';
import { ImportToolExecutor } from '../services/import/import-tool-executor';
import type { AppLocale } from '../models/locale';
import type { ImportRunContext } from '../models/import';
import type { AssistantExecutionCheckpoint } from '../services/ai/tasks/utils/assistant-execution';
import type { AIToolCall } from '../services/ai/types/ai-service';
afterEach(() => vi.restoreAllMocks());
async function fixture(locale: AppLocale) {
  const task = await ImportRepository.createTask();
  const run: ImportRunContext = { taskId: task.id, runId: 'run', runEpoch: 1, modelId: 'm' };
  await (
    await getDB()
  ).put('import-tasks', {
    ...task,
    state: 'running',
    run,
    runEpoch: 1,
    checkpoint: { uiLocale: locale, messages: [], remainingCalls: [], completedCallIds: [] },
  });
  const executor = new ImportToolExecutor(run);
  async function invoke(name: string, args: Record<string, unknown>) {
    const call: AIToolCall = {
      id: crypto.randomUUID(),
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    };
    const checkpoint: AssistantExecutionCheckpoint = {
      uiLocale: locale,
      messages: [],
      remainingCalls: [call],
      completedCallIds: [],
    };
    await ImportRepository.saveStep(task.id, {
      run,
      events: [
        { kind: 'tool-call', callId: call.id, toolName: name, data: call.function.arguments },
      ],
    });
    const outcome = await executor.execute(call, {
      afterResult: (result) => ({
        ...checkpoint,
        messages: [result],
        remainingCalls: [],
        completedCallIds: [call.id],
      }),
    });
    return JSON.parse(outcome.result!.content);
  }
  return { task, run, invoke };
}
describe('导入工具自有错误沿检查点语言', () => {
  it('章节读取失败返回模型时为简中、工作台事件按执行语言展示，目标书名原文保留', async () => {
    const { task, invoke } = await fixture('en-US');
    const failure = ImportLibraryReader.decodeChapter({
      chapterId: 'c',
      content: '[{}]',
      lastModified: '',
    });
    vi.spyOn(ImportLibraryReader, 'readBook').mockResolvedValue({
      kind: 'loaded',
      revision: 0,
      book: {
        id: 'b',
        title: '用户原书名',
        volumes: [{ id: 'v', title: 'V', chapters: [{ id: 'c', title: 'C' }] }],
      },
      chapters: { c: failure },
    } as never);
    const result = await invoke('get_chapter_info', { book_id: 'b', chapter_id: 'c' });
    expect(result.status).toBe('failed');
    expect(result.error.code).toBe('INVALID_CHAPTER_CONTENT');
    expect(result.error.message).toContain('段落或译文数据形状无效');
    // 失败保留可重投影的自有错误记录，工作台事件按检查点的英文展示
    const { items } = await ImportRepository.listEvents(task.id);
    const event = items.findLast(
      (item) => item.kind === 'tool-result' && item.toolName === 'get_chapter_info',
    )!;
    const shown = (event.data as { error: { message: string } }).error.message;
    expect(shown).toMatch(/paragraph/i);
    expect(shown).not.toMatch(/\p{Script=Han}/u);
  });

  it('无标题HTML诊断的自有摘要说明使用英文，状态码与外部标题保留', () => {
    expect(conciseErrorText('503 <html><body>gateway content</body></html>', 'en-US')).toBe(
      '503 The service returned an HTML error page',
    );
    expect(conciseErrorText('502 <html><title>外部标题</title></html>', 'en-US')).toBe(
      '502 外部标题',
    );
  });

  it('缺书与损坏读取保留自有错误身份，返回模型的说明为简中单源', async () => {
    const { invoke } = await fixture('en-US');
    const missing = await invoke('get_chapter_info', { book_id: 'missing', chapter_id: 'chapter' });
    expect(missing.error.message).toMatch(/\p{Script=Han}/u);
    const failure = ImportLibraryReader.decodeChapter({
      chapterId: 'c',
      content: '[{}]',
      lastModified: '',
    });
    expect(failure.kind).toBe('failed');
    vi.spyOn(ImportLibraryReader, 'readBook').mockResolvedValue(failure as never);
    const corrupt = await invoke('get_chapter_info', { book_id: 'b', chapter_id: 'c' });
    expect(corrupt.error.message).toContain('段落或译文数据形状无效');
  });
  it('存储失败自有提示可用英文，外部异常名称保留', async () => {
    let failure: unknown;
    try {
      await ImportStorageStatus.track('task', () =>
        Promise.reject(new DOMException('external diagnosis', 'QuotaExceededError')),
      );
    } catch (error) {
      failure = error;
    }
    const record = localizeImportFeedback(serializeImportError(failure), 'en-US');
    expect(record.code).toBe('STORAGE_FAILED');
    expect(record.message).toContain('storage');
    expect(record.message).not.toMatch(/\p{Script=Han}/u);
  });
  it('批次摘要保留错误语言身份且本地化后的摘要仍限制300字符', () => {
    const error = serializeImportError(
      importError('EMPTY_CONTENT', 'emptyContentNoBodyTextWasExtractedAdjust'),
    );
    const summary = chapterBatchSummary({
      id: 'batch',
      draftRevision: 1,
      items: [
        { chapter: { id: 'c', title: 'Source title' }, sourceId: 's', status: 'failed', error },
      ],
    } as unknown as ImportChapterBatch);
    const result = localizeImportFeedback(summary, 'en-US');
    expect(result.issues[0]!.error!.message).toContain('extracted');
    expect(result.issues[0]!.error!.message).not.toMatch(/\p{Script=Han}/u);
    const long = serializeImportError(
      importError('BOOK_READ_FAILED', 'bookReadFailedDetail', { value1: 'External '.repeat(100) }),
    );
    const longResult = localizeImportFeedback(
      chapterBatchSummary({
        id: 'batch',
        draftRevision: 1,
        items: [{ chapter: { id: 'c', title: 'T' }, sourceId: 's', status: 'failed', error: long }],
      } as unknown as ImportChapterBatch),
      'en-US',
    );
    expect(longResult.issues[0]!.error!.message.length).toBeLessThanOrEqual(300);
  });
  it('反馈投影保留日期、二进制和用户内容的原始JSON语义', () => {
    const input = {
      createdAt: new Date('2026-01-01'),
      bytes: new Uint8Array([1, 2]),
      note: '用户的自由文本',
    };
    expect(JSON.stringify(localizeImportFeedback(input, 'en-US'))).toBe(JSON.stringify(input));
  });

  it('方案冲突说明返回模型时为简中、工作台事件为英文，业务冲突码和最终确认限制保持', async () => {
    const { task, invoke } = await fixture('en-US');
    await invoke('rename_import_task', { name: 'Untranslated source title' });
    const result = await invoke('preview_import', { draft_revision: 0 });
    expect(result.success).toBe(true);
    expect(
      result.conflicts.some((entry: { code: string }) => entry.code === 'EMPTY_SELECTION'),
    ).toBe(true);
    for (const conflict of result.conflicts) expect(conflict.message).toMatch(/\p{Script=Han}/u);
    // 工作台展示的工具结果事件仍按检查点的英文投影
    const { items } = await ImportRepository.listEvents(task.id);
    const event = items.findLast(
      (item) => item.kind === 'tool-result' && item.toolName === 'preview_import',
    )!;
    const shown = (event.data as { conflicts: { code: string; message: string }[] }).conflicts;
    expect(shown.find((entry) => entry.code === 'EMPTY_SELECTION')!.message).not.toMatch(
      /\p{Script=Han}/u,
    );
    expect(await (await getDB()).count('books')).toBe(0);
  });

  it('Worker校验失败保留自有消息身份，英文投影不含简中诊断', async () => {
    const parser = new ImportParsingClient(() => new ImportWorkerFixture() as unknown as Worker);
    let failure: unknown;
    try {
      await parser.run({
        kind: 'content',
        text: 'abc',
        format: 'text',
        rules: { ranges: [{ start: 1, end: 100 }] },
      });
    } catch (error) {
      failure = error;
    }
    const stored = serializeImportError(failure);
    expect(stored.code).toBe('INVALID_RANGE');
    const localized = localizeImportFeedback(stored, 'en-US');
    expect(localized.message).toContain('out of bounds');
    expect(localized.message).not.toMatch(/\p{Script=Han}/u);
  });

  for (const [locale, missing, notAllowed] of [
    ['en-US', '缺失', '提供'],
    ['zh-TW', '缺失', '提供'],
    ['zh-CN', '缺失', '提供'],
  ] as const) {
    it(`${locale}参数校验与工具权限错误保留身份，返回模型的说明为简中单源`, async () => {
      const { invoke } = await fixture(locale);
      const invalid = await invoke('inspect_source', {});
      expect(invalid.error.code).toBe('INVALID_ARGUMENTS');
      expect(invalid.error.message).toContain(missing);
      const denied = await invoke('apply_import', {});
      expect(denied.error.code).toBe('TOOL_NOT_ALLOWED');
      expect(denied.error.message).toContain(notAllowed);
    });
  }
  it('来源范围校验返回模型的说明为简中单源，失败不会生成来源或书籍', async () => {
    const { invoke } = await fixture('en-US');
    const result = await invoke('inspect_source', { source_id: 'foreign-source' });
    expect(result.error.code).toBe('SOURCE_SCOPE');
    expect(result.error.message).toContain('来源不属于当前任务');
    expect(await (await getDB()).count('books')).toBe(0);
  });
});
