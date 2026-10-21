/**
 * get_special_instructions / update_special_instructions：
 * 助手可查看并修改书籍级、章节级的翻译 / 润色 / 校对特殊指令，用来矫正后续翻译。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import type { ActionInfo } from '../services/ai/tools/types';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { ChapterService } from '../services/chapter-service';
import { useBooksStore } from '../stores/books';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';

const BOOK = 'fixture-book';

afterEach(() => vi.restoreAllMocks());

async function setup() {
  const chapter = translationChapter('c', '11111111');
  chapter.translationInstructions = '章节：保留敬语';
  await chapterTranslationFixture([chapter]);
  await useBooksStore().updateBook(BOOK, { translationInstructions: '书籍：保留「」' });
}

async function run(name: string, args: Record<string, unknown>, actions: ActionInfo[] = []) {
  const result = await ToolRegistry.handleToolCall(
    { id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } },
    {
      bookId: BOOK,
      languages: captureExecutionLanguages('zh-CN', 'zh-CN'),
      onAction: (action) => actions.push(action),
    },
  );
  return JSON.parse(result.content) as Record<string, unknown>;
}

function book() {
  return useBooksStore().getBookById(BOOK)!;
}

function chapter() {
  return ChapterService.findChapterById(book(), 'c')!.chapter;
}

describe('get_special_instructions', () => {
  it('返回书籍级指令，未传 chapter_id 时不返回章节级', async () => {
    await setup();
    const result = await run('get_special_instructions', {});
    expect(result.success).toBe(true);
    expect(result.book_instructions).toEqual({
      translation: '书籍：保留「」',
      polish: '',
      proofreading: '',
    });
    expect(result.chapter_instructions).toBeUndefined();
  });

  it('传 chapter_id 时一并返回章节级指令', async () => {
    await setup();
    const result = await run('get_special_instructions', { chapter_id: 'c' });
    expect(result.chapter_instructions).toEqual({
      chapter_id: 'c',
      translation: '章节：保留敬语',
      polish: '',
      proofreading: '',
    });
  });

  it('章节不存在时返回错误', async () => {
    await setup();
    const result = await run('get_special_instructions', { chapter_id: 'missing' });
    expect(result.success).toBe(false);
  });
});

describe('update_special_instructions', () => {
  it('书籍级默认追加到原指令末尾（换行分隔）', async () => {
    await setup();
    const actions: ActionInfo[] = [];
    const result = await run(
      'update_special_instructions',
      { scope: 'book', task: 'translation', instructions: '「」不要改成“”' },
      actions,
    );
    expect(result.success).toBe(true);
    expect(result.old_instructions).toBe('书籍：保留「」');
    expect(result.new_instructions).toBe('书籍：保留「」\n「」不要改成“”');
    expect(book().translationInstructions).toBe('书籍：保留「」\n「」不要改成“”');
    expect(actions).toEqual([expect.objectContaining({ type: 'update', entity: 'book' })]);
  });

  it('原指令为空时追加不带多余换行', async () => {
    await setup();
    await run('update_special_instructions', {
      scope: 'book',
      task: 'polish',
      instructions: '语气轻松',
    });
    expect(book().polishInstructions).toBe('语气轻松');
  });

  it('章节级 replace 只改该章节，不动书籍级', async () => {
    await setup();
    const actions: ActionInfo[] = [];
    const result = await run(
      'update_special_instructions',
      {
        scope: 'chapter',
        chapter_id: 'c',
        task: 'translation',
        mode: 'replace',
        instructions: '  新规则  ',
      },
      actions,
    );
    expect(result.success).toBe(true);
    expect(chapter().translationInstructions).toBe('新规则');
    expect(book().translationInstructions).toBe('书籍：保留「」');
    expect(actions).toEqual([expect.objectContaining({ type: 'update', entity: 'chapter' })]);
  });

  it('replace 为空串时清除指令', async () => {
    await setup();
    await run('update_special_instructions', {
      scope: 'chapter',
      chapter_id: 'c',
      task: 'translation',
      mode: 'replace',
      instructions: '',
    });
    expect(chapter().translationInstructions).toBe('');
  });

  it('参数非法时返回错误且不写入', async () => {
    await setup();
    const invalid = [
      { scope: 'volume', task: 'translation', instructions: 'x' },
      { scope: 'book', task: 'explain', instructions: 'x' },
      { scope: 'book', task: 'translation' },
      { scope: 'book', task: 'translation', mode: 'merge', instructions: 'x' },
      { scope: 'book', task: 'translation', instructions: '   ' },
      { scope: 'chapter', task: 'translation', instructions: 'x' },
      { scope: 'chapter', chapter_id: 'missing', task: 'translation', instructions: 'x' },
    ];
    for (const args of invalid) {
      const result = await run('update_special_instructions', args);
      expect(result.success, JSON.stringify(args)).toBe(false);
    }
    expect(book().translationInstructions).toBe('书籍：保留「」');
    expect(chapter().translationInstructions).toBe('章节：保留敬语');
  });
});

describe('工具可用范围', () => {
  const names = (tools: { function: { name: string } }[]) => tools.map((t) => t.function.name);

  it('助手可查看与修改特殊指令', () => {
    const tools = names(ToolRegistry.getAssistantToolsExcludingTranslationManagement(BOOK));
    expect(tools).toContain('get_special_instructions');
    expect(tools).toContain('update_special_instructions');
  });

  it('翻译 / 润色 / 校对任务不暴露修改指令工具', () => {
    const tools = names(ToolRegistry.getTranslationTools(BOOK, undefined));
    expect(tools).not.toContain('update_special_instructions');
    expect(names(ToolRegistry.getSingleParagraphPolishTools(BOOK))).not.toContain(
      'update_special_instructions',
    );
  });
});
