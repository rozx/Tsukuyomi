import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { formatTaskDuration } from 'src/utils/time-utils';
import { createSaveNewBookHandler } from 'src/composables/shared/useBookImportActions';
import { taskCancelToasts, taskErrorToast } from 'src/composables/main-layout/task-status-toasts';
import { assertImportWorkspaceEnabled, FEATURES } from 'src/constants/features';
import { useSettingsStore } from 'src/stores/settings';
import { LocalizedError, localizedErrorCode } from 'src/utils/localized-error';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { AppLocale } from 'src/models/locale';

const CJK = /[぀-ヿ㐀-鿿]/;

function task(overrides: Partial<AIProcessingTask>): AIProcessingTask {
  return {
    id: 't1',
    type: 'translation',
    modelName: 'gpt-x',
    status: 'error',
    startTime: 0,
    ...overrides,
  } as AIProcessingTask;
}

describe('任务耗时按界面语言格式化', () => {
  it('默认保持简中原文', () => {
    expect(formatTaskDuration(0, 42_000)).toBe('42秒');
    expect(formatTaskDuration(0, 125_000)).toBe('2分5秒');
  });

  it('英文不含中日文字符', () => {
    expect(formatTaskDuration(0, 42_000, undefined, 'en-US')).toBe('42s');
    expect(formatTaskDuration(0, 125_000, undefined, 'en-US')).toBe('2m 5s');
  });

  it('繁中使用本地资源', () => {
    expect(formatTaskDuration(0, 125_000, undefined, 'zh-TW')).toBe('2分5秒');
  });
});

describe('AI 任务状态 toast 按界面语言渲染', () => {
  it('简中失败提示与原文逐字一致', () => {
    expect(taskErrorToast(task({ message: '超时' }), 'zh-CN')).toMatchObject({
      severity: 'error',
      summary: 'AI 任务失败',
      detail: 'gpt-x 执行翻译任务时出错：超时',
      life: 5000,
    });
    expect(taskErrorToast(task({ type: 'polish' }), 'zh-CN').detail).toBe(
      'gpt-x 执行润色任务时出错：未知错误',
    );
  });

  it('英文失败提示不含中日文字符（第三方错误原文除外）', () => {
    const toast = taskErrorToast(task({ type: 'proofreading' }), 'en-US');
    expect(toast.summary).toBe('AI task failed');
    expect(toast.detail).toBe('gpt-x failed during the proofreading task: Unknown error');
    expect(CJK.test(`${toast.summary}${toast.detail}`)).toBe(false);
  });

  it('取消提示：多个助手任务合并为一条，其余逐条', () => {
    const cancelled = [
      task({ id: 'a', type: 'assistant', status: 'cancelled' }),
      task({ id: 'b', type: 'assistant', status: 'cancelled' }),
      task({ id: 'c', type: 'config', status: 'cancelled' }),
    ];
    expect(taskCancelToasts(cancelled, 'zh-CN')).toEqual([
      { severity: 'warn', summary: 'AI 任务已取消', detail: '已取消 2 个助手任务', life: 3000 },
      {
        severity: 'warn',
        summary: 'AI 任务已取消',
        detail: 'gpt-x 的配置获取任务已取消',
        life: 3000,
      },
    ]);
    const en = taskCancelToasts(cancelled, 'en-US');
    expect(en.map((t) => t.detail)).toEqual([
      'Cancelled 2 assistant tasks',
      'gpt-x: config fetch task cancelled',
    ]);
    expect(en.every((t) => !CJK.test(`${t.summary}${t.detail}`))).toBe(true);
  });

  it('单个助手任务取消使用任务明细；空列表不提示', () => {
    const one = [task({ type: 'assistant', status: 'cancelled' })];
    expect(taskCancelToasts(one, 'zh-TW')[0]?.detail).toBe('gpt-x 的助手任務已取消');
    expect(taskCancelToasts([], 'en-US')).toEqual([]);
  });
});

describe('新增书籍成功提示按界面语言渲染', () => {
  beforeEach(() => setActivePinia(createPinia()));

  async function run(locale: AppLocale) {
    const add = vi.fn();
    const save = createSaveNewBookHandler({
      getUiLocale: () => locale,
      booksStore: { addBook: vi.fn(() => Promise.resolve()), deleteBook: vi.fn() } as never,
      coverHistoryStore: { addCover: vi.fn() } as never,
      toast: { add } as never,
    });
    await save({ title: '夜の書' });
    return add.mock.calls[0]?.[0] as { summary: string; detail: string };
  }

  it('简中与原文一致，英文不含固定中文（书名为用户内容保持原样）', async () => {
    expect(await run('zh-CN')).toMatchObject({
      summary: '添加成功',
      detail: '已成功添加书籍 "夜の書"',
    });
    const en = await run('en-US');
    expect(en.summary).toBe('Book added');
    expect(en.detail).toBe('Added book "夜の書"');
  });
});

describe('自有错误使用代码与本地化说明', () => {
  afterEach(() => {
    FEATURES.importWorkspace = true;
  });

  it('AI 导入关闭时抛出带代码的本地化错误', () => {
    FEATURES.importWorkspace = false;
    let error: unknown;
    try {
      assertImportWorkspaceEnabled();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LocalizedError);
    expect(localizedErrorCode(error)).toBe('IMPORT_DISABLED');
    expect((error as Error).message).toBe(
      'IMPORT_DISABLED: 当前版本已关闭 AI 导入，已有任务与小说均已保留',
    );
    expect(CJK.test((error as LocalizedError).messageFor('en-US'))).toBe(false);
  });

  it('不支持的界面语言抛出带代码的本地化错误', async () => {
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    const error = await settings.setUiLocale('fr-FR' as AppLocale).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LocalizedError);
    expect(localizedErrorCode(error)).toBe('UNSUPPORTED_UI_LOCALE');
    expect((error as Error).message).toBe('不支持的界面语言');
    expect((error as LocalizedError).messageFor('en-US')).toBe('Unsupported interface language');
  });
});
