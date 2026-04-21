import './setup';
import { describe, expect, it } from 'bun:test';
import {
  appendAskUserBatchDetails,
  appendWebDetails,
  appendTodoDetails,
  appendSearchDetails,
} from 'src/utils/action-info/simple-details';
import type { ActionDetail } from 'src/utils/action-info/types';
import type { MessageAction } from 'src/stores/chat-sessions';

function makeAction(over: Partial<MessageAction>): MessageAction {
  return {
    type: 'read',
    entity: 'chapter',
    timestamp: 0,
    ...over,
  } as MessageAction;
}

describe('appendAskUserBatchDetails', () => {
  it('同时含 questions 和 answers 时输出数量 + 每题预览', () => {
    const details: ActionDetail[] = [];
    appendAskUserBatchDetails(
      details,
      makeAction({
        type: 'ask',
        entity: 'user',
        batch_questions: ['Q1', 'Q2'],
        batch_answers: [
          { question_index: 0, answer: 'A1' },
          { question_index: 1, answer: 'A2' },
        ],
      }),
    );
    expect(details[0]).toEqual({ label: '问题数量', value: '2 题' });
    expect(details[1]).toEqual({ label: '第 1 题', value: 'Q1 → A1' });
    expect(details[2]).toEqual({ label: '第 2 题', value: 'Q2 → A2' });
  });

  it('answer 超过 120 字时截断并追加省略号', () => {
    const long = 'x'.repeat(200);
    const details: ActionDetail[] = [];
    appendAskUserBatchDetails(
      details,
      makeAction({
        type: 'ask',
        entity: 'user',
        batch_questions: ['Q1'],
        batch_answers: [{ question_index: 0, answer: long }],
      }),
    );
    expect(details[1]?.value.endsWith('...')).toBe(true);
    expect(details[1]?.value.length).toBe('Q1 → '.length + 120 + 3);
  });

  it('question_index 超出 questions 范围时用 "#N" 作为问题占位', () => {
    const details: ActionDetail[] = [];
    appendAskUserBatchDetails(
      details,
      makeAction({
        type: 'ask',
        entity: 'user',
        batch_questions: [],
        batch_answers: [{ question_index: 4, answer: 'A' }],
      }),
    );
    expect(details[0]).toEqual({ label: '问题数量', value: '0 题' });
    expect(details[1]?.value).toBe('#5 → A');
    expect(details[1]?.label).toBe('第 5 题');
  });

  it('字段全缺时只输出「问题数量: 0 题」', () => {
    const details: ActionDetail[] = [];
    appendAskUserBatchDetails(details, makeAction({ type: 'ask', entity: 'user' }));
    expect(details).toHaveLength(1);
    expect(details[0]).toEqual({ label: '问题数量', value: '0 题' });
  });

  it('answer 长度恰好等于 120 字时不截断', () => {
    const exact = 'y'.repeat(120);
    const details: ActionDetail[] = [];
    appendAskUserBatchDetails(
      details,
      makeAction({
        type: 'ask',
        entity: 'user',
        batch_questions: ['Q1'],
        batch_answers: [{ question_index: 0, answer: exact }],
      }),
    );
    expect(details[1]?.value.endsWith('...')).toBe(false);
    expect(details[1]?.value).toBe(`Q1 → ${exact}`);
  });
});

describe('appendWebDetails', () => {
  it('web_search 带 query 时输出搜索查询', () => {
    const details: ActionDetail[] = [];
    appendWebDetails(
      details,
      makeAction({ type: 'web_search', entity: 'web', query: 'hello' }),
    );
    expect(details).toEqual([{ label: '搜索查询', value: 'hello' }]);
  });

  it('web_fetch 带 url 时输出网页 URL', () => {
    const details: ActionDetail[] = [];
    appendWebDetails(
      details,
      makeAction({ type: 'web_fetch', entity: 'web', url: 'http://x' }),
    );
    expect(details).toEqual([{ label: '网页 URL', value: 'http://x' }]);
  });

  it('entity 非 web 或字段缺失时不输出', () => {
    const details: ActionDetail[] = [];
    appendWebDetails(details, makeAction({ type: 'web_search', entity: 'web' }));
    appendWebDetails(
      details,
      makeAction({ type: 'web_search', entity: 'chapter', query: 'x' }),
    );
    appendWebDetails(details, makeAction({ type: 'web_fetch', entity: 'web' }));
    expect(details).toEqual([]);
  });
});

describe('appendTodoDetails', () => {
  it('entity=todo 且有 name 时输出内容', () => {
    const details: ActionDetail[] = [];
    appendTodoDetails(details, makeAction({ entity: 'todo', name: '买菜' }));
    expect(details).toEqual([{ label: '内容', value: '买菜' }]);
  });

  it('entity 非 todo 或缺 name 时不输出', () => {
    const details: ActionDetail[] = [];
    appendTodoDetails(details, makeAction({ entity: 'chapter', name: 'x' }));
    appendTodoDetails(details, makeAction({ entity: 'todo' }));
    expect(details).toEqual([]);
  });
});

describe('appendSearchDetails', () => {
  it('search_chapter_summaries 带 keywords 时输出搜索关键词（中文顿号连接）', () => {
    const details: ActionDetail[] = [];
    appendSearchDetails(
      details,
      makeAction({
        tool_name: 'search_chapter_summaries',
        keywords: ['主角', '魔法'],
      }),
    );
    expect(details).toEqual([{ label: '搜索关键词', value: '主角、魔法' }]);
  });

  it('search_chapter_summaries 空 keywords / 缺失时不输出', () => {
    const details: ActionDetail[] = [];
    appendSearchDetails(
      details,
      makeAction({ tool_name: 'search_chapter_summaries', keywords: [] }),
    );
    appendSearchDetails(details, makeAction({ tool_name: 'search_chapter_summaries' }));
    expect(details).toEqual([]);
  });

  it('search_help_docs 同时有 query 和 name 时输出两条', () => {
    const details: ActionDetail[] = [];
    appendSearchDetails(
      details,
      makeAction({ tool_name: 'search_help_docs', query: '如何导入', name: '导入指南' }),
    );
    expect(details).toEqual([
      { label: '搜索查询', value: '如何导入' },
      { label: '命中文档', value: '导入指南' },
    ]);
  });

  it('search_help_docs 仅 query 时只输出查询', () => {
    const details: ActionDetail[] = [];
    appendSearchDetails(
      details,
      makeAction({ tool_name: 'search_help_docs', query: 'q' }),
    );
    expect(details).toEqual([{ label: '搜索查询', value: 'q' }]);
  });

  it('未知 tool_name 不输出', () => {
    const details: ActionDetail[] = [];
    appendSearchDetails(details, makeAction({ tool_name: 'unknown' }));
    expect(details).toEqual([]);
  });
});
