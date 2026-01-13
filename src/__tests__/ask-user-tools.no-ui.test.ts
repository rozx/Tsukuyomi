import './setup';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { askUserTools } from 'src/services/ai/tools/ask-user-tools';
import { useBooksStore } from 'src/stores/books';

describe('ask_user tool (no UI fallback)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    mock.restore();
  });

  it('当 window.__lunaAskUser 不存在时应返回明确错误', async () => {
    // 确保没有桥接
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};

    const tool = askUserTools.find((t) => t.definition.function.name === 'ask_user');
    expect(tool).toBeTruthy();

    const res = await tool!.handler(
      { question: '你是谁？' },
      {
        onAction: () => {},
      } as any,
    );

    const obj = JSON.parse(res) as { success: boolean; error?: string };
    expect(obj.success).toBe(false);
    expect(obj.error).toContain('AskUser UI 不可用');
  });

  it('当书籍启用 skipAskUser 时，应直接返回 cancelled 且不依赖 UI 桥接', async () => {
    const bookId = 'book-skip-ask-user-1';
    const booksStore = useBooksStore();
    booksStore.books = [
      {
        id: bookId,
        title: '测试书籍',
        lastEdited: new Date(),
        createdAt: new Date(),
        skipAskUser: true,
      } as any,
    ];
    booksStore.isLoaded = true;

    // 确保没有桥接
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};

    const tool = askUserTools.find((t) => t.definition.function.name === 'ask_user');
    expect(tool).toBeTruthy();

    const res = await tool!.handler(
      { question: '需要用户确认吗？' },
      {
        bookId,
        onAction: () => {},
      } as any,
    );

    const obj = JSON.parse(res) as { success: boolean; cancelled?: boolean; question?: string };
    expect(obj.success).toBe(false);
    expect(obj.cancelled).toBe(true);
    expect(obj.question).toBe('需要用户确认吗？');
  });

  it('ask_user_batch：当 window.__lunaAskUserBatch 不存在时应返回明确错误', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};

    const tool = askUserTools.find((t) => t.definition.function.name === 'ask_user_batch');
    expect(tool).toBeTruthy();

    const res = await tool!.handler(
      { questions: [{ question: 'Q1' }, { question: 'Q2' }] },
      {
        onAction: () => {},
      } as any,
    );

    const obj = JSON.parse(res) as { success: boolean; error?: string };
    expect(obj.success).toBe(false);
    expect(obj.error).toContain('AskUserBatch UI 不可用');
  });

  it('ask_user_batch：当书籍启用 skipAskUser 时，应直接返回 cancelled + answers=[] 且不依赖 UI 桥接', async () => {
    const bookId = 'book-skip-ask-user-batch-1';
    const booksStore = useBooksStore();
    booksStore.books = [
      {
        id: bookId,
        title: '测试书籍',
        lastEdited: new Date(),
        createdAt: new Date(),
        skipAskUser: true,
      } as any,
    ];
    booksStore.isLoaded = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};

    const tool = askUserTools.find((t) => t.definition.function.name === 'ask_user_batch');
    expect(tool).toBeTruthy();

    const res = await tool!.handler(
      { questions: [{ question: 'Q1' }, { question: 'Q2' }] },
      {
        bookId,
        onAction: () => {},
      } as any,
    );

    const obj = JSON.parse(res) as { success: boolean; cancelled?: boolean; answers?: unknown[] };
    expect(obj.success).toBe(false);
    expect(obj.cancelled).toBe(true);
    expect(Array.isArray(obj.answers)).toBe(true);
    expect(obj.answers?.length).toBe(0);
  });

  it('ask_user_batch：action 记录的 questions 应保持原始下标对齐（包含空问题占位）', async () => {
    const onAction = mock(() => {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      __lunaAskUserBatch: () => {
        return Promise.resolve({
          cancelled: false,
          answers: [
            { question_index: 0, answer: 'A1' },
            { question_index: 2, answer: 'A3' },
          ],
        });
      },
    };

    const tool = askUserTools.find((t) => t.definition.function.name === 'ask_user_batch');
    expect(tool).toBeTruthy();

    const res = await tool!.handler(
      { questions: [{ question: ' Q1 ' }, { question: '   ' }, { question: 'Q3' }] },
      {
        onAction,
      } as any,
    );

    const obj = JSON.parse(res) as { success: boolean; answers?: unknown[] };
    expect(obj.success).toBe(true);
    expect(Array.isArray(obj.answers)).toBe(true);

    expect(onAction).toHaveBeenCalled();
    const firstCall = (onAction.mock.calls[0] as unknown[])?.[0] as any;
    expect(firstCall?.data?.tool_name).toBe('ask_user_batch');
    // 保持原始长度与下标：第 2 题为空字符串占位
    expect(firstCall?.data?.questions).toEqual(['Q1', '', 'Q3']);
    expect(firstCall?.data?.answers).toEqual([
      { question_index: 0, answer: 'A1' },
      { question_index: 2, answer: 'A3' },
    ]);
  });
});

